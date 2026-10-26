"""ÖSYM sınav takviminden seçili sınavların başvuru tarihlerini çeker,
data/osym.json dosyasını günceller ve zamanı gelen hatırlatmaları e-postayla gönderir.

Hatırlatmalar: başvurudan N gün önce, başvuru günü, bitişten M gün önce.
Gönderilen hatırlatmalar osym.json içinde tutulur; aynı hatırlatma iki kez gitmez.
ÖSYM tarihi değiştirirse yeni tarih için yeni hatırlatma oluşur.

E-posta için ortam değişkenleri: GMAIL_USER, GMAIL_APP_PASSWORD, isteğe bağlı MAIL_TO.
Bunlar yoksa hatırlatmalar yalnızca ekrana yazılır.
"""

import json
import os
import smtplib
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from html.parser import HTMLParser
from pathlib import Path

TAKVIM_URL = "https://www.osym.gov.tr/Sayfa/SinavTakvimi"
KOK = Path(__file__).resolve().parent.parent
CONFIG = KOK / "osym" / "config.json"
VERI = KOK / "data" / "osym.json"
TR = timezone(timedelta(hours=3))  # Türkiye yaz saati uygulamıyor
GECIKME_TOLERANSI = 3  # görev birkaç gün çalışamazsa kaçan hatırlatmaları yine de gönder


class TakvimParser(HTMLParser):
    """stTakvimListTable tablosundaki satırları sözlük listesine çevirir."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.satirlar = []
        self.satir = None
        self.hucre = None  # o an okunan hücrenin data-label değeri
        self.div = None  # sınav adı hücresindeki alt div sınıfı

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "tr" and "st-takvim-list-row" in (a.get("class") or ""):
            self.satir = {"attrs": a, "hucreler": {}, "link": None, "baslik": ""}
        elif self.satir is None:
            return
        elif tag == "td":
            self.hucre = a.get("data-label", "")
            self.satir["hucreler"][self.hucre] = ""
        elif tag == "br" and self.hucre is not None:
            self.satir["hucreler"][self.hucre] += "\n"
        elif tag == "a" and self.satir["link"] is None:
            self.satir["link"] = a.get("href")
        elif tag == "div":
            self.div = a.get("class")

    def handle_endtag(self, tag):
        if self.satir is None:
            return
        if tag == "td":
            self.hucre = None
        elif tag == "div":
            self.div = None
        elif tag == "tr":
            self.satirlar.append(self.satir)
            self.satir = None

    def handle_data(self, data):
        if self.satir is None or self.hucre is None:
            return
        self.satir["hucreler"][self.hucre] += data
        if self.div == "st-takvim-list-sinav-adi":
            self.satir["baslik"] += data.strip()


def tarih_oku(metin, gun_sonu):
    """'07.01.2026 14:00' ya da '04.02.2026' → datetime. Saat yoksa gün başı/sonu."""
    metin = metin.strip()
    for bicim in ("%d.%m.%Y %H:%M", "%d.%m.%Y"):
        try:
            t = datetime.strptime(metin, bicim).replace(tzinfo=TR)
        except ValueError:
            continue
        if bicim == "%d.%m.%Y" and gun_sonu:
            t = t.replace(hour=23, minute=59)
        return t
    return None


def aralik_oku(hucre):
    parcalar = [p.strip() for p in (hucre or "").split("\n") if p.strip() and p.strip() != "-"]
    if not parcalar:
        return None, None
    bas = tarih_oku(parcalar[0], gun_sonu=False)
    bit = tarih_oku(parcalar[-1], gun_sonu=True)
    return bas, bit


def takvimi_cek():
    istek = urllib.request.Request(TAKVIM_URL, headers={"User-Agent": "Mozilla/5.0 (osym-takip; ydamga.github.io)"})
    with urllib.request.urlopen(istek, timeout=60) as yanit:
        html = yanit.read().decode("utf-8", errors="replace")
    p = TakvimParser()
    p.feed(html)
    return p.satirlar


def sinavlari_ayikla(satirlar, takip):
    takip = {s.strip().casefold() for s in takip}
    sinavlar = []
    for s in satirlar:
        kod = s["attrs"].get("data-sinavad", "").strip()
        if kod.casefold() not in takip or s["attrs"].get("data-has-basvuru") != "1":
            continue
        h = s["hucreler"]
        bas, bit = aralik_oku(h.get("Başvuru Tarihi"))
        if not bas:
            continue
        gec_bas, gec_bit = aralik_oku(h.get("Geç Başvuru Tarihi"))
        sinav_bas, _ = aralik_oku(h.get("Sınav Tarihi"))
        sinavlar.append({
            "kod": kod,
            "ad": s["baslik"] or kod,
            "link": "https://www.osym.gov.tr" + s["link"] if s["link"] else TAKVIM_URL,
            "basvuru_baslangic": bas.isoformat(),
            "basvuru_bitis": bit.isoformat(),
            "gec_basvuru_bitis": gec_bit.isoformat() if gec_bit else None,
            "sinav_tarihi": sinav_bas.date().isoformat() if sinav_bas else None,
        })
    sinavlar.sort(key=lambda x: x["basvuru_baslangic"])
    return sinavlar


def hatirlatmalar(sinav, once_gun, bitis_gun):
    bas = datetime.fromisoformat(sinav["basvuru_baslangic"]).date()
    bit = datetime.fromisoformat(sinav["basvuru_bitis"]).date()
    return [
        ("once", bas - timedelta(days=once_gun), f"{sinav['ad']}: başvuru {once_gun} gün sonra başlıyor"),
        ("basladi", bas, f"{sinav['ad']}: başvuru bugün başladı"),
        ("bitiyor", bit - timedelta(days=bitis_gun), f"{sinav['ad']}: başvurunun bitmesine {bitis_gun} gün kaldı"),
    ]


def tarih_yaz(iso):
    t = datetime.fromisoformat(iso)
    return t.strftime("%d.%m.%Y %H:%M")


def mail_gonder(konu, govde):
    kullanici = os.environ.get("GMAIL_USER")
    sifre = os.environ.get("GMAIL_APP_PASSWORD")
    if not kullanici or not sifre:
        print("[mail yok, GMAIL_USER/GMAIL_APP_PASSWORD tanımlı değil]\n" + konu + "\n" + govde)
        return False
    msg = EmailMessage()
    msg["Subject"] = konu
    msg["From"] = kullanici
    msg["To"] = os.environ.get("MAIL_TO") or kullanici
    msg.set_content(govde)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(kullanici, sifre)
        smtp.send_message(msg)
    return True


def main():
    ayar = json.loads(CONFIG.read_text(encoding="utf-8"))
    once_gun = ayar.get("basvurudan_once_gun", 7)
    bitis_gun = ayar.get("bitisten_once_gun", 3)

    satirlar = takvimi_cek()
    if not satirlar:
        sys.exit("ÖSYM takvim tablosu okunamadı; sayfa yapısı değişmiş olabilir.")

    sinavlar = sinavlari_ayikla(satirlar, ayar["sinavlar"])
    eski = json.loads(VERI.read_text(encoding="utf-8")) if VERI.exists() else {}
    gonderilen = set(eski.get("gonderilen", []))

    simdi = datetime.now(TR)
    bugun = simdi.date()
    yeni = []
    for s in sinavlar:
        for tur, gun, mesaj in hatirlatmalar(s, once_gun, bitis_gun):
            anahtar = f"{s['kod']}|{s['ad']}|{tur}|{gun.isoformat()}"
            if anahtar in gonderilen or not (0 <= (bugun - gun).days <= GECIKME_TOLERANSI):
                continue
            yeni.append((anahtar, mesaj, s))

    if yeni:
        konu = "ÖSYM hatırlatma: " + "; ".join(m for _, m, _ in yeni)
        govde = "\n\n".join(
            f"{m}\nBaşvuru: {tarih_yaz(s['basvuru_baslangic'])} – {tarih_yaz(s['basvuru_bitis'])}"
            + (f"\nSınav: {s['sinav_tarihi']}" if s["sinav_tarihi"] else "")
            + f"\n{s['link']}"
            for _, m, s in yeni
        ) + f"\n\nTakvim: {TAKVIM_URL}"
        if mail_gonder(konu[:200], govde):
            gonderilen.update(a for a, _, _ in yeni)

    # Sitede yalnızca başvurusu bitmemiş sınavlar gösterilir
    gorunur = [s for s in sinavlar if datetime.fromisoformat(s["gec_basvuru_bitis"] or s["basvuru_bitis"]) >= simdi]
    VERI.parent.mkdir(exist_ok=True)
    VERI.write_text(json.dumps({
        "guncellendi": simdi.isoformat(timespec="minutes"),
        "basvurudan_once_gun": once_gun,
        "bitisten_once_gun": bitis_gun,
        "sinavlar": gorunur,
        "gonderilen": sorted(gonderilen),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(sinavlar)} sınav bulundu, {len(gorunur)} tanesi gösteriliyor, {len(yeni)} hatırlatma gönderildi.")


if __name__ == "__main__":
    main()
