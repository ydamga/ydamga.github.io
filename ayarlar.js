// Bütün sayfaların ortak ayarları: tema, desen ve ÖSYM bildirimleri. <head> içinde yüklenir:
// kayıtlı temayı ilk boyamadan önce uygular, sayfa açılınca .ayarlar-btn düğmesine bağlı paneli kurar.
// Görünüm ortak.css'te.
(function () {
  // z: zemin, v: vurgu; yuvarlaklar ikisini yarı yarıya gösterir
  var TEMALAR = [
    { id: 'sistem', ad: 'Sistem', z: '#EDF1F5', v: '#1E2A38' },
    { id: 'light', ad: 'Açık', z: '#EDF1F5', v: '#C9A86A' },
    { id: 'dark', ad: 'Koyu', z: '#1E2A38', v: '#C9A86A' },
    { id: 'nane', ad: 'Nane', z: '#E4F4EE', v: '#5CC9A7' },
    { id: 'lavanta', ad: 'Lavanta', z: '#EEEAFA', v: '#AA93EA' },
    { id: 'pembe', ad: 'Pembe', z: '#FCEDF2', v: '#F29BB5' },
    { id: 'gok', ad: 'Gökyüzü', z: '#E6F2FC', v: '#6DB8EC' },
    { id: 'gece', ad: 'Gece', z: '#221A32', v: '#E9A8D5' }
  ];
  var kok = document.documentElement;

  try {
    var t = localStorage.getItem('tema');
    if (TEMALAR.some(function (x) { return x.id === t && t !== 'sistem'; })) kok.dataset.theme = t;
    if (localStorage.getItem('desen') === 'acik') kok.dataset.desen = '';
  } catch (e) {}

  var PANEL =
    '<div class="ayarlar-bas">' +
      '<h2 id="ayarlar-baslik">Ayarlar</h2>' +
      '<button type="button" class="kapat" aria-label="Kapat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '</div>' +
    '<section class="ayar-bolum" aria-labelledby="tema-etiket">' +
      '<h3 id="tema-etiket">Tema</h3>' +
      '<div class="tema-sec" role="group" aria-labelledby="tema-etiket"></div>' +
      '<div class="ayar-satir">' +
        '<span><b id="desen-ad">Desen</b><small>Zemine temanın desenini ekler</small></span>' +
        '<button type="button" class="anahtar" id="desen-btn" role="switch" aria-checked="false" aria-labelledby="desen-ad"></button>' +
      '</div>' +
    '</section>' +
    '<section class="ayar-bolum" aria-labelledby="bildirim-ad">' +
      '<h3>Bildirimler</h3>' +
      '<div class="ayar-satir">' +
        '<span><b id="bildirim-ad">ÖSYM başvuru hatırlatmaları</b><small>Başvurudan 1 hafta önce, başvuru günü ve bitişe 3 gün kala masaüstü bildirimi</small></span>' +
        '<button type="button" class="anahtar" id="bildirim-btn" role="switch" aria-checked="false" aria-labelledby="bildirim-ad"></button>' +
      '</div>' +
      '<p class="ayar-mesaj" id="bildirim-mesaj" hidden aria-live="polite"></p>' +
    '</section>' +
    '<section class="ayar-bolum" aria-labelledby="anasayfa-ad">' +
      '<h3 id="anasayfa-ad">Bu sayfayı anasayfa yap</h3>' +
      '<p class="ayar-not">Tarayıcılar sitelerin kendini anasayfa yapmasına izin vermiyor; adresi kopyalayıp aşağıdaki adımlarla siz ekleyebilirsiniz.</p>' +
      '<div class="adres-satir">' +
        '<input type="text" id="site-adres" readonly aria-label="Site adresi">' +
        '<button type="button" class="kopyala" id="kopyala-btn">Kopyala</button>' +
      '</div>' +
      '<p class="ayar-not" id="tarayici-ad"></p>' +
      '<ol class="adimlar" id="anasayfa-adimlar"></ol>' +
    '</section>';

  // Tarayıcıya göre anasayfa (telefonda ana ekran) adımları; menü adları tarayıcıların Türkçe arayüzünden
  var ADIMLAR = {
    edge: ['Edge', ['Sağ üstteki ··· menüsünden Ayarlar\'ı açın.', 'Soldan "Başlat, ana sayfa ve yeni sekmeler"i seçin.', '"Edge başladığında" altında "Bu sayfaları aç"ı işaretleyin.', '"Yeni sayfa ekleyin"e basıp adresi yapıştırın.']],
    chrome: ['Chrome', ['Sağ üstteki ⋮ menüsünden Ayarlar\'ı açın.', 'Soldan "Başlangıçta"yı seçin.', '"Belirli bir sayfayı veya sayfa grubunu aç"ı işaretleyin.', '"Yeni sayfa ekle"ye basıp adresi yapıştırın.']],
    firefox: ['Firefox', ['Sağ üstteki ☰ menüsünden Ayarlar\'ı açın.', 'Soldan "Giriş sayfası"nı seçin.', '"Giriş sayfası ve yeni pencereler" altında "Özel adresler"i seçin.', 'Adresi kutuya yapıştırın.']],
    safari: ['Safari', ['Üst menüden Safari → Ayarlar\'ı açın.', '"Genel" sekmesine geçin.', 'Adresi "Ana sayfa" kutusuna yapıştırın.']],
    ios: ['iPhone / iPad', ['Safari\'de alttaki Paylaş düğmesine basın.', '"Ana Ekrana Ekle"yi seçin.', '"Ekle"ye basın; site ana ekranda simge olarak durur.']],
    android: ['Android', ['Chrome\'da sağ üstteki ⋮ menüsünü açın.', '"Ana ekrana ekle"yi seçin.', '"Ekle"ye basın; site ana ekranda simge olarak durur.']]
  };
  function tarayici() {
    var ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    if (/Edg\//.test(ua)) return 'edge';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Safari\//.test(ua) && !/Chrome\/|Chromium\//.test(ua)) return 'safari';
    return 'chrome';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var yil = document.getElementById('yil');
    if (yil) yil.textContent = new Date().getFullYear();

    var acici = document.querySelector('.ayarlar-btn');
    if (!acici) return;
    var panel = document.createElement('dialog');
    panel.className = 'ayarlar';
    panel.setAttribute('aria-labelledby', 'ayarlar-baslik');
    panel.innerHTML = PANEL;
    document.body.appendChild(panel);
    acici.addEventListener('click', function () { panel.showModal(); });
    panel.querySelector('.kapat').addEventListener('click', function () { panel.close(); });
    // Panelin dışına (arka plana) tıklayınca kapanır
    panel.addEventListener('click', function (e) { if (e.target === panel) panel.close(); });

    temaKur(panel);
    bildirimKur(panel);
    anasayfaKur(panel);
  });

  function anasayfaKur(panel) {
    // Sitenin kök adresi; alt sayfadan açılsa da anasayfa kaydedilir
    var adres = new URL('./', location.href).href;
    var kutu = panel.querySelector('#site-adres');
    var btn = panel.querySelector('#kopyala-btn');
    kutu.value = adres;
    kutu.addEventListener('focus', function () { kutu.select(); });
    btn.addEventListener('click', function () {
      function oldu() {
        btn.textContent = 'Kopyalandı';
        setTimeout(function () { btn.textContent = 'Kopyala'; }, 2000);
      }
      // Pano izni yoksa eski yöntem; o da olmazsa adres seçili kalır, Ctrl+C ile kopyalanır
      function eski() {
        kutu.focus();
        kutu.select();
        try { if (document.execCommand('copy')) oldu(); } catch (e) {}
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(adres).then(oldu, eski);
      else eski();
    });

    var t = ADIMLAR[tarayici()];
    var mobil = t === ADIMLAR.ios || t === ADIMLAR.android;
    panel.querySelector('#tarayici-ad').textContent = mobil ? t[0] + ' için ana ekrana ekleme:' : t[0] + ' için:';
    var ol = panel.querySelector('#anasayfa-adimlar');
    t[1].forEach(function (a) {
      var li = document.createElement('li');
      li.textContent = a;
      ol.appendChild(li);
    });
  }

  function temaKur(panel) {
    var kutu = panel.querySelector('.tema-sec');
    var secili = kok.dataset.theme || 'sistem';
    var butonlar = TEMALAR.map(function (x) {
      var b = document.createElement('button');
      b.type = 'button';
      b.title = x.ad;
      b.setAttribute('aria-label', x.ad);
      b.style.setProperty('--z', x.z);
      b.style.setProperty('--v', x.v);
      b.dataset.tema = x.id;
      b.addEventListener('click', function () {
        secili = x.id;
        if (secili === 'sistem') delete kok.dataset.theme;
        else kok.dataset.theme = secili;
        try {
          if (secili === 'sistem') localStorage.removeItem('tema');
          else localStorage.setItem('tema', secili);
        } catch (e) {}
        goster();
      });
      kutu.appendChild(b);
      return b;
    });
    function goster() {
      butonlar.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tema === secili); });
    }
    goster();

    // Desen her temada isteğe bağlı; açıkken temanın kendi deseni görünür
    var desen = panel.querySelector('#desen-btn');
    desen.setAttribute('aria-checked', 'desen' in kok.dataset);
    desen.addEventListener('click', function () {
      var ac = desen.getAttribute('aria-checked') !== 'true';
      if (ac) kok.dataset.desen = '';
      else delete kok.dataset.desen;
      try {
        if (ac) localStorage.setItem('desen', 'acik');
        else localStorage.removeItem('desen');
      } catch (e) {}
      desen.setAttribute('aria-checked', ac);
    });
  }

  // Masaüstü bildirimi (Web Push). Abonelik Cloudflare Worker'a (worker/osym-bildirim.js) kaydedilir;
  // Worker her sabah hatırlatma günlerinde bütün abonelere bildirim gönderir.
  function bildirimKur(panel) {
    var WORKER_URL = 'https://osym-bildirim.ydamga.workers.dev';
    var VAPID_PUBLIC = 'BCryU_s3mEZYtTRz6WgZd_rwIQDnsBxZxG-1sf9VzB8xOvxlsdea_hcV9vG6QAzY0X2zGIebtH__hDRNTDHm91M';
    var btn = panel.querySelector('#bildirim-btn');
    var kutu = panel.querySelector('#bildirim-mesaj');
    function mesaj(metin) { kutu.textContent = metin; kutu.hidden = !metin; }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      btn.disabled = true;
      mesaj('Bu tarayıcı masaüstü bildirimlerini desteklemiyor. Chrome, Edge ya da Firefox ile deneyin.');
      return;
    }
    var acik = false;

    function anahtar(b64) {
      var p = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
      return Uint8Array.from(atob(p), function (c) { return c.charCodeAt(0); });
    }
    function durum(a) { acik = a; btn.setAttribute('aria-checked', a); }
    function postala(yol, govde) {
      return fetch(WORKER_URL + yol, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) })
        .then(function (r) { if (!r.ok) throw new Error('sunucu'); });
    }

    var kayit = navigator.serviceWorker.register('sw.js');
    kayit.then(function (r) { return r.pushManager.getSubscription(); })
      .then(function (a) { durum(!!a && Notification.permission === 'granted'); })
      .catch(function () {});

    function ac() {
      return Notification.requestPermission()
        .then(function (izin) {
          if (izin !== 'granted') throw new Error('izin');
          return kayit.then(function () { return navigator.serviceWorker.ready; });
        })
        .then(function (r) {
          return r.pushManager.getSubscription().then(function (a) {
            return a || r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtar(VAPID_PUBLIC) });
          });
        })
        .then(function (a) { return postala('/abone', a.toJSON()); })
        .then(function () {
          durum(true);
          mesaj('Bildirimler açıldı; bir deneme bildirimi gönderildi.');
        });
    }
    function kapat() {
      return navigator.serviceWorker.ready
        .then(function (r) { return r.pushManager.getSubscription(); })
        .then(function (a) {
          if (!a) return;
          return postala('/iptal', { endpoint: a.endpoint }).then(function () { return a.unsubscribe(); });
        })
        .then(function () { durum(false); mesaj('Bildirimler kapatıldı.'); });
    }

    btn.addEventListener('click', function () {
      btn.disabled = true;
      (acik ? kapat() : ac())
        .catch(function (h) {
          mesaj(h && h.message === 'izin'
            ? 'Bildirim izni verilmedi. Tarayıcının adres çubuğundaki site ayarlarından bildirimlere izin verip tekrar deneyin.'
            : h && h.message === 'sunucu'
              ? 'Bildirim servisine ulaşılamadı. Biraz sonra tekrar deneyin.'
              : 'Bu tarayıcıda bildirim aboneliği açılamadı. Chrome, Edge ya da Firefox ile deneyin.');
        })
        .then(function () { btn.disabled = false; });
    });
  }
})();
