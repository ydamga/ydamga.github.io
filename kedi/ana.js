// Anasayfa: alt bilgideki şeritte dolaşan ekip kedisi. Kediye basınca Kedi Odası açılır;
// basılı tutunca (ya da dokunup bekleyince) sevilir ve mırlar.
// Ara sıra bakan kişiye adıyla seslenir, acil ihtiyacı varsa üstünde ünlem çıkar, gece uyur,
// ekibin oyladığı tasma ve tüy rengini taşır, en çok bağlandığı kişiyi koşarak karşılar.
(function () {
  var serit = document.getElementById('kedi-serit');
  if (!serit) return;
  var D = window.KediDurum, K = window.KediKurallar;
  var kedi = window.KediGezgin(serit, { link: 'kedi-odasi.html', hiz: 32 });

  function geceMi() { return K.gunDilimi(D.simdi()) === 'gece'; }
  function acil(c) { return c.hunger > 75 || c.happiness < 25 || c.cleanliness < 25 || (c.energy < 15 && !c.resting); }

  function goster() {
    var c = D.anlik();
    if (!c) return;
    var r = K.ruhHali(c, D.simdi());
    var isaret = K.isaretler(c);
    if (geceMi() && !c.resting) {
      isaret.uyuyor = true;
      r = { ad: 'Gece uykusu', mesaj: 'Gece oldu; kıvrılıp uyudu.' };
    }
    kedi.guncelle(isaret);
    kedi.uyari(acil(c) && !isaret.uyuyor);
    var etiket = 'Kedi Odası: ' + D.ad + ', ' + r.ad.toLocaleLowerCase('tr') + '. ' + r.mesaj + ' Sevmek için basılı tut.';
    kedi.el.setAttribute('aria-label', etiket);
    kedi.el.title = etiket;
  }

  // ---- Sevme: basılı tutunca. Kısa dokunuş odayı açar. ----
  var basili = null, sevildi = false;
  kedi.el.addEventListener('pointerdown', function () {
    sevildi = false;
    clearTimeout(basili);
    basili = setTimeout(function () {
      sevildi = true;
      kedi.sev();
      D.sev();
    }, 450);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (o) {
    kedi.el.addEventListener(o, function () { clearTimeout(basili); });
  });
  kedi.el.addEventListener('click', function (e) { if (sevildi) { e.preventDefault(); sevildi = false; } });
  // Uzun basışta telefonun bağlam menüsü açılmasın
  kedi.el.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---- Sözler ----
  function konus() {
    var c = D.anlik();
    if (!c || document.hidden || geceMi()) return;
    var ben = D.ben, oz = D.ozlenenler().filter(function (m) { return !ben || m.id !== ben.id; })[0];
    var l = K.sozler(c, ben && ben.name, oz && oz.name);
    if (l.length) kedi.soyle(l[Math.floor(Math.random() * l.length)]);
  }
  (function dongu() { setTimeout(function () { konus(); dongu(); }, 45000 + Math.random() * 45000); })();
  setTimeout(konus, 8000);

  // ---- Bağlılık: en çok bakan kişi gelince koşarak karşılar (oturum başına bir kez) ----
  function karsila() {
    if (D.mod !== 'canli' || !D.ben || !D.anlik() || geceMi()) return;
    var b = K.baglilik(D.aktivite, D.simdi());
    if (!b || b.id !== D.ben.id) return;
    try { if (sessionStorage.getItem('kedi-karsiladi') === String(D.ben.id)) return; sessionStorage.setItem('kedi-karsiladi', String(D.ben.id)); } catch (e) {}
    setTimeout(function () { kedi.kos(0.05, D.ben.name + '!'); }, 1500);
  }

  D.dinle(function (tur, veri) {
    if (tur === 'durum') goster();
    if (tur === 'kozmetik') kedi.kostum(D.kozmetik);
    if (tur === 'aktivite' || tur === 'ekip') karsila();
    if (tur === 'eylem' && veri) kedi.tepki(veri.action);
    if (tur === 'sev') kedi.sev();
    if (tur === 'baglanti' && D.baglanti === 'kopuk') {
      var m = 'Kedi Odası: ' + D.ad + ' ile bağlantı kurulamadı; durumu şu an gösterilemiyor.';
      if (!D.anlik()) kedi.bilinmiyor();
      kedi.el.setAttribute('aria-label', m);
      kedi.el.title = m;
    }
  });
  kedi.kostum(D.kozmetik);
  D.baslat({ gecmis: false, aktivite: true }).catch(function () {});
  // İhtiyaçlar yavaş değişir; dakikada bir yeniden hesaplamak yeter
  setInterval(function () { if (!document.hidden) goster(); }, 60000);
})();
