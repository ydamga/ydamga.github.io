// Ekip kedisinin durumu: nereden okunduğu, bakım eylemlerinin nereye gittiği.
// İki mod var; sayfa ikisini asla karıştırmaz:
//  - demo: kedi/baglanti.js boşsa. Durum yalnızca bu tarayıcıda (localStorage) tutulur, kimseyle paylaşılmaz.
//  - canli: kedi/baglanti.js doluysa. Durum Supabase'den okunur, eylemler sunucuda doğrulanıp uygulanır,
//    değişiklikler Realtime ile bütün açık sayfalara gelir. Bağlantı yoksa yerel duruma düşülmez; hata gösterilir.
//
// Kullanım: KediDurum.baslat({ gecmis: true }) → Promise; KediDurum.dinle(fn) her değişiklikte fn(olay) çağırır.
(function () {
  var AYAR = window.KEDI_AYAR;
  var BAG = window.KEDI_BAGLANTI || {};
  var K = window.KediKurallar;
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js';
  var DEMO_ANAHTAR = 'kedi-demo';
  var GECMIS_SINIR = 12;

  var dinleyiciler = [];
  var S = {
    mod: BAG.url && BAG.anahtar ? 'canli' : 'demo',
    pet: null,            // son anlık görüntü
    kurallar: AYAR.kurallar,
    fark: 0,              // sunucu saati - tarayıcı saati (ms)
    gecmis: [],
    sonBakim: null,       // son bakımın zamanı (herkes görür)
    baglanti: 'yukleniyor', // yukleniyor | acik | kopuk
    hata: null,
    oturum: { durum: 'yok', ad: null } // yok | uye | uye-degil (yalnızca canlı mod)
  };

  function yay(tur) { dinleyiciler.forEach(function (fn) { fn(tur); }); }
  function simdi() { return Date.now() + S.fark; }

  // Hata nesnesi: kod arayüzde mesaja çevrilir (kedi/oda.js)
  function hata(kod) { var e = new Error(kod); e.kod = kod; return e; }

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
        sb = window.supabase.createClient(BAG.url, BAG.anahtar, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        sb.auth.onAuthStateChange(function (olay, oturum) {
          // Supabase istemcisinin kilidi içinde başka istek beklememek için sıradaki adımda
          setTimeout(function () { canli.oturumYukle(oturum, ops); }, 0);
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
        S.hata = null;
        if (S.baglanti !== 'acik') { S.baglanti = 'acik'; yay('baglanti'); }
        yay('durum');
        if (ops.gecmis) return canli.gecmisYukle();
      }).catch(function (e) {
        canli.koptu(e);
        throw hata('network');
      });
    },
    gecmisYukle: function () {
      // RLS: geçmişi yalnızca ekip üyeleri görür; diğerlerine boş liste döner
      return sb.from('pet_actions')
        .select('id, action, result, reason, actor_name, created_at')
        .order('created_at', { ascending: false })
        .limit(GECMIS_SINIR)
        .then(function (r) {
          if (r.error) throw r.error;
          S.gecmis = r.data;
          yay('gecmis');
        });
    },
    oturumYukle: function (oturum, ops) {
      if (!oturum) {
        S.oturum = { durum: 'yok', ad: null };
        S.gecmis = [];
        yay('oturum');
        yay('gecmis');
        return;
      }
      sb.from('profiles').select('display_name, is_member').eq('id', oturum.user.id).maybeSingle()
        .then(function (r) {
          var p = r.data;
          S.oturum = {
            durum: p && p.is_member ? 'uye' : 'uye-degil',
            ad: (p && p.display_name) || oturum.user.email
          };
          yay('oturum');
          if (ops.gecmis) return canli.gecmisYukle();
        })
        .catch(function () {});
    },
    abone: function (ops) {
      sb.channel('ekip-kedisi')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pets' }, function (p) {
          S.pet = p.new;
          S.sonBakim = p.new.last_cared_at;
          yay('durum');
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pet_actions' }, function (p) {
          if (!ops.gecmis) return;
          if (S.gecmis.some(function (g) { return g.id === p.new.id; })) return;
          S.gecmis.unshift(p.new);
          S.gecmis = S.gecmis.slice(0, GECMIS_SINIR);
          yay('gecmis');
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
      // Tarayıcı yalnızca eylemin adını gönderir; değerleri sunucu hesaplar
      return sb.rpc('perform_pet_action', { p_action: eylem }).then(function (r) {
        if (r.error) {
          var m = r.error.message || '';
          var kod = ['not_authenticated', 'not_member', 'cooldown', 'rate_limited', 'invalid_action']
            .filter(function (k) { return m.indexOf(k) >= 0; })[0];
          if (!kod) canli.koptu();
          throw hata(kod || 'network');
        }
        var v = r.data;
        S.pet = v.pet;
        S.sonBakim = v.pet.last_cared_at;
        S.fark = Date.parse(v.server_now) - Date.now();
        yay('durum');
        return { result: v.result, reason: v.reason };
      }, function () {
        canli.koptu();
        throw hata('network');
      });
    }
  };

  var motor = S.mod === 'canli' ? canli : demo;

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
    get oturum() { return S.oturum; },
    islem: function (eylem) {
      if (S.mod === 'canli' && S.oturum.durum !== 'uye') {
        return Promise.reject(hata(S.oturum.durum === 'yok' ? 'not_authenticated' : 'not_member'));
      }
      return motor.islem(eylem);
    },
    // Yalnızca demo modu
    sifirla: function () { if (S.mod === 'demo') demo.sifirla(); },
    // Yalnızca canlı mod: e-postaya tek kullanımlık giriş bağlantısı. Yeni hesap açmaz (shouldCreateUser: false);
    // hesapları yönetici Supabase panelinden davet eder.
    girisBaglantisi: function (eposta) {
      return sb.auth.signInWithOtp({
        email: eposta,
        options: { shouldCreateUser: false, emailRedirectTo: location.href.split('#')[0].split('?')[0] }
      }).then(function (r) {
        if (!r.error) return;
        // Kayıtlı olmayan adres için de aynı mesaj gösterilir; hangi adreslerin ekipte olduğu dışarı sızmasın
        if (/signup|not allowed|not found/i.test(r.error.message)) return;
        if (r.error.status === 429) throw hata('rate_limited');
        throw hata('network');
      }, function () { throw hata('network'); });
    },
    cikis: function () { return sb.auth.signOut(); }
  };
})();
