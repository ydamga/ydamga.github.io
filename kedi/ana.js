// Anasayfa: alt bilgideki şeritte dolaşan ekip kedisi. Kediye basınca Kedi Odası açılır.
(function () {
  var serit = document.getElementById('kedi-serit');
  if (!serit) return;
  var D = window.KediDurum, K = window.KediKurallar;
  var kedi = window.KediGezgin(serit, { link: 'kedi-odasi.html', hiz: 32 });

  function goster() {
    var c = D.anlik();
    if (!c) return;
    var r = K.ruhHali(c, D.simdi());
    kedi.guncelle(K.isaretler(c));
    var etiket = 'Kedi Odası: ' + D.ad + ', ' + r.ad.toLocaleLowerCase('tr') + '. ' + r.mesaj;
    kedi.el.setAttribute('aria-label', etiket);
    kedi.el.title = etiket;
  }

  D.dinle(function (tur) {
    if (tur === 'durum') goster();
    if (tur === 'baglanti' && D.baglanti === 'kopuk') {
      var m = 'Kedi Odası: ' + D.ad + ' ile bağlantı kurulamadı; durumu şu an gösterilemiyor.';
      if (!D.anlik()) kedi.bilinmiyor();
      kedi.el.setAttribute('aria-label', m);
      kedi.el.title = m;
    }
  });
  D.baslat({ gecmis: false }).catch(function () {});
  // İhtiyaçlar yavaş değişir; dakikada bir yeniden hesaplamak yeter
  setInterval(function () { if (!document.hidden) goster(); }, 60000);
})();
