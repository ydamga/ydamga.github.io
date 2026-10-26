"""ÖSYM sınav takvimindeki bütün sınavları çeker ve data/osym.json dosyasına yazar.

Ana sayfa bu dosyadan sonraki sınavları ve o güne düşen başvuru uyarılarını gösterir.
Yalnızca tarihi geçmemiş sınavlar (başvurusu ya da sınavı ileride olanlar) yazılır.

Hatırlatma günlerinde (başvurudan 7 gün önce, başvuru günü, bitişten 3 gün önce) Web Push ile
masaüstü bildirimi de gönderilir. Ortam değişkenleri: VAPID_PRIVATE_KEY ve PUSH_SUBSCRIPTIONS
(sitedeki "Bildirimleri aç" düğmesinin verdiği JSON; her abonelik ayrı satırda).
Gönderilen bildirimler osym.json içinde tutulur; görev aynı gün tekrar çalışırsa yeniden gönderilmez.
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

TAKVIM_URL = "https://www.osym.gov.tr/Sayfa/SinavTakvimi"
VERI = Path(__file__).resolve().parent.parent / "data" / "osym.json"
TR = timezone(timedelta(hours=3))  # Türkiye yaz saati uygulamıyor
ONCE_GUN, BITIS_GUN = 7, 3  # index.html'deki ONCE/BITIS ile aynı olmalı
SITE = "https://ydamga.github.io"


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
    return tarih_oku(parcalar[0], gun_sonu=False), tarih_oku(parcalar[-1], gun_sonu=True)


def iso(t):
    return t.isoformat() if t else None


def takvimi_cek():
    istek = urllib.request.Request(TAKVIM_URL, headers={"User-Agent": "Mozilla/5.0 (osym-takip; ydamga.github.io)"})
    with urllib.request.urlopen(istek, timeout=60) as yanit:
        html = yanit.read().decode("utf-8", errors="replace")
    p = TakvimParser()
    p.feed(html)
    return p.satirlar


def sinavlari_ayikla(satirlar, simdi):
    sinavlar = []
    for s in satirlar:
        h = s["hucreler"]
        bas, bit = aralik_oku(h.get("Başvuru Tarihi"))
        _, gec_bit = aralik_oku(h.get("Geç Başvuru Tarihi"))
        sinav, _ = aralik_oku(h.get("Sınav Tarihi"))
        if not bas and not sinav:
            continue  # yalnızca tercih/yerleştirme satırı
        son = max(t for t in (bit, gec_bit, sinav) if t)
        if son.date() < simdi.date():
            continue
        kod = s["attrs"].get("data-sinavad", "").strip()
        sinavlar.append({
            "kod": kod,
            "ad": s["baslik"] or kod,
            "link": "https://www.osym.gov.tr" + s["link"] if s["link"] else TAKVIM_URL,
            "basvuru_baslangic": iso(bas),
            "basvuru_bitis": iso(bit),
            "gec_basvuru_bitis": iso(gec_bit),
            "sinav_tarihi": sinav.date().isoformat() if sinav else None,
        })
    sinavlar.sort(key=lambda x: x["sinav_tarihi"] or x["basvuru_baslangic"])
    return sinavlar


def bugunun_hatirlatmalari(sinavlar, bugun):
    for s in sinavlar:
        if not s["basvuru_baslangic"]:
            continue
        bas = datetime.fromisoformat(s["basvuru_baslangic"]).date()
        bit_t = datetime.fromisoformat(s["basvuru_bitis"])
        bitis = bit_t.strftime("%d.%m.%Y %H:%M")
        if bas - timedelta(days=ONCE_GUN) == bugun:
            yield s, "once", f"Başvuru 1 hafta sonra başlıyor: {bas:%d.%m.%Y}"
        elif bas == bugun:
            yield s, "basladi", f"Başvuru bugün başladı. Son gün: {bitis}"
        elif bit_t.date() - timedelta(days=BITIS_GUN) == bugun:
            yield s, "bitiyor", f"Başvurunun bitmesine {BITIS_GUN} gün kaldı. Son gün: {bitis}"


def abonelikleri_oku():
    ham = os.environ.get("PUSH_SUBSCRIPTIONS", "").strip()
    if not ham:
        return []
    if ham.startswith("["):
        return json.loads(ham)
    return [json.loads(satir) for satir in ham.splitlines() if satir.strip()]


def bildirim_gonder(abonelikler, baslik, govde, url, etiket):
    from pywebpush import WebPushException, webpush

    veri = json.dumps({"baslik": baslik, "govde": govde, "url": url, "etiket": etiket}, ensure_ascii=False)
    basarili = 0
    for a in abonelikler:
        try:
            webpush(a, veri, vapid_private_key=os.environ["VAPID_PRIVATE_KEY"], vapid_claims={"sub": SITE})
            basarili += 1
        except (WebPushException, OSError) as h:
            # 404/410: abonelik iptal edilmiş; secret'tan silinmeli
            yanit = getattr(h, "response", None)
            kod = yanit.status_code if yanit is not None else type(h).__name__
            print(f"Bildirim gönderilemedi ({kod}): {a.get('endpoint', '')[:60]}…")
    return basarili


def main():
    satirlar = takvimi_cek()
    if not satirlar:
        sys.exit("ÖSYM takvim tablosu okunamadı; sayfa yapısı değişmiş olabilir.")

    simdi = datetime.now(TR)
    bugun = simdi.date()
    sinavlar = sinavlari_ayikla(satirlar, simdi)
    eski = json.loads(VERI.read_text(encoding="utf-8")) if VERI.exists() else {}
    # yalnızca son bir haftanın kayıtları tutulur
    sinir = (bugun - timedelta(days=7)).isoformat()
    bildirilen = {k for k in eski.get("bildirilen", []) if k[:10] >= sinir}

    abonelikler = abonelikleri_oku()
    gonderilen = 0
    for s, tur, govde in bugunun_hatirlatmalari(sinavlar, bugun):
        k = f"{bugun.isoformat()}|{s['kod']}|{s['ad']}|{tur}"
        if k in bildirilen:
            continue
        print(f"Hatırlatma: {s['ad']} — {govde}")
        if not abonelikler or not os.environ.get("VAPID_PRIVATE_KEY"):
            continue
        if bildirim_gonder(abonelikler, s["ad"], govde, s["link"], k):
            bildirilen.add(k)
            gonderilen += 1

    VERI.parent.mkdir(exist_ok=True)
    VERI.write_text(json.dumps({
        "guncellendi": simdi.isoformat(timespec="minutes"),
        "sinavlar": sinavlar,
        "bildirilen": sorted(bildirilen),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(satirlar)} satır okundu, {len(sinavlar)} güncel sınav yazıldı, "
          f"{gonderilen} bildirim gönderildi ({len(abonelikler)} abonelik).")


if __name__ == "__main__":
    main()
