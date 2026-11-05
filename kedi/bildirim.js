// Ekip kedisi: anlık duyurular ve uyarılar (anasayfa ve Kedi Odası ortak).
//  - Başkası bakım yapınca ya da kediyi sevince köşede kısa bir duyuru çıkar ("Mehmet mama verdi").
//  - Kedinin acil bir ihtiyacı varsa sekme başlığı "(!) Fındık acıktı" olur.
//  - İsteyen "Fındık acıkınca bildir"i açarsa, site sekmesi arka plandayken masaüstü bildirimi gelir
//    (en çok 2 saatte bir). Sitenin hiçbir sekmesi açık değilse bildirim gelmez: bunun için sunucuda
//    çalışan bir zamanlayıcı gerekir.
(function () {
  var D = window.KediDurum, K = window.KediKurallar;
  if (!D || !K) return;
  var AD = D.ad;
  var ANAHTAR = 'kedi-bildirim';
  var SON_ANAHTAR = 'kedi-bildirim-son';
  var ARALIK = 2 * 3600 * 1000;
  var FIIL = {
    feed: 'mama verdi', play: 'oyun oynadı', rest: 'dinlendirdi', wake: 'uyandırdı',
    clean: 'taradı', treat: 'ödül maması verdi'
  };
  var OYUNCAKLA = { top: 'topla', ip: 'iple', lazer: 'lazerle' };

  // ---- Duyurular ----
  var kutu = null;
  function kutuHazirla() {
    if (kutu) return kutu;
    kutu = document.createElement('div');
    kutu.className = 'kedi-duyurular';
    kutu.setAttribute('role', 'status');
    kutu.setAttribute('aria-live', 'polite');
    document.body.appendChild(kutu);
    return kutu;
  }
  function duyur(metin) {
    var k = kutuHazirla();
    var d = document.createElement('div');
    d.className = 'kedi-duyuru';
    d.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9 6 3l4 4h4l4-4 2 6v6a8 8 0 0 1-16 0z"/></svg><span></span>';
    d.querySelector('span').textContent = metin;
    k.appendChild(d);
    while (k.children.length > 3) k.removeChild(k.firstChild);
    setTimeout(function () {
      d.classList.add('gidiyor');
      setTimeout(function () { d.remove(); }, 300);
    }, 4200);
  }

  D.dinle(function (tur, veri) {
    if (tur === 'eylem' && veri && veri.actor_name) {
      var f = veri.action === 'play' && veri.toy ? OYUNCAKLA[veri.toy] + ' oynadı' : FIIL[veri.action];
      if (f) duyur(veri.actor_name + ' ' + f);
    }
    if (tur === 'sev' && veri && veri.ad) duyur(veri.ad + ' ' + AD + ' ile sevgi paylaştı');
    if (tur === 'durum') kontrol();
  });

  // ---- Acil ihtiyaç: sekme başlığı ve bildirim ----
  var ilkBaslik = document.title;
  var oncekiAcil = null;
  function acil(c) {
    if (!c) return null;
    if (c.hunger > 75) return 'acıktı';
    if (c.happiness < 25) return 'çok sıkıldı';
    if (c.cleanliness < 25) return 'taranmak istiyor';
    if (c.energy < 15 && !c.resting) return 'çok yorgun';
    return null;
  }
  function kontrol() {
    var n = acil(D.anlik());
    document.title = n ? '(!) ' + AD + ' ' + n + ' · ' + ilkBaslik : ilkBaslik;
    if (n && n !== oncekiAcil) bildir(AD + ' ' + n, 'Kedi Odası’na uğrayıp ona bakabilirsin.');
    oncekiAcil = n;
  }
  setInterval(function () { kontrol(); }, 60000);

  function acikMi() {
    try { return localStorage.getItem(ANAHTAR) === '1' && 'Notification' in window && Notification.permission === 'granted'; }
    catch (e) { return false; }
  }
  function bildir(baslik, govde) {
    if (!acikMi() || !document.hidden) return;
    var son = 0;
    try { son = Number(localStorage.getItem(SON_ANAHTAR)) || 0; } catch (e) {}
    if (Date.now() - son < ARALIK) return;
    try { localStorage.setItem(SON_ANAHTAR, String(Date.now())); } catch (e) {}
    var url = new URL('kedi-odasi.html', location.href).href;
    var ops = { body: govde, tag: 'kedi', data: { url: url } };
    var sw = navigator.serviceWorker;
    (sw ? sw.getRegistration() : Promise.resolve(null)).then(function (r) {
      if (r && r.showNotification) return r.showNotification(baslik, ops);
      var b = new Notification(baslik, ops);
      b.onclick = function () { window.focus(); location.href = url; };
    }).catch(function () {});
  }

  window.KediBildirim = {
    duyur: duyur,
    get acik() { return acikMi(); },
    get destekleniyor() { return 'Notification' in window; },
    // Bildirimleri aç/kapat. Döner: Promise<boolean> (açık mı)
    degistir: function () {
      if (acikMi()) {
        try { localStorage.removeItem(ANAHTAR); } catch (e) {}
        return Promise.resolve(false);
      }
      if (!('Notification' in window)) return Promise.resolve(false);
      return Promise.resolve(Notification.permission === 'granted' ? 'granted' : Notification.requestPermission())
        .then(function (izin) {
          if (izin !== 'granted') return false;
          try { localStorage.setItem(ANAHTAR, '1'); } catch (e) {}
          // Bildirime tıklanınca sayfayı açmak için sitenin hizmet çalışanı (sw.js) kullanılır
          if (navigator.serviceWorker) navigator.serviceWorker.register('sw.js').catch(function () {});
          return true;
        });
    }
  };
})();
