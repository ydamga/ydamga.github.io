"""ÖSYM sınav takvimindeki bütün sınavları çeker ve data/osym.json dosyasına yazar.

Ana sayfa bu dosyadan sonraki sınavları ve o güne düşen başvuru uyarılarını gösterir;
Cloudflare Worker (worker/osym-bildirim.js) da aynı dosyadan masaüstü bildirimlerini gönderir.
Yalnızca tarihi geçmemiş sınavlar (başvurusu ya da sınavı ileride olanlar) yazılır.
"""

import json
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

TAKVIM_URL = "https://www.osym.gov.tr/Sayfa/SinavTakvimi"
VERI = Path(__file__).resolve().parent.parent / "data" / "osym.json"
TR = timezone(timedelta(hours=3))  # Türkiye yaz saati uygulamıyor


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


def main():
    satirlar = takvimi_cek()
    if not satirlar:
        sys.exit("ÖSYM takvim tablosu okunamadı; sayfa yapısı değişmiş olabilir.")

    simdi = datetime.now(TR)
    sinavlar = sinavlari_ayikla(satirlar, simdi)
    VERI.parent.mkdir(exist_ok=True)
    VERI.write_text(json.dumps({
        "guncellendi": simdi.isoformat(timespec="minutes"),
        "sinavlar": sinavlar,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(satirlar)} satır okundu, {len(sinavlar)} güncel sınav yazıldı.")


if __name__ == "__main__":
    main()
