// Kedi Odası: büyük kedi, ihtiyaç göstergeleri, bakım düğmeleri (oyuncaklar, lazer oyunu, ödül maması), sevme,
// geçmiş, günlük, haftalık hedef, görünüş oyları, sahne (gökyüzü, süsler, eşyalar) ve (canlı modda) ad seçimi,
// ekip, rozetler ve özlem.
(function () {
  var D = window.KediDurum, K = window.KediKurallar;
  var AD = D.ad;
  function $(id) { return document.getElementById(id); }

  var kedi = window.KediGezgin($('oda-zemin'), { hiz: 55 });
  // Piksel avatar: odada dolaşır, kediyi sever, bakımlara katılır (kedi/avatar.js)
  var avatar = window.KediAvatar ? window.KediAvatar($('oda-zemin'), kedi) : null;
  var butonlar = Array.prototype.slice.call(document.querySelectorAll('.eylem'));
  var bekliyor = false;

  var IKONLAR = {
    hunger: '<path d="M3 12h18l-2 7H5zM8 9h.01M12 8h.01M16 9h.01"/>',
    happiness: '<path d="M12 20s-7-4.4-7-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7 2.4C19 15.6 12 20 12 20z"/>',
    energy: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
    cleanliness: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'
  };
  var FIIL = { feed: 'mama verdi', play: 'oyun oynadı', rest: 'dinlendirdi', wake: 'uyandırdı', clean: 'temizledi', treat: 'ödül maması verdi' };
  var EDILGEN = { feed: 'Mama verildi', play: 'Oyun oynandı', rest: 'Dinlendirildi', wake: 'Uyandırıldı', clean: 'Temizlendi', treat: 'Ödül maması verildi' };
  var OYUNCAKLA = { top: 'topla', ip: 'iple', lazer: 'lazerle' };
  var OYUNCAGA = { top: 'topa', ip: 'ipe', lazer: 'lazere' };
  var RED_KISA = {
    already_full: 'tok olduğu için yemedi', sleeping: 'uyuyordu', too_tired: 'oynayamayacak kadar yorgundu',
    already_happy: 'zaten çok mutluydu', already_resting: 'zaten uyuyordu', not_tired: 'uykusu yoktu',
    already_clean: 'zaten temizdi', not_sleeping: 'zaten uyanıktı', treat_used: 'bugünkü ödülünü almıştı'
  };
  var BASARI = {
    feed: AD + ' mamasını afiyetle yedi.',
    play: AD + ' topun peşinden koştu! Mutluluğu arttı, biraz yoruldu.',
    rest: AD + ' minderine kıvrıldı.',
    wake: AD + ' gerindi, kocaman esnedi ve uyandı.',
    clean: AD + ' tarandı, tüyleri parlıyor.',
    treat: AD + ' ödül mamasını kaptı, mutluluktan zıplıyor!'
  };
  var RED = {
    already_full: AD + ' tok; mama kabını kokladı ama yemedi.',
    sleeping: AD + ' uyuyor; oynamak için önce uyandırın.',
    too_tired: AD + ' oynayamayacak kadar yorgun. Önce biraz dinlensin.',
    already_happy: AD + ' zaten çok mutlu; şimdilik oyun istemiyor.',
    already_resting: AD + ' zaten uyuyor.',
    not_tired: AD + ' dinç; şu an uykusu yok.',
    already_clean: AD + ' zaten tertemiz.',
    not_sleeping: AD + ' zaten uyanık.',
    treat_used: 'Bugünkü ödül mamanı verdin; yarın yine verebilirsin.'
  };
  var HATA = {
    no_name: 'Önce aşağıdan adını seç; bakım bu adla kaydedilir.',
    unknown_member: 'Seçtiğin ad artık listede yok. Adını yeniden seç.',
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

  function gunOnce(t) {
    var g = Math.floor((D.simdi() - Date.parse(t)) / 864e5);
    if (g < 1) return zamanMetni(t);
    return g === 1 ? 'dün' : g + ' gün önce';
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
    var isaret = K.isaretler(c);
    // Gece kedi kendiliğinden uyur (görünüş; ihtiyaçlar yine işler, bakım yapılabilir)
    if (geceMi() && !c.resting) {
      isaret.uyuyor = true;
      r = { ad: 'Gece uykusu', mesaj: 'Gece oldu; kıvrılıp uyudu. Sabah görüşürüz.' };
    }
    $('ruh-ad').textContent = AD + ' · ' + r.ad;
    $('ruh-mesaj').textContent = r.mesaj;
    $('oda').setAttribute('aria-label', 'Kedi odası: ' + AD + ' ' + r.ad.toLocaleLowerCase('tr') + '. ' + r.mesaj);
    kedi.guncelle(isaret);
    if (avatar) avatar.gece(geceMi());
    sahneCiz();
    uykuDugmesi(c.resting);
    sonBakan();
    ozlemGoster();
  }

  // Kedi uyurken "Dinlendir" düğmesi "Uyandır" olur
  var uykuBtn = document.querySelector('.eylem[data-eylem="rest"]');
  var UYKU_DUGME = {
    rest: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>Dinlendir',
    wake: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>Uyandır'
  };
  function uykuDugmesi(uyuyor) {
    var eylem = uyuyor ? 'wake' : 'rest';
    if (uykuBtn.dataset.eylem === eylem) return;
    uykuBtn.dataset.eylem = eylem;
    uykuBtn.innerHTML = UYKU_DUGME[eylem];
  }

  // En son kimin bakım yaptığı (canlı modda sunucunun yazdığı ad)
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
      el.textContent = 'Son bakım ' + zamanMetni(t) + '.';
    }
  }

  function gecmisGoster() {
    var ol = $('gecmis-liste');
    ol.textContent = '';
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
      var fiil = g.action === 'play' && g.toy ? OYUNCAKLA[g.toy] + ' oynadı' : FIIL[g.action];
      var metin = kim ? kim + ' ' + fiil : EDILGEN[g.action];
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
    var izin = D.baglanti === 'acik';
    butonlar.forEach(function (b) { b.disabled = bekliyor || !izin; });
  }
  function adGerekli() {
    if (D.mod === 'canli' && !D.ben) {
      mesaj(HATA.no_name, 'hata');
      kimAc();
      return true;
    }
    return false;
  }

  // ek: { toy, bonus } (oyun)
  function yap(eylem, ek) {
    var ozlemisti = D.mod === 'canli' && benOzlendiMi();
    bekliyor = true;
    dugmeler();
    return D.islem(eylem, ek).then(function (s) {
      if (s.result === 'applied') {
        var m = BASARI[eylem];
        if (eylem === 'play') {
          var oy = s.toy || 'top';
          m = AD + ' ' + OYUNCAKLA[oy] + ' oynadı! Mutluluğu arttı, biraz yoruldu.';
          if (oy === 'lazer' && ek && ek.yakalama) m += ' Noktayı ' + ek.yakalama + ' kez yakaladı.';
          if (s.favorite) m = AD + ' ' + OYUNCAGA[oy] + ' bayıldı! Bu haftanın gözde oyuncağı bu. ' + m;
        }
        if (eylem === 'rest') {
          var c = D.anlik();
          if (c && c.resting) m += ' Yaklaşık ' + K.sure(Math.max(1, Math.round((c.resting_until - D.simdi()) / 60000))) + ' dinlenecek.';
        }
        if (ozlemisti) m = AD + ' seni görünce koşa koşa geldi, çok özlemişti! ' + m;
        mesaj(m, 'tamam');
        kedi.tepki(eylem);
        if (avatar) avatar.bakim(eylem);
        if (s.favorite) kedi.soyle('En sevdiğim!', 2400);
      } else {
        mesaj(RED[s.reason] || AD + ' şu an istemiyor.', 'red');
        kedi.tepki('red');
      }
    }).catch(function (e) {
      mesaj(HATA[e.kod] || HATA.network, 'hata');
    }).then(function () {
      bekliyor = false;
      dugmeler();
      odulDugmesi();
    });
  }

  var oyuncakSec = $('oyuncak-sec');
  function oyuncakKapat() { oyuncakSec.hidden = true; $('oynat-btn').setAttribute('aria-expanded', 'false'); }
  butonlar.forEach(function (b) {
    b.addEventListener('click', function () {
      if (adGerekli()) return;
      var eylem = b.dataset.eylem;
      if (eylem === 'play') {
        // Önce oyuncak seçilir
        var ac = oyuncakSec.hidden;
        oyuncakSec.hidden = !ac;
        b.setAttribute('aria-expanded', String(ac));
        if (ac) oyuncakSec.querySelector('button').focus();
        return;
      }
      oyuncakKapat();
      yap(eylem);
    });
  });
  Array.prototype.forEach.call(oyuncakSec.querySelectorAll('button[data-toy]'), function (b) {
    b.addEventListener('click', function () {
      oyuncakKapat();
      if (adGerekli()) return;
      var toy = b.dataset.toy;
      if (toy !== 'lazer') { yap('play', { toy: toy }); return; }
      var c = D.anlik();
      if (c && (c.resting || c.energy < D.kurallar.play_min_energy)) { yap('play', { toy: 'lazer', bonus: 0 }); return; }
      mesaj('Lazer oyunu: noktayı odada gezdir, ' + AD + ' yakalamaya çalışsın! (10 sn, Esc ile bitir)', 'ozlem');
      bekliyor = true;
      dugmeler();
      if (avatar) avatar.dur(true);
      window.KediLazer.oyna($('oda'), $('oda-zemin'), kedi).then(function (n) {
        bekliyor = false;
        if (avatar) avatar.dur(false);
        // Sunucu da sınırlar; mesaj gerçek yakalama sayısını söyler
        yap('play', { toy: 'lazer', bonus: Math.min(n, D.kurallar.max_game_bonus || 10), yakalama: n });
      });
    });
  });
  oyuncakSec.addEventListener('keydown', function (e) { if (e.key === 'Escape') { oyuncakKapat(); $('oynat-btn').focus(); } });

  // Ödül maması: kişi başı günde bir; verildiyse düğme bunu söyler
  var odulBtn = document.querySelector('.eylem[data-eylem="treat"]');
  function odulDugmesi() {
    var verildi = D.odulVerildi() && (D.mod === 'demo' || !!D.ben);
    odulBtn.classList.toggle('kullanildi', verildi);
    odulBtn.querySelector('.odul-not').textContent = verildi ? 'bugün verildi' : 'günde bir';
  }

  // ---- Sevme: kediye dokun ya da "Sev" düğmesi ----
  var sonSevme = 0;
  function sev() {
    if (Date.now() - sonSevme < 1200) return;
    sonSevme = Date.now();
    kedi.sev();
    D.sev();
  }
  // Kediye dokununca hemen mırlar; Sev düğmesinde avatar gidip sever
  $('oda-zemin').addEventListener('click', function (e) { if (e.target.closest('.kedi')) sev(); });
  $('sev-btn').addEventListener('click', function () {
    if (Date.now() - sonSevme < 1200) return;
    sonSevme = Date.now();
    D.sev();
    if (avatar && !geceMi()) avatar.sevmeyeGit(); else kedi.sev();
  });

  // ---- Kedinin sözleri: ara sıra ihtiyacını ya da bakanın adını söyler ----
  function geceMi() { return K.gunDilimi(D.simdi()) === 'gece'; }
  function konus() {
    var c = D.anlik();
    if (!c || document.hidden || geceMi()) return;
    var ben = D.ben, oz = D.ozlenenler().filter(function (m) { return !ben || m.id !== ben.id; })[0];
    var l = K.sozler(c, ben && ben.name, oz && oz.name);
    if (l.length) kedi.soyle(l[Math.floor(Math.random() * l.length)]);
  }
  (function dongu() { setTimeout(function () { konus(); dongu(); }, 35000 + Math.random() * 35000); })();
  setTimeout(konus, 6000);

  // ---- Sahne: gökyüzü, süsler, kazanılan eşyalar ----
  var tatiller = [];
  fetch('data/akademik-takvim.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (v) {
      if (!v) return;
      tatiller = v.etkinlikler.filter(function (e) { return e.tur === 'tatil'; });
      sahneCiz();
    })
    .catch(function () {});
  function sahneCiz() {
    var simdi = D.simdi();
    window.KediSahne.ciz($('oda'), {
      dilim: K.gunDilimi(simdi),
      sus: K.susleme(simdi, tatiller),
      esyalar: K.esyalar(D.hafta.completed)
    });
  }

  // ---- Haftalık hedef ve özet ----
  function haftaGoster() {
    var h = D.hafta, o = K.haftalikOzet(D.aktivite, D.simdi());
    var sayi = Math.max(h.count, o.toplam);
    var yuzde = Math.min(100, Math.round(sayi / h.goal * 100));
    $('hafta-sayi').textContent = sayi + ' / ' + h.goal;
    var bar = $('hafta-bar');
    bar.setAttribute('aria-valuenow', sayi);
    bar.setAttribute('aria-valuemax', h.goal);
    bar.querySelector('i').style.width = yuzde + '%';
    var kazanilan = K.esyalar(h.completed);
    var siradaki = K.ODA_ESYALARI[h.completed];
    var tamam = sayi >= h.goal;
    $('hafta-odul').textContent = tamam
      ? 'Hedef tuttu! Bu haftanın ödülü odaya geldi.'
      : siradaki ? 'Hedef tutarsa odaya gelecek: ' + siradaki.ad + '.' : 'Bütün eşyalar kazanıldı; hedef yine de sayılıyor.';
    var ol = $('hafta-ozet');
    ol.textContent = '';
    function satir(metin) { var li = document.createElement('li'); li.textContent = metin; ol.appendChild(li); }
    if (o.kisiler.length) {
      satir('En çok bakan: ' + o.kisiler.slice(0, 3).map(function (k) { return (k.ad || 'bu tarayıcı') + ' (' + k.n + ')'; }).join(', '));
    }
    if (o.oyuncak) satir('En çok oynanan: ' + o.oyuncak);
    if (kazanilan.length) satir('Odadaki eşyalar: ' + kazanilan.map(function (e) { return e.ad; }).join(', '));
    if (!ol.children.length) satir('Bu hafta henüz bakım yok.');
  }

  // ---- Günlük ----
  var gunlukGun = 'bugun';
  function gunlukGoster() {
    var simdi = D.simdi();
    var gun = K.yerel(gunlukGun === 'bugun' ? simdi : simdi - 864e5).gun;
    $('gunluk-metin').textContent = K.gunlukMetni(K.gunOzeti(D.aktivite, gun), gunlukGun === 'bugun');
    Array.prototype.forEach.call(document.querySelectorAll('.gunluk-sec button'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.gun === gunlukGun));
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.gunluk-sec button'), function (b) {
    b.addEventListener('click', function () { gunlukGun = b.dataset.gun; gunlukGoster(); });
  });

  // ---- Görünüş oyları ----
  var SECENEK = {
    collar: [['yok', 'Yok'], ['kirmizi', 'Kırmızı'], ['mavi', 'Mavi'], ['yesil', 'Yeşil'], ['mor', 'Mor'], ['sari', 'Sarı']],
    coat: [['turuncu', 'Turuncu'], ['gri', 'Gri'], ['siyah', 'Siyah'], ['krem', 'Krem']]
  };
  function gorunusGoster() {
    var k = D.kozmetik;
    kedi.kostum(k);
    if (D.mod !== 'canli') return;
    $('gorunus').hidden = false;
    var ben = D.ben;
    ['collar', 'coat'].forEach(function (tur) {
      var kutu = $('oy-' + tur);
      kutu.textContent = '';
      var benim = ben && k.votes.filter(function (v) { return v.member_id === ben.id && v.kind === tur; })[0];
      SECENEK[tur].forEach(function (s) {
        var n = k.votes.filter(function (v) { return v.kind === tur && v.value === s[0]; }).length;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'renk';
        b.dataset.deger = s[0];
        b.dataset.tur = tur;
        if (k[tur] === s[0]) b.classList.add('kazanan');
        b.setAttribute('aria-pressed', String(!!benim && benim.value === s[0]));
        b.innerHTML = '<i aria-hidden="true"></i><span></span>';
        b.querySelector('span').textContent = s[1] + (n ? ' · ' + n : '');
        b.title = s[1] + ': ' + n + ' oy' + (k[tur] === s[0] ? ' (şu an bu)' : '');
        b.addEventListener('click', function () {
          if (adGerekli()) return;
          b.disabled = true;
          D.oyVer(tur, s[0]).then(function () {
            mesaj('Oyun kaydedildi: ' + (tur === 'collar' ? 'tasma ' : 'tüy ') + s[1].toLocaleLowerCase('tr') + '.', 'tamam');
          }, function () {
            mesaj('Oy kaydedilemedi. Bağlantını kontrol edip tekrar dene.', 'hata');
            b.disabled = false;
          });
        });
        kutu.appendChild(b);
      });
    });
  }

  // ---- Masaüstü bildirimi ----
  function bildirimGoster() {
    var B = window.KediBildirim;
    var kutu = $('bildirim-kutu');
    if (!B || !B.destekleniyor) return;
    kutu.hidden = false;
    var btn = $('bildirim-btn');
    btn.setAttribute('aria-checked', String(B.acik));
  }
  $('bildirim-btn').addEventListener('click', function () {
    window.KediBildirim.degistir().then(function (acik) {
      bildirimGoster();
      if (!acik && 'Notification' in window && Notification.permission === 'denied') {
        mesaj('Bildirim izni verilmedi. Adres çubuğundaki site ayarlarından izin verip tekrar dene.', 'hata');
      }
    });
  });

  // ---- Bağlılık: kedinin en çok bağlandığı kişi gelince koşarak karşılar (oturum başına bir kez) ----
  function baglilikKarsila() {
    if (D.mod !== 'canli' || !D.ben || !D.anlik() || geceMi()) return;
    var b = K.baglilik(D.aktivite, D.simdi());
    if (!b || b.id !== D.ben.id) return;
    try { if (sessionStorage.getItem('kedi-karsiladi') === String(D.ben.id)) return; sessionStorage.setItem('kedi-karsiladi', String(D.ben.id)); } catch (e) {}
    setTimeout(function () { kedi.kos(0.08, D.ben.name + '! Seni bekliyordum'); }, 1200);
  }

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

  // ---- Ad seçimi (canlı mod): giriş yok, bakan kişi adını seçer; seçim bu tarayıcıda hatırlanır ----
  var kimAcik = false;
  function kimAc() {
    kimAcik = true;
    kimGoster();
    var ilk = $('kim').querySelector('.kisi, input');
    if (ilk) ilk.focus();
  }

  function kimGoster() {
    var k = $('kim');
    if (D.mod !== 'canli') return;
    k.hidden = false;
    k.textContent = '';
    var ben = D.ben;
    if (ben && !kimAcik) {
      var p = document.createElement('p');
      var b = document.createElement('b');
      b.textContent = ben.name;
      p.append(b, ' olarak bakıyorsun.');
      var deg = document.createElement('button');
      deg.type = 'button';
      deg.className = 'ikincil';
      deg.textContent = 'Değiştir';
      deg.addEventListener('click', kimAc);
      k.append(p, deg);
      return;
    }

    var h = document.createElement('p');
    h.innerHTML = '<b>Kediye kim bakıyor?</b> Adını seç; bakımların bu adla kaydedilir ve bu tarayıcı seni hatırlar.';
    k.appendChild(h);
    if (D.ekip.length) {
      var liste = document.createElement('div');
      liste.className = 'kisiler';
      liste.setAttribute('role', 'group');
      liste.setAttribute('aria-label', 'Ekip');
      D.ekip.forEach(function (m) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kisi';
        btn.textContent = m.name;
        btn.setAttribute('aria-pressed', String(!!ben && ben.id === m.id));
        btn.addEventListener('click', function () {
          kimAcik = false;
          D.benSec(m.id);
          mesaj('', '');
          selamla();
        });
        liste.appendChild(btn);
      });
      k.appendChild(liste);
    }
    var form = document.createElement('form');
    var girdi = document.createElement('input');
    girdi.type = 'text';
    girdi.maxLength = 30;
    girdi.required = true;
    girdi.autocomplete = 'given-name';
    girdi.placeholder = D.ekip.length ? 'Listede yoksan adını yaz' : 'Adın';
    girdi.setAttribute('aria-label', 'Yeni ad');
    var ekle = document.createElement('button');
    ekle.type = 'submit';
    ekle.textContent = 'Ekle';
    form.append(girdi, ekle);
    var mesajEl = document.createElement('p');
    mesajEl.className = 'kim-mesaj';
    mesajEl.setAttribute('aria-live', 'polite');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ekle.disabled = true;
      D.isimEkle(girdi.value).then(function (m) {
        kimAcik = false;
        kimGoster();
        mesaj(m.existed ? m.name + ' zaten listedeydi; onu seçtim.' : 'Hoş geldin ' + m.name + '! ' + AD + ' seni tanıdı.', 'tamam');
      }, function (h) {
        mesajEl.textContent = {
          invalid_name: 'Ad 1–30 karakter olmalı.',
          team_full: 'Ekip listesi dolu (en çok 40 kişi).',
          rate_limited: 'Bu saat içinde çok fazla ad eklendi. Biraz sonra dene.'
        }[h.kod] || 'Ad eklenemedi. Bağlantını kontrol edip tekrar dene.';
        ekle.disabled = false;
      });
    });
    k.append(form, mesajEl);
    if (ben) {
      var vazgec = document.createElement('button');
      vazgec.type = 'button';
      vazgec.className = 'ikincil';
      vazgec.textContent = 'Vazgeç';
      vazgec.addEventListener('click', function () { kimAcik = false; kimGoster(); });
      k.appendChild(vazgec);
    }
  }

  // ---- Ekip listesi ve özlem ----
  function ozlenenMi(id) { return D.ozlenenler().some(function (o) { return o.id === id; }); }
  function benOzlendiMi() { return !!D.ben && ozlenenMi(D.ben.id); }

  function ozlemGoster() {
    var el = $('ozlem');
    var o = D.ozlenenler();
    if (D.mod !== 'canli' || !o.length) { el.hidden = true; return; }
    var adlar = o.slice(0, 3).map(function (m) { return m.name; });
    var fazla = o.length - adlar.length;
    el.textContent = AD + ' özledi: ' + adlar.join(', ') + (fazla > 0 ? ' ve ' + fazla + ' kişi daha' : '') + '.';
    el.hidden = false;
  }

  function ekipGoster() {
    if (D.mod !== 'canli') return;
    $('ekip-bolum').hidden = false;
    var ol = $('ekip-liste');
    ol.textContent = '';
    if (!D.ekip.length) {
      var bos = document.createElement('li');
      bos.className = 'bos';
      bos.textContent = 'Henüz kimse ad eklemedi. İlk sen ekle.';
      ol.appendChild(bos);
      return;
    }
    var ben = D.ben;
    var rozetler = K.rozetler(D.aktivite);
    D.ekip.forEach(function (m) {
      var li = document.createElement('li');
      var ozlem = ozlenenMi(m.id);
      if (ozlem) li.className = 'ozlenen';
      var ad = document.createElement('span');
      ad.className = 'ekip-ad';
      ad.textContent = m.name + (ben && ben.id === m.id ? ' (sen)' : '');
      var son = document.createElement('span');
      son.className = 'ekip-son';
      son.textContent = m.last_action_at ? 'Son bakım ' + gunOnce(m.last_action_at) : 'Henüz bakmadı';
      li.append(ad, son);
      var rz = rozetler['m' + m.id] || [];
      if (rz.length) {
        var rl = document.createElement('span');
        rl.className = 'rozetler';
        rz.forEach(function (r) {
          var x = document.createElement('span');
          x.className = 'rozet rozet-' + r.kod;
          x.textContent = r.ad;
          x.title = r.aciklama;
          rl.appendChild(x);
        });
        li.appendChild(rl);
      }
      if (ozlem) {
        var etiket = document.createElement('span');
        etiket.className = 'ekip-ozlem';
        etiket.textContent = AD + ' özledi';
        li.appendChild(etiket);
      }
      ol.appendChild(li);
    });
  }

  // Özlenen kişi gelince kedi karşılar (sayfa başına bir kez)
  var selamlandi = false;
  function selamla() {
    if (selamlandi || D.mod !== 'canli' || !D.ben || !D.anlik()) return;
    selamlandi = true;
    var o = D.ozlenenler().filter(function (m) { return m.id === D.ben.id; })[0];
    if (!o) return;
    mesaj(AD + ' seni özlemiş! ' + (o.hic ? 'Daha hiç bakım yapmadın; bir mama vermeye ne dersin?' : o.gun + ' gündür uğramıyordun.'), 'ozlem');
    // Uyuyan kedi karşılamak için uyanmaz
    if (!D.anlik().resting && !geceMi()) kedi.tepki('play');
  }

  if (D.mod === 'demo') {
    $('demo-not').hidden = false;
    $('sifirla').addEventListener('click', function () {
      D.sifirla();
      mesaj('Deneme baştan başladı.', 'tamam');
    });
  }

  D.dinle(function (tur, veri) {
    if (tur === 'durum') goster();
    if (tur === 'gecmis') { gecmisGoster(); sonBakan(); }
    if (tur === 'baglanti') rozet();
    if (tur === 'ekip') { ekipGoster(); ozlemGoster(); if (!kimAcik) kimGoster(); }
    if (tur === 'ben') { kimGoster(); ekipGoster(); gorunusGoster(); odulDugmesi(); baglilikKarsila(); }
    if (tur === 'aktivite') { ekipGoster(); gunlukGoster(); haftaGoster(); odulDugmesi(); baglilikKarsila(); }
    if (tur === 'hafta') { haftaGoster(); sahneCiz(); }
    if (tur === 'kozmetik') gorunusGoster();
    // Başkası bakım yapınca ya da sevince kedi tepki verir
    if (tur === 'eylem' && veri) kedi.tepki(veri.action);
    if (tur === 'sev') kedi.sev();
  });
  rozet();
  kimGoster();
  bildirimGoster();
  gorunusGoster();
  odulDugmesi();
  D.baslat({ gecmis: true, aktivite: true }).then(function () {
    rozet();
    gecmisGoster();
    kimGoster();
    selamla();
  }, function () { rozet(); });

  // Değerler yavaş değişir; yarım dakikada bir yeniden hesaplanır
  setInterval(function () {
    if (document.hidden) return;
    goster(); gecmisGoster(); ekipGoster(); gunlukGoster(); haftaGoster();
  }, 30000);
})();
