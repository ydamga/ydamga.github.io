// Ekip kedisinin durumu: nereden okunduğu, bakım eylemlerinin nereye gittiği.
// İki mod var; sayfa ikisini asla karıştırmaz:
//  - demo: kedi/baglanti.js boşsa. Durum yalnızca bu tarayıcıda (localStorage) tutulur, kimseyle paylaşılmaz.
//  - canli: kedi/baglanti.js doluysa. Durum Supabase'den okunur, eylemler sunucuda doğrulanıp uygulanır,
//    değişiklikler Realtime ile bütün açık sayfalara gelir. Bağlantı yoksa yerel duruma düşülmez; hata gösterilir.
//
// Canlı modda giriş yoktur: bakan kişi ekip listesinden adını seçer (ya da yeni ad ekler); seçim bu tarayıcıda
// hatırlanır ve her bakım bu adla kaydedilir.
//
// Kullanım: KediDurum.baslat({ gecmis: true }) → Promise; KediDurum.dinle(fn) her değişiklikte fn(olay) çağırır.
// Olaylar: durum | gecmis | ekip | ben | baglanti
(function () {
  var AYAR = window.KEDI_AYAR;
  var BAG = window.KEDI_BAGLANTI || {};
  var K = window.KediKurallar;
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js';
  var DEMO_ANAHTAR = 'kedi-demo';
  var BEN_ANAHTAR = 'kedi-ben';
  var GECMIS_SINIR = 12;

  var dinleyiciler = [];
  var S = {
    mod: BAG.url && BAG.anahtar ? 'canli' : 'demo',
    pet: null,            // son anlık görüntü
    kurallar: AYAR.kurallar,
    fark: 0,              // sunucu saati - tarayıcı saati (ms)
    gecmis: [],
    ekip: [],             // [{ id, name, created_at, last_action_at }]
    ben: null,            // seçilen ekip üyesinin id'si (yalnızca canlı mod)
    sonBakim: null,       // son bakımın zamanı
    baglanti: 'yukleniyor', // yukleniyor | acik | kopuk
    hata: null
  };
  try { S.ben = Number(localStorage.getItem(BEN_ANAHTAR)) || null; } catch (e) {}

  function yay(tur) { dinleyiciler.forEach(function (fn) { fn(tur); }); }
  function simdi() { return Date.now() + S.fark; }

  // Hata nesnesi: kod arayüzde mesaja çevrilir (kedi/oda.js)
  function hata(kod) { var e = new Error(kod); e.kod = kod; return e; }
  function hataKodu(err, kodlar) {
    var m = (err && err.message) || '';
    return kodlar.filter(function (k) { return m.indexOf(k) >= 0; })[0];
  }

  // Seçili kişi listede yoksa (ör. yönetici sildiyse) seçim düşer
  function benDenetle() {
    if (S.ben && S.ekip.length && !S.ekip.some(function (m) { return m.id === S.ben; })) {
      S.ben = null;
      try { localStorage.removeItem(BEN_ANAHTAR); } catch (e) {}
      yay('ben');
    }
  }
  // Bakım denemesi (kabul ya da ret) kişinin son uğrama zamanını günceller
  function ugradi(uyeId, t) {
    var m = S.ekip.filter(function (x) { return x.id === uyeId; })[0];
    if (!m) return;
    if (!m.last_action_at || Date.parse(t) > Date.parse(m.last_action_at)) {
      m.last_action_at = t;
      yay('ekip');
    }
  }

  // ---- Yerel deneme modu ----
  var demo = {
    oku: function () {
      var v = null;
      try { v = JSON.parse(localStorage.getItem(DEMO_ANAHTAR)); } catch (e) {}
      if (!v || !v.pet) {
        var b = AYAR.baslangic;
        v = { pet: { hunger: b.hunger, happiness: b.happiness, energy: b.energy, cleanliness: b.cleanliness,
          updated_at: new Date().toISOString(), resting_until: null }, gecmis: [] };
      }
      S.pet = v.pet;
      S.gecmis = v.gecmis || [];
      S.sonBakim = v.sonBakim || null;
    },
    yaz: function () {
      try { localStorage.setItem(DEMO_ANAHTAR, JSON.stringify({ pet: S.pet, gecmis: S.gecmis, sonBakim: S.sonBakim })); } catch (e) {}
    },
    baslat: function () {
      demo.oku();
      S.baglanti = 'acik';
      // Aynı tarayıcının başka sekmesinde yapılan bakım (başka kullanıcılarla eşitleme yoktur)
      window.addEventListener('storage', function (e) {
        if (e.key !== DEMO_ANAHTAR) return;
        demo.oku();
        yay('durum');
        yay('gecmis');
      });
      yay('durum');
      yay('gecmis');
      return Promise.resolve();
    },
    islem: function (eylem) {
      demo.oku();
      var t = simdi();
      var s = K.uygula(S.pet, eylem, S.kurallar, t);
      S.pet = s.pet;
      S.gecmis.unshift({ id: t, action: eylem, result: s.result, reason: s.reason, actor_name: null, created_at: new Date(t).toISOString() });
      S.gecmis = S.gecmis.slice(0, GECMIS_SINIR);
      if (s.result === 'applied') S.sonBakim = S.gecmis[0].created_at;
      demo.yaz();
      yay('durum');
      yay('gecmis');
      return Promise.resolve({ result: s.result, reason: s.reason });
    },
    sifirla: function () {
      try { localStorage.removeItem(DEMO_ANAHTAR); } catch (e) {}
      demo.oku();
      yay('durum');
      yay('gecmis');
    }
  };

  // ---- Ortak canlı mod (Supabase) ----
  var sb = null;
  var canli = {
    yukle: function () {
      return new Promise(function (tamam, red) {
        if (window.supabase) return tamam();
        var s = document.createElement('script');
        s.src = SUPABASE_JS;
        s.crossOrigin = 'anonymous';
        s.onload = tamam;
        s.onerror = function () { red(hata('network')); };
        document.head.appendChild(s);
      });
    },
    baslat: function (ops) {
      return canli.yukle().then(function () {
        // Giriş yok: oturum saklanmaz
        sb = window.supabase.createClient(BAG.url, BAG.anahtar, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        canli.abone(ops);
        window.addEventListener('online', function () { canli.tazele(ops).catch(function () {}); });
        window.addEventListener('offline', function () { canli.koptu(); });
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') canli.tazele(ops).catch(function () {});
        });
        return canli.tazele(ops);
      });
    },
    tazele: function (ops) {
      var once = Date.now();
      return sb.rpc('get_pet_state').then(function (r) {
        if (r.error) throw r.error;
        var v = r.data;
        S.fark = Date.parse(v.server_now) - Math.round((once + Date.now()) / 2);
        S.pet = v.pet;
        S.kurallar = v.rules;
        S.sonBakim = v.pet.last_cared_at;
        S.ekip = v.team || [];
        S.hata = null;
        if (S.baglanti !== 'acik') { S.baglanti = 'acik'; yay('baglanti'); }
        benDenetle();
        yay('durum');
        yay('ekip');
      }).then(function () {
        // Geçmiş ayrı yüklenir: okunamaması sunucu bağlantısının koptuğu anlamına gelmez
        if (ops.gecmis) canli.gecmisYukle().catch(function () {});
      }, function (e) {
        canli.koptu(e);
        throw hata('network');
      });
    },
    gecmisYukle: function () {
      return sb.from('pet_actions')
        .select('id, member_id, action, result, reason, actor_name, created_at')
        .order('created_at', { ascending: false })
        .limit(GECMIS_SINIR)
        .then(function (r) {
          if (r.error) throw r.error;
          S.gecmis = r.data;
          yay('gecmis');
        });
    },
    abone: function (ops) {
      sb.channel('ekip-kedisi')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pets' }, function (p) {
          S.pet = p.new;
          S.sonBakim = p.new.last_cared_at;
          yay('durum');
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pet_actions' }, function (p) {
          ugradi(p.new.member_id, p.new.created_at);
          if (!ops.gecmis) return;
          if (S.gecmis.some(function (g) { return g.id === p.new.id; })) return;
          S.gecmis.unshift(p.new);
          S.gecmis = S.gecmis.slice(0, GECMIS_SINIR);
          yay('gecmis');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, function () {
          // Ekleme, ad düzeltme ya da silme: listeyi son uğrama zamanlarıyla birlikte yeniden al
          canli.tazele(ops).catch(function () {});
        })
        .subscribe(function (durum) {
          if (durum === 'SUBSCRIBED') {
            // Kopukken kaçırılan değişiklikleri al
            if (S.baglanti === 'kopuk') canli.tazele(ops).catch(function () {});
          } else if (durum === 'CHANNEL_ERROR' || durum === 'TIMED_OUT' || durum === 'CLOSED') {
            canli.koptu();
          }
        });
    },
    koptu: function () {
      if (S.baglanti === 'kopuk') return;
      S.baglanti = 'kopuk';
      yay('baglanti');
    },
    islem: function (eylem) {
      // Tarayıcı yalnızca eylemin adını ve bakan kişiyi gönderir; değerleri sunucu hesaplar
      return sb.rpc('perform_pet_action', { p_action: eylem, p_member_id: S.ben }).then(function (r) {
        if (r.error) {
          var kod = hataKodu(r.error, ['unknown_member', 'cooldown', 'rate_limited', 'invalid_action']);
          if (kod === 'unknown_member') { S.ben = null; try { localStorage.removeItem(BEN_ANAHTAR); } catch (e) {} yay('ben'); }
          if (!kod) canli.koptu();
          throw hata(kod || 'network');
        }
        var v = r.data;
        S.pet = v.pet;
        S.sonBakim = v.pet.last_cared_at;
        S.fark = Date.parse(v.server_now) - Date.now();
        ugradi(S.ben, v.server_now);
        yay('durum');
        return { result: v.result, reason: v.reason };
      }, function () {
        canli.koptu();
        throw hata('network');
      });
    },
    isimEkle: function (ad) {
      return sb.rpc('add_team_member', { p_name: ad }).then(function (r) {
        if (r.error) throw hata(hataKodu(r.error, ['invalid_name', 'team_full', 'rate_limited']) || 'network');
        var m = r.data;
        if (!S.ekip.some(function (x) { return x.id === m.id; })) {
          S.ekip.push({ id: m.id, name: m.name, created_at: m.created_at, last_action_at: null });
          S.ekip.sort(function (a, b) { return a.name.localeCompare(b.name, 'tr'); });
          yay('ekip');
        }
        return m;
      }, function () { throw hata('network'); });
    }
  };

  var motor = S.mod === 'canli' ? canli : demo;

  function benAyarla(id) {
    S.ben = id;
    try { id ? localStorage.setItem(BEN_ANAHTAR, String(id)) : localStorage.removeItem(BEN_ANAHTAR); } catch (e) {}
    yay('ben');
  }

  window.KediDurum = {
    mod: S.mod,
    ad: AYAR.ad,
    baslat: function (ops) {
      ops = ops || {};
      return motor.baslat(ops).catch(function (e) {
        S.baglanti = 'kopuk';
        S.hata = e.kod || 'network';
        yay('baglanti');
        throw e;
      });
    },
    dinle: function (fn) { dinleyiciler.push(fn); },
    simdi: simdi,
    // Şimdiki değerler; durum henüz okunmadıysa null
    anlik: function () {
      return S.pet ? K.hesapla(S.pet, S.kurallar, simdi()) : null;
    },
    get kurallar() { return S.kurallar; },
    get gecmis() { return S.gecmis; },
    get sonBakim() { return S.sonBakim; },
    get baglanti() { return S.baglanti; },
    get ekip() { return S.ekip; },
    // Seçili ekip üyesi ({ id, name, ... }) ya da null
    get ben() {
      return S.ben ? S.ekip.filter(function (m) { return m.id === S.ben; })[0] || null : null;
    },
    // Kedinin özlediği kişiler (KediKurallar.ozlenenler)
    ozlenenler: function () { return K.ozlenenler(S.ekip, simdi(), AYAR.ozlemGun); },
    islem: function (eylem) {
      if (S.mod === 'canli' && !S.ben) return Promise.reject(hata('no_name'));
      return motor.islem(eylem);
    },
    // Yalnızca canlı mod: ekipten birini seç / yeni ad ekleyip seç / seçimi bırak
    benSec: function (id) { benAyarla(id); },
    isimEkle: function (ad) {
      return canli.isimEkle(ad).then(function (m) { benAyarla(m.id); return m; });
    },
    // Yalnızca demo modu
    sifirla: function () { if (S.mod === 'demo') demo.sifirla(); }
  };
})();
