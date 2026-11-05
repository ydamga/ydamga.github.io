// Kedi Odası'ndaki piksel avatar: kedi/avatar.png (5 kare: dur, yuru1, yuru2, egil, salla; her biri 73x110).
// Zeminde dolaşır, ara sıra el sallar, kediye gidip çömelir ve onu sever (kedi mırlar).
// Bakım yapılınca ilgili yere gider (mamada mama kabına, ötekilerde kedinin yanına).
// Gece (22:00–07:00) evine gider, odada görünmez. "Hareketi azalt" açıksa yerinde durur, yalnızca pozu değişir.
//
// KediAvatar(zemin, kedi, ops) → { sevmeyeGit(), bakim(eylem), dur(acik), gece(acik), el }
//   zemin: kedinin dolaştığı kutu (#oda-zemin); kedi: KediGezgin nesnesi
(function () {
  var KARE_EN = 73, KARE_BOY = 110, KARE = { dur: 0, yuru1: 1, yuru2: 2, egil: 3, salla: 4 };
  var EL_X = 69;            // sever/uzanırken elin karedeki yatay yeri (piksel, sprite ölçeğinde)
  var SEVME_SOZ = ['Aferin Fındık!', 'Kim güzel kedi?', 'Mırıl mırıl…', 'Pamuk gibi olmuşsun', 'Gel bakalım'];
  var SELAM_SOZ = ['Merhaba!', 'Selam!', 'Kolay gelsin!', 'Fındık nerede?'];
  var azalt = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function rastgele(a, b) { return a + Math.random() * (b - a); }
  function sec(l) { return l[Math.floor(Math.random() * l.length)]; }

  window.KediAvatar = function (zemin, kedi, ops) {
    ops = ops || {};
    var el = document.createElement('div');
    el.className = 'avatar';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', 'Avatar: el sallamak için bas');
    el.innerHTML = '<div class="avatar-gorsel" aria-hidden="true"></div><div class="kedi-soz avatar-soz" hidden></div>';
    zemin.appendChild(el);
    var gorsel = el.querySelector('.avatar-gorsel');
    var soz = el.querySelector('.avatar-soz');

    var olcek = 1, x = 0, zaman = null, adimZaman = null, sozZaman = null;
    var durdu = false, geceMi = false, mesgul = false, kediTutuldu = false;

    // Ölçek: odanın yüksekliğine göre (piksel görünümü korunur: image-rendering: pixelated)
    function boyutla() {
      var h = zemin.parentNode.clientHeight;
      olcek = Math.max(0.9, Math.min(2.2, h * 0.6 / KARE_BOY));
      el.style.width = KARE_EN * olcek + 'px';
      el.style.height = KARE_BOY * olcek + 'px';
      gorsel.style.backgroundSize = KARE_EN * 5 * olcek + 'px ' + KARE_BOY * olcek + 'px';
      poz(el.dataset.poz || 'dur');
    }
    function poz(ad) {
      el.dataset.poz = ad;
      gorsel.style.backgroundPosition = -KARE[ad] * KARE_EN * olcek + 'px 0';
    }
    function sinir() { return Math.max(0, zemin.clientWidth - el.offsetWidth); }
    function suankiX() {
      var m = getComputedStyle(el).transform;
      var p = m && m !== 'none' ? m.match(/-?[\d.]+/g) : null;
      return p ? parseFloat(p[4]) : x;
    }
    function konum(yeni, sure) {
      el.style.transitionDuration = sure + 's';
      el.style.transform = 'translate3d(' + yeni.toFixed(1) + 'px,0,0)';
      x = yeni;
    }
    function bekle(ms, fn) { clearTimeout(zaman); zaman = setTimeout(fn, ms); }
    function adimDurdur() { clearInterval(adimZaman); adimZaman = null; }
    function soyle(metin, ms) {
      clearTimeout(sozZaman);
      soz.textContent = metin;
      soz.hidden = false;
      soz.classList.remove('yeni'); void soz.offsetWidth; soz.classList.add('yeni');
      sozZaman = setTimeout(function () { soz.hidden = true; }, ms || 2600);
    }

    // Bir yere yürü (px). Bitince fn çağrılır.
    function yuru(hedef, fn, hiz) {
      hedef = Math.max(0, Math.min(sinir(), hedef));
      var su = suankiX();
      var sure = Math.abs(hedef - su) / (hiz || ops.hiz || 70);
      if (azalt.matches || sure < 0.08) { konum(hedef, 0); poz('dur'); return bekle(150, fn); }
      var k = 0;
      adimDurdur();
      adimZaman = setInterval(function () { poz(k++ % 2 ? 'yuru2' : 'yuru1'); }, 170);
      poz('yuru1');
      el.classList.add('yuruyor');
      konum(hedef, sure);
      bekle(sure * 1000, function () {
        adimDurdur();
        el.classList.remove('yuruyor');
        poz('dur');
        fn();
      });
    }

    function kediyiBirak() { if (kediTutuldu) { kediTutuldu = false; kedi.yonet(false); } }

    // Kediyi sever: kedi beklesin diye onu tutar, elini kedinin ortasına uzatacak yere gider, çömelir.
    // Kedi duvara çok yakınsa biraz öne gelir. Uyuyan kedi yerinden oynatılmaz.
    function sev(sonra) {
      mesgul = true;
      var uzanma = EL_X * olcek;
      var kediX = kedi.merkez();
      if (!kedi.uyuyorMu()) {
        kedi.yonet(true);
        kediTutuldu = true;
        if (kediX < uzanma + 8) { kediX = uzanma + 24; kedi.kovala(kediX); }
      }
      yuru(Math.max(0, kediX - uzanma + 6), function () {
        kediyiBirak();
        poz('egil');
        kedi.sev();
        soyle(sec(SEVME_SOZ));
        bekle(2400, function () { poz('dur'); mesgul = false; (sonra || dinlen)(); });
      }, 110);
    }

    function selam() {
      if (durdu || geceMi) return;
      clearTimeout(zaman);
      adimDurdur();
      el.classList.remove('yuruyor');
      konum(suankiX(), 0);
      poz('salla');
      soyle(sec(SELAM_SOZ));
      bekle(1600, function () { poz('dur'); dinlen(); });
    }

    // Kendi başına: dolaş, dur, el salla, arada kediyi sev
    function sonraki() {
      if (durdu || geceMi || document.hidden) return;
      var r = Math.random();
      if (r < 0.28) return sev();
      if (r < 0.38) { poz('salla'); return bekle(1400, function () { poz('dur'); dinlen(); }); }
      if (r < 0.75 && !azalt.matches) return yuru(rastgele(0, sinir()), dinlen);
      poz('dur');
      dinlen();
    }
    function dinlen() { bekle(rastgele(3500, 8000), sonraki); }

    el.addEventListener('click', selam);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selam(); } });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { clearTimeout(zaman); return; }
      if (!durdu && !geceMi) dinlen();
    });
    if (window.ResizeObserver) new ResizeObserver(function () { boyutla(); if (x > sinir()) konum(sinir(), 0); }).observe(zemin);

    boyutla();
    konum(sinir() * 0.75, 0);
    poz('dur');
    dinlen();

    return {
      el: el,
      // Sev düğmesi: kediye gidip sever
      sevmeyeGit: function () { if (!durdu && !geceMi && !mesgul) { clearTimeout(zaman); sev(); } },
      // Bakım yapılınca: mamada mama kabına, ötekilerde kedinin yanına gidip çömelir
      bakim: function (eylem) {
        if (durdu || geceMi) return;
        clearTimeout(zaman);
        if (eylem === 'feed' || eylem === 'treat') {
          mesgul = true;
          yuru(0, function () {
            poz('egil');
            soyle(eylem === 'treat' ? 'Bugünün ödülü!' : 'Afiyet olsun!');
            bekle(1600, function () { poz('dur'); mesgul = false; dinlen(); });
          }, 120);
          return;
        }
        sev();
      },
      // Lazer oyunu gibi durumlarda kenarda bekler
      dur: function (acik) {
        durdu = acik;
        mesgul = false;
        if (acik) kediTutuldu = false; // oyun kediyi zaten yönetiyor, bitince bırakır
        clearTimeout(zaman);
        adimDurdur();
        el.classList.remove('yuruyor');
        konum(acik ? sinir() : suankiX(), azalt.matches ? 0 : 0.6);
        poz('dur');
        if (!acik && !geceMi) dinlen();
      },
      // Gece eve gider
      gece: function (acik) {
        if (acik === geceMi) return;
        geceMi = acik;
        el.hidden = acik;
        clearTimeout(zaman);
        mesgul = false;
        kediyiBirak();
        adimDurdur();
        if (!acik && !durdu) dinlen();
      }
    };
  };
})();
