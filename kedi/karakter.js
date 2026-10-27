// Ekip kedisinin çizimi (SVG) ve kendi alanında dolaşması. Durumu bilmez; kedi/ana.js ve kedi/oda.js
// ihtiyaçlardan çıkan işaretleri guncelle() ile verir.
//
// Hareketler CSS'te (kedi/kedi.css). JavaScript yalnızca bir sonraki davranışı seçer ve pozu bir sınıfla
// değiştirir; yürüme tek bir transform geçişidir. Sürekli çalışan bir döngü yoktur, sekme gizliyken durur.
// "Hareketi azalt" tercihinde kedi yerinde kalır, yalnızca durumuna göre pozu değişir.
(function () {
  var SVG =
    '<svg class="kedi-svg" viewBox="0 0 120 84" aria-hidden="true" focusable="false">' +
      '<ellipse class="k-golge" cx="58" cy="80" rx="36" ry="3.5"/>' +
      '<g class="k-kuyruk"><path d="M28 54C14 52 7 38 13 25" class="k-kuyruk-c"/><path d="M14.5 29C13 27 12.6 25.4 13 25" class="k-kuyruk-uc"/></g>' +
      '<rect class="k-bacak k-uzak k-a" x="37" y="58" width="8" height="21" rx="4"/>' +
      '<rect class="k-bacak k-uzak k-b" x="74" y="58" width="8" height="21" rx="4"/>' +
      '<g class="k-vucut">' +
        '<ellipse class="k-tuy" cx="56" cy="54" rx="32" ry="17"/>' +
        '<ellipse class="k-krem" cx="62" cy="61" rx="19" ry="8"/>' +
        '<path class="k-cizgi" d="M42 39q2.5 5.5 0 11M53 37.5q2.5 6 0 12M64 38.5q2.5 5.5 0 11"/>' +
        '<g class="k-leke"><circle cx="47" cy="52" r="2"/><circle cx="68" cy="47" r="1.6"/><circle cx="38" cy="60" r="1.4"/><circle cx="58" cy="64" r="1.5"/></g>' +
        '<g class="k-bas">' +
          '<path class="k-kulak k-kulak-sol k-tuy" d="M77 30 80 11 91 24Z"/>' +
          '<path class="k-kulak k-kulak-sag k-tuy" d="M93 24 104 11 106 31Z"/>' +
          '<path class="k-kulak-ic" d="M80.5 25 82 16 87.5 23ZM96.5 23 102 16 103 26Z"/>' +
          '<circle class="k-tuy" cx="92" cy="37" r="17"/>' +
          '<ellipse class="k-krem" cx="97" cy="44" rx="9" ry="6.5"/>' +
          '<path class="k-kas" d="M84.5 28.5 90 30.5M101.5 30.5 107 28.5"/>' +
          '<g class="k-goz-acik"><ellipse cx="88" cy="34.5" rx="2.6" ry="3.6"/><ellipse cx="102" cy="34.5" rx="2.6" ry="3.6"/>' +
            '<circle class="k-isilti" cx="88.9" cy="33.2" r="0.9"/><circle class="k-isilti" cx="102.9" cy="33.2" r="0.9"/></g>' +
          '<path class="k-goz-kapali" d="M85 35q3 2.6 6 0M99 35q3 2.6 6 0"/>' +
          '<path class="k-goz-mutlu" d="M85 36q3-3.6 6 0M99 36q3-3.6 6 0"/>' +
          '<path class="k-burun" d="M93.4 40.4h4.2L95.5 43Z"/>' +
          '<path class="k-agiz" d="M95.5 43q-1.6 2.8-4 1.6M95.5 43q1.6 2.8 4 1.6"/>' +
          '<path class="k-agiz-uzgun" d="M92 47q3.5-2.6 7 0"/>' +
          '<ellipse class="k-agiz-acik" cx="95.5" cy="46.4" rx="3" ry="3.8"/>' +
          '<ellipse class="k-dil" cx="95.5" cy="47.6" rx="2" ry="2.6"/>' +
          '<path class="k-biyik" d="M103 42.5 115 40.5M103 45 115 46.5M86 43 76 41.5M86 45.5 76 46.5"/>' +
        '</g>' +
      '</g>' +
      '<rect class="k-bacak k-yakin k-b" x="31" y="60" width="9" height="20" rx="4.5"/>' +
      '<rect class="k-bacak k-yakin k-a" x="67" y="60" width="9" height="20" rx="4.5"/>' +
    '</svg>';

  var IKON = {
    mama: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18l-2 7H5z" class="i-dolu"/><circle cx="8" cy="10" r="1.6"/><circle cx="12" cy="9" r="1.6"/><circle cx="16" cy="10" r="1.6"/></svg>',
    top: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" class="i-dolu"/><path d="M5 9c4 2 10 2 14 0M5 15c4-2 10-2 14 0" class="i-cizgi"/></svg>',
    parilti: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" class="i-dolu"/></svg>',
    kalp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7 2.4C19 15.6 12 20 12 20z" class="i-dolu"/></svg>',
    zzz: '<span class="i-zzz">z<span>z</span><span>Z</span></span>',
    soru: '<span class="i-soru">?</span>'
  };

  var POZLAR = ['yuruyor', 'bakiyor', 'esniyor', 'yalaniyor', 'uyuyor', 'zipliyor', 'hayir'];
  var azalt = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function rastgele(a, b) { return a + Math.random() * (b - a); }
  function sec(agirliklar) {
    var top = 0, k;
    for (k in agirliklar) top += agirliklar[k];
    var r = Math.random() * top;
    for (k in agirliklar) { r -= agirliklar[k]; if (r < 0) return k; }
    return k;
  }

  // alan: kedinin dolaşacağı, içinde başka içerik olmayan kutu (position: relative)
  // ops: { link: 'kedi-odasi.html', hiz: px/sn }
  window.KediGezgin = function (alan, ops) {
    ops = ops || {};
    var el = document.createElement(ops.link ? 'a' : 'div');
    el.className = 'kedi';
    if (ops.link) el.href = ops.link;
    else el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="kedi-yon">' + SVG + '</div><div class="kedi-balon" hidden></div>';
    // Her kedinin göz kırpma aralığı biraz farklı
    el.style.setProperty('--kirpma', rastgele(4.2, 6.4).toFixed(2) + 's');
    alan.appendChild(el);
    var balonEl = el.querySelector('.kedi-balon');

    var x = 0, yuruyor = false, zamanlayici = null, balonZaman = null;
    var isaret = {};
    var basladi = false;

    function poz(ad) {
      POZLAR.forEach(function (p) { el.classList.toggle(p, p === ad); });
    }
    function sinir() { return Math.max(0, alan.clientWidth - el.offsetWidth); }
    function konum(yeniX, sure) {
      el.style.transitionDuration = sure + 's';
      el.style.transform = 'translate3d(' + yeniX.toFixed(1) + 'px,0,0)';
      x = yeniX;
    }
    function bekle(ms, fn) { clearTimeout(zamanlayici); zamanlayici = setTimeout(fn, ms); }
    function yon(sag) { el.dataset.yon = sag ? 'sag' : 'sol'; }

    function balon(ikon, ms) {
      clearTimeout(balonZaman);
      if (!ikon) { balonEl.hidden = true; return; }
      balonEl.innerHTML = IKON[ikon];
      balonEl.dataset.ikon = ikon;
      balonEl.hidden = false;
      if (ms) balonZaman = setTimeout(function () { balonEl.hidden = true; }, ms);
    }

    // Yürümenin yarıda kesildiği yer (pencere boyutu değişince)
    function suankiX() {
      var m = getComputedStyle(el).transform;
      var p = m && m !== 'none' ? m.match(/-?[\d.]+/g) : null;
      return p ? parseFloat(p[4]) : x;
    }

    function sonraki() {
      if (document.hidden) return;
      if (isaret.uyuyor) {
        poz('uyuyor');
        balon('zzz');
        return bekle(30000, sonraki);
      }
      if (balonEl.dataset.ikon === 'zzz') balon(null);
      var agirlik = {
        yuru: isaret.uzgun || isaret.yorgun ? 1.5 : 5,
        bak: 2,
        dur: isaret.uzgun ? 4 : 1.2,
        esne: isaret.yorgun ? 3 : 0.4,
        yalan: isaret.kirli ? 3 : 0.4,
        uyukla: isaret.yorgun ? 2 : 0,
        dusun: isaret.ac ? 3 : 0
      };
      var d = sec(agirlik);
      if (d === 'yuru') return yuru();
      if (d === 'bak') { poz('bakiyor'); return bekle(2600, dinlen); }
      if (d === 'esne') { poz('esniyor'); return bekle(1900, dinlen); }
      if (d === 'yalan') { poz('yalaniyor'); return bekle(2600, dinlen); }
      if (d === 'dusun') { poz(null); balon('mama', 3200); return bekle(3400, dinlen); }
      if (d === 'uyukla') {
        poz('uyuyor');
        balon('zzz');
        return bekle(rastgele(8000, 14000), function () { balon(null); poz('esniyor'); bekle(1900, dinlen); });
      }
      poz(null);
      bekle(rastgele(2000, 4000), sonraki);
    }
    function dinlen() { poz(null); bekle(rastgele(700, 2200), sonraki); }

    function yuru() {
      var m = sinir();
      if (m < 24) { poz(null); return bekle(4000, sonraki); }
      var hedef, en = Math.min(48, m / 3);
      do { hedef = rastgele(0, m); } while (Math.abs(hedef - x) < en);
      var hiz = (ops.hiz || 36) * (isaret.uzgun || isaret.yorgun ? 0.55 : 1);
      var sure = Math.abs(hedef - x) / hiz;
      yon(hedef > x);
      poz('yuruyor');
      yuruyor = true;
      konum(hedef, sure);
      bekle(sure * 1000, function () { yuruyor = false; dinlen(); });
    }

    // Hareketi azalt: döngü yok, poz yalnızca duruma göre
    function sabit() {
      poz(isaret.uyuyor ? 'uyuyor' : null);
      if (isaret.uyuyor) balon('zzz');
      else if (isaret.ac) balon('mama');
      else balon(null);
    }

    function baslat() {
      clearTimeout(zamanlayici);
      if (azalt.matches) {
        konum(sinir() * 0.2, 0);
        return sabit();
      }
      if (!basladi) { konum(rastgele(0, sinir()), 0); yon(Math.random() < 0.5); }
      basladi = true;
      bekle(400, sonraki);
    }

    // Alan daralınca kedi içeride kalır
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var m = sinir();
        if (!yuruyor && x <= m) return;
        var su = Math.min(suankiX(), m);
        yuruyor = false;
        konum(Math.max(0, su), 0);
        poz(isaret.uyuyor ? 'uyuyor' : null);
        if (!azalt.matches) bekle(800, sonraki);
      }).observe(alan);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { clearTimeout(zamanlayici); return; }
      if (yuruyor) { yuruyor = false; konum(suankiX(), 0); }
      baslat();
    });
    if (azalt.addEventListener) azalt.addEventListener('change', baslat);

    return {
      el: el,
      // İhtiyaçlardan çıkan işaretler (KediKurallar.isaretler)
      guncelle: function (yeni) {
        var uykuDegisti = !!yeni.uyuyor !== !!isaret.uyuyor;
        isaret = yeni;
        el.classList.toggle('uzgun', !!yeni.uzgun && !yeni.uyuyor);
        el.classList.toggle('kirli', !!yeni.kirli);
        el.classList.toggle('neseli', !!yeni.mutlu);
        if (!basladi || uykuDegisti) {
          if (uykuDegisti && !yeni.uyuyor) balon(null);
          if (uykuDegisti && yuruyor) { yuruyor = false; konum(suankiX(), 0); }
          baslat();
        } else if (azalt.matches) sabit();
      },
      // Bakım sonrası kısa tepki: 'feed' | 'play' | 'rest' | 'clean' | 'red'
      tepki: function (tur) {
        if (tur === 'red') {
          balon(null);
          if (azalt.matches) return;
          if (yuruyor) { yuruyor = false; konum(suankiX(), 0); }
          poz('hayir');
          bekle(900, isaret.uyuyor ? sonraki : dinlen);
          return;
        }
        if (yuruyor) { yuruyor = false; konum(suankiX(), 0); }
        var ikon = { feed: 'mama', play: 'top', clean: 'parilti', rest: 'zzz' }[tur];
        if (tur === 'rest') { poz('uyuyor'); balon('zzz'); return; }
        // Uyurken beslenen/temizlenen kedi uyumaya devam eder
        poz(isaret.uyuyor ? 'uyuyor' : tur === 'play' && !azalt.matches ? 'zipliyor' : null);
        balon(ikon, 2400);
        kalpler();
        bekle(2400, azalt.matches ? sabit : isaret.uyuyor ? sonraki : dinlen);
      },
      // Durum okunamadığında
      bilinmiyor: function () { clearTimeout(zamanlayici); poz(null); balon('soru'); }
    };

    function kalpler() {
      var n = azalt.matches ? 1 : 3;
      for (var i = 0; i < n; i++) {
        var k = document.createElement('span');
        k.className = 'kedi-kalp';
        k.innerHTML = IKON.kalp;
        k.style.setProperty('--gecikme', i * 180 + 'ms');
        k.style.setProperty('--sapma', (i - 1) * 14 + 'px');
        el.appendChild(k);
        setTimeout(function (k) { k.remove(); }.bind(null, k), 1800 + i * 180);
      }
    }
  };
})();
