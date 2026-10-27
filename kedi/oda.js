// Kedi Odası: büyük kedi, ihtiyaç göstergeleri, bakım düğmeleri, geçmiş ve (canlı modda) giriş.
(function () {
  var D = window.KediDurum, K = window.KediKurallar;
  var AD = D.ad;
  function $(id) { return document.getElementById(id); }

  var kedi = window.KediGezgin($('oda-zemin'), { hiz: 55 });
  var butonlar = Array.prototype.slice.call(document.querySelectorAll('.eylem'));
  var bekliyor = false;

  var IKONLAR = {
    hunger: '<path d="M3 12h18l-2 7H5zM8 9h.01M12 8h.01M16 9h.01"/>',
    happiness: '<path d="M12 20s-7-4.4-7-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7 2.4C19 15.6 12 20 12 20z"/>',
    energy: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
    cleanliness: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'
  };
  var FIIL = { feed: 'mama verdi', play: 'oyun oynadı', rest: 'dinlendirdi', clean: 'temizledi' };
  var EDILGEN = { feed: 'Mama verildi', play: 'Oyun oynandı', rest: 'Dinlendirildi', clean: 'Temizlendi' };
  var RED_KISA = {
    already_full: 'tok olduğu için yemedi', sleeping: 'uyuyordu', too_tired: 'oynayamayacak kadar yorgundu',
    already_happy: 'zaten çok mutluydu', already_resting: 'zaten uyuyordu', not_tired: 'uykusu yoktu',
    already_clean: 'zaten temizdi'
  };
  var BASARI = {
    feed: AD + ' mamasını afiyetle yedi.',
    play: AD + ' topun peşinden koştu! Mutluluğu arttı, biraz yoruldu.',
    rest: AD + ' minderine kıvrıldı.',
    clean: AD + ' tarandı, tüyleri parlıyor.'
  };
  var RED = {
    already_full: AD + ' tok; mama kabını kokladı ama yemedi.',
    sleeping: AD + ' uyuyor; uyanınca oynarsınız.',
    too_tired: AD + ' oynayamayacak kadar yorgun. Önce biraz dinlensin.',
    already_happy: AD + ' zaten çok mutlu; şimdilik oyun istemiyor.',
    already_resting: AD + ' zaten uyuyor.',
    not_tired: AD + ' dinç; şu an uykusu yok.',
    already_clean: AD + ' zaten tertemiz.'
  };
  var HATA = {
    not_authenticated: 'Bakım yapmak için aşağıdan giriş yapın.',
    not_member: 'Hesabınız henüz ekip üyesi olarak onaylanmadı; bakım yapamazsınız.',
    cooldown: 'Biraz yavaş: aynı kişi birkaç saniyede bir bakım yapabilir.',
    rate_limited: 'Bu saat için bakım sınırına ulaştınız. Biraz sonra tekrar deneyin.',
    invalid_action: 'Bilinmeyen bir işlem gönderildi.',
    network: 'Sunucuya ulaşılamadı. İşlem kaydedilmedi; bağlantınızı kontrol edip tekrar deneyin.'
  };

  // ---- Göstergeler ----
  var olcerler = $('olcerler');
  var satirlar = {};
  K.ihtiyaclar({ hunger: 0, happiness: 0, energy: 0, cleanliness: 0 }).forEach(function (i) {
    var li = document.createElement('li');
    li.className = 'olcer';
    li.innerHTML =
      '<span class="olcer-ikon" aria-hidden="true"><svg viewBox="0 0 24 24">' + IKONLAR[i.anahtar] + '</svg></span>' +
      '<span class="olcer-ad"></span><span class="olcer-metin"></span>' +
      '<span class="olcer-bar" role="meter" aria-valuemin="0" aria-valuemax="100"><i></i></span>';
    li.querySelector('.olcer-ad').textContent = i.ad;
    li.querySelector('.olcer-bar').setAttribute('aria-label', i.ad);
    olcerler.appendChild(li);
    satirlar[i.anahtar] = li;
  });

  function zamanMetni(t) {
    var dk = Math.round((D.simdi() - Date.parse(t)) / 60000);
    if (dk < 1) return 'az önce';
    if (dk < 60) return dk + ' dk önce';
    if (dk < 1440) return Math.floor(dk / 60) + ' sa önce';
    return new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function goster() {
    var c = D.anlik();
    if (!c) return;
    K.ihtiyaclar(c).forEach(function (i) {
      var li = satirlar[i.anahtar];
      li.dataset.seviye = i.seviye;
      li.querySelector('.olcer-metin').innerHTML = '';
      var b = document.createElement('b');
      b.textContent = i.metin;
      li.querySelector('.olcer-metin').append(b, ' · ' + i.deger);
      var bar = li.querySelector('.olcer-bar');
      bar.setAttribute('aria-valuenow', i.deger);
      bar.setAttribute('aria-valuetext', i.deger + ', ' + i.metin);
      bar.querySelector('i').style.setProperty('--d', i.deger + '%');
    });
    var r = K.ruhHali(c, D.simdi());
    $('ruh-ad').textContent = AD + ' · ' + r.ad;
    $('ruh-mesaj').textContent = r.mesaj;
    $('oda').setAttribute('aria-label', 'Kedi odası: ' + AD + ' ' + r.ad.toLocaleLowerCase('tr') + '. ' + r.mesaj);
    kedi.guncelle(K.isaretler(c));
    sonBakan();
  }

  // En son kimin bakım yaptığı: yalnızca güvenilir bir ad varsa (canlı modda sunucunun yazdığı ad)
  function sonBakan() {
    var el = $('son-bakan');
    var t = D.sonBakim;
    if (!D.anlik()) { el.textContent = ''; return; }
    if (!t) { el.textContent = 'Henüz bakım yapılmadı.'; return; }
    var kim = D.gecmis.filter(function (g) { return g.result === 'applied'; })[0];
    if (D.mod === 'demo') {
      el.textContent = 'Son bakım ' + zamanMetni(t) + ', bu tarayıcıda. Yerel denemede kimlik olmadığı için bakan kişi gösterilmez.';
    } else if (kim && kim.actor_name && Math.abs(Date.parse(kim.created_at) - Date.parse(t)) < 1000) {
      el.textContent = 'Son bakım: ' + kim.actor_name + ', ' + zamanMetni(t) + '.';
    } else {
      el.textContent = 'Son bakım ' + zamanMetni(t) + '.' + (D.oturum.durum === 'uye' ? '' : ' Kimin yaptığını ekip üyeleri görür.');
    }
  }

  function gecmisGoster() {
    var ol = $('gecmis-liste');
    ol.textContent = '';
    if (D.mod === 'canli' && D.oturum.durum !== 'uye') {
      var li0 = document.createElement('li');
      li0.className = 'bos';
      li0.textContent = 'Bakım geçmişini giriş yapan ekip üyeleri görür.';
      ol.appendChild(li0);
      return;
    }
    if (!D.gecmis.length) {
      var li1 = document.createElement('li');
      li1.className = 'bos';
      li1.textContent = 'Henüz bakım yapılmadı.';
      ol.appendChild(li1);
      return;
    }
    D.gecmis.forEach(function (g) {
      var li = document.createElement('li');
      // Yerel denemede kişi yok: edilgen cümle
      var kim = g.actor_name;
      var metin = kim ? kim + ' ' + FIIL[g.action] : EDILGEN[g.action];
      if (g.result === 'declined') {
        li.className = 'red';
        metin = (kim ? kim + ' denedi: ' : 'Denendi: ') + AD + ' ' + (RED_KISA[g.reason] || 'istemedi');
      }
      var s = document.createElement('span');
      s.textContent = metin;
      var t = document.createElement('time');
      t.dateTime = g.created_at;
      t.title = new Date(g.created_at).toLocaleString('tr-TR');
      t.textContent = zamanMetni(g.created_at);
      li.append(s, t);
      ol.appendChild(li);
    });
  }

  // ---- Bakım ----
  function mesaj(metin, tur) {
    var el = $('eylem-mesaj');
    el.textContent = metin;
    el.dataset.tur = tur || '';
  }
  function dugmeler() {
    var izin = D.baglanti === 'acik' && (D.mod === 'demo' || D.oturum.durum === 'uye');
    butonlar.forEach(function (b) { b.disabled = bekliyor || !izin; });
  }
  butonlar.forEach(function (b) {
    b.addEventListener('click', function () {
      var eylem = b.dataset.eylem;
      bekliyor = true;
      dugmeler();
      D.islem(eylem).then(function (s) {
        if (s.result === 'applied') {
          var m = BASARI[eylem];
          if (eylem === 'rest') {
            var c = D.anlik();
            if (c && c.resting) m += ' Yaklaşık ' + K.sure(Math.max(1, Math.round((c.resting_until - D.simdi()) / 60000))) + ' dinlenecek.';
          }
          mesaj(m, 'tamam');
          kedi.tepki(eylem);
        } else {
          mesaj(RED[s.reason] || AD + ' şu an istemiyor.', 'red');
          kedi.tepki('red');
        }
      }).catch(function (e) {
        mesaj(HATA[e.kod] || HATA.network, 'hata');
      }).then(function () {
        bekliyor = false;
        dugmeler();
      });
    });
  });

  // ---- Mod, bağlantı ve giriş ----
  function rozet() {
    var r = $('mod-rozet');
    r.dataset.durum = D.baglanti;
    if (D.mod === 'demo') r.textContent = 'Yerel deneme';
    else r.textContent = D.baglanti === 'kopuk' ? 'Ortak · bağlantı yok' : D.baglanti === 'acik' ? 'Ortak · canlı' : 'Bağlanıyor';
    var u = $('baglanti-uyari');
    if (D.baglanti === 'kopuk') {
      u.textContent = D.anlik()
        ? 'Sunucuyla bağlantı koptu. Görünen değerler son bilinen durumdan hesaplanıyor; bağlantı gelene kadar bakım yapılamaz.'
        : 'Kedinin durumu sunucudan alınamadı. Bağlantınızı kontrol edip sayfayı yenileyin.';
      u.hidden = false;
      if (!D.anlik()) {
        $('ruh-ad').textContent = AD + ' · bilinmiyor';
        $('ruh-mesaj').textContent = 'Durum alınamadı.';
        kedi.bilinmiyor();
      }
    } else u.hidden = true;
    dugmeler();
  }

  function girisGoster() {
    var g = $('giris');
    if (D.mod !== 'canli') return;
    g.hidden = false;
    g.textContent = '';
    var o = D.oturum;
    if (o.durum === 'yok') {
      g.innerHTML =
        '<b>Bakım yapmak için giriş yapın.</b> Kediyi herkes görebilir; bakımı yalnızca davet edilmiş ekip üyeleri yapar. ' +
        'E-postanıza tek kullanımlık bir giriş bağlantısı gönderilir.' +
        '<form id="giris-form"><input type="email" id="giris-eposta" required autocomplete="email" placeholder="ad.soyad@arel.edu.tr" aria-label="E-posta adresi">' +
        '<button type="submit">Bağlantı gönder</button></form><p class="giris-mesaj" id="giris-mesaj" aria-live="polite"></p>';
      $('giris-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = g.querySelector('button[type="submit"]');
        var m = $('giris-mesaj');
        btn.disabled = true;
        D.girisBaglantisi($('giris-eposta').value.trim()).then(function () {
          m.textContent = 'Bu adres ekip listesindeyse giriş bağlantısı gönderildi. E-postanızdaki bağlantıyı bu tarayıcıda açın.';
        }, function (h) {
          m.textContent = h.kod === 'rate_limited'
            ? 'Çok sık bağlantı istendi. Birkaç dakika sonra tekrar deneyin.'
            : 'Giriş bağlantısı gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.';
        }).then(function () { btn.disabled = false; });
      });
      return;
    }
    var b = document.createElement('b');
    b.textContent = o.ad;
    g.append('Giriş: ', b, '. ');
    if (o.durum === 'uye-degil') {
      g.append('Hesabınız henüz ekip üyesi olarak onaylanmadı; onaylanınca bakım yapabilirsiniz.');
    }
    var cik = document.createElement('button');
    cik.type = 'button';
    cik.className = 'ikincil';
    cik.textContent = 'Çıkış yap';
    cik.addEventListener('click', function () { D.cikis(); });
    g.append(document.createElement('br'), cik);
  }

  if (D.mod === 'demo') {
    $('demo-not').hidden = false;
    $('sifirla').addEventListener('click', function () {
      D.sifirla();
      mesaj('Deneme baştan başladı.', 'tamam');
    });
  }

  D.dinle(function (tur) {
    if (tur === 'durum') goster();
    if (tur === 'gecmis') { gecmisGoster(); sonBakan(); }
    if (tur === 'baglanti') rozet();
    if (tur === 'oturum') { girisGoster(); gecmisGoster(); sonBakan(); dugmeler(); }
  });
  rozet();
  girisGoster();
  D.baslat({ gecmis: true }).then(function () {
    rozet();
    gecmisGoster();
  }, function () { rozet(); });

  // Değerler yavaş değişir; yarım dakikada bir yeniden hesaplanır
  setInterval(function () { if (!document.hidden) { goster(); gecmisGoster(); } }, 30000);
})();
