// Ekip kedisinin oyun kuralları: geçen süreye göre ihtiyaçları hesaplar, bakım eylemlerini uygular,
// ruh hâlini ve gösterge metinlerini çıkarır. DOM'a dokunmaz; tarayıcıda window.KediKurallar,
// Node'da require() ile kullanılır (testler: test/kedi-kurallar.test.js).
//
// Kedinin kaydı bir "anlık görüntüdür": { hunger, happiness, energy, cleanliness, updated_at, resting_until }.
// Değerler updated_at anındaki değerlerdir; o andan sonrası her okumada geçen süreden hesaplanır.
// supabase/schema.sql'deki private.pet_current() ve public.perform_pet_action() aynı hesabı sunucuda yapar;
// birini değiştirirseniz ötekini de değiştirin.
(function (kok, kur) {
  if (typeof module === 'object' && module.exports) module.exports = kur();
  else kok.KediKurallar = kur();
})(this, function () {
  var SAAT = 3600 * 1000;
  var EYLEMLER = ['feed', 'play', 'rest', 'wake', 'clean', 'treat'];
  var OYUNCAKLAR = ['top', 'ip', 'lazer'];
  var IST = 3 * SAAT; // Türkiye saati UTC+3 (yaz saati yok)

  function sinirla(x) { return Math.min(100, Math.max(0, x)); }
  function zaman(t) { return t == null ? null : typeof t === 'number' ? t : Date.parse(t); }

  // Anlık görüntüden "şimdi"ki değerler
  function hesapla(pet, k, simdi) {
    var t0 = zaman(pet.updated_at);
    var h = Math.max(0, (simdi - t0) / SAAT);
    var bitis = zaman(pet.resting_until);
    var dinlenme = bitis != null && bitis > t0 ? Math.max(0, (Math.min(simdi, bitis) - t0) / SAAT) : 0;
    // Dinlenme anlık görüntünün başından başlar: önce dinlenme, sonra uyanık geçen süre
    var enerji = sinirla(sinirla(Number(pet.energy) + dinlenme * k.energy_rest_per_hour) - (h - dinlenme) * k.energy_drop_per_hour);
    return {
      hunger: sinirla(Number(pet.hunger) + h * k.hunger_rise_per_hour),
      happiness: sinirla(Number(pet.happiness) - h * k.happiness_drop_per_hour),
      energy: enerji,
      cleanliness: sinirla(Number(pet.cleanliness) - h * k.cleanliness_drop_per_hour),
      resting: bitis != null && simdi < bitis,
      resting_until: bitis != null && simdi < bitis ? bitis : null
    };
  }

  // Türkiye saatiyle ISO hafta numarası (supabase: extract(week from ... at time zone 'Europe/Istanbul'))
  function isoHafta(t) {
    var d = new Date(t + IST);
    var gun = (d.getUTCDay() + 6) % 7; // pazartesi 0
    var persembe = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - gun + 3);
    var yilBasi = Date.UTC(new Date(persembe).getUTCFullYear(), 0, 1);
    return Math.ceil(((persembe - yilBasi) / 864e5 + 1) / 7);
  }
  // Haftanın gözde oyuncağı her hafta değişir (supabase: private.favorite_toy)
  function favoriOyuncak(t) { return OYUNCAKLAR[isoHafta(t) % 3]; }

  // Bakım eylemi. Dönüş: { result: 'applied' | 'declined', reason, pet: yeni anlık görüntü, toy, favorite }
  // Reddedilen eylem kaydı değiştirmez.
  // ek: { toy: 'top'|'ip'|'lazer', bonus: lazer oyunundaki yakalama sayısı, odulVerildi: bugün ödül maması verdi mi }
  function uygula(pet, eylem, k, simdi, ek) {
    ek = ek || {};
    if (EYLEMLER.indexOf(eylem) < 0) throw new Error('invalid_action');
    var oyuncak = null, favori = false, bonus = 0;
    if (eylem === 'play') {
      oyuncak = ek.toy || 'top';
      if (OYUNCAKLAR.indexOf(oyuncak) < 0) throw new Error('invalid_action');
      favori = oyuncak === favoriOyuncak(simdi);
      if (oyuncak === 'lazer') bonus = Math.min(Math.max(Math.round(ek.bonus || 0), 0), k.max_game_bonus || 0);
    }
    var c = hesapla(pet, k, simdi);
    var neden = null;
    if (eylem === 'feed') {
      if (c.hunger <= k.full_hunger) neden = 'already_full';
      else c.hunger = sinirla(c.hunger - k.feed_amount);
    } else if (eylem === 'play') {
      if (c.resting) neden = 'sleeping';
      else if (c.energy < k.play_min_energy) neden = 'too_tired';
      else if (c.happiness >= k.full_happiness) neden = 'already_happy';
      else {
        c.happiness = sinirla(c.happiness + k.play_amount + (favori ? k.favorite_toy_bonus || 0 : 0) + bonus);
        c.energy = sinirla(c.energy - k.play_energy_cost);
      }
    } else if (eylem === 'rest') {
      if (c.resting) neden = 'already_resting';
      else if (c.energy >= k.full_energy) neden = 'not_tired';
      else {
        // Enerji 100'e ulaşınca erken uyanır
        var gereken = k.energy_rest_per_hour > 0 ? (100 - c.energy) / k.energy_rest_per_hour : k.rest_max_hours;
        c.resting_until = simdi + Math.min(k.rest_max_hours, gereken) * SAAT;
      }
    } else if (eylem === 'wake') {
      // Uyandırma: o ana kadar kazanılan enerji kalır, uyku biter
      if (!c.resting) neden = 'not_sleeping';
      else c.resting_until = null;
    } else if (eylem === 'clean') {
      if (c.cleanliness >= k.full_cleanliness) neden = 'already_clean';
      else c.cleanliness = sinirla(c.cleanliness + k.clean_amount);
    } else if (eylem === 'treat') {
      // Ödül maması: kişi başı günde bir
      if (ek.odulVerildi) neden = 'treat_used';
      else {
        c.hunger = sinirla(c.hunger - k.treat_hunger);
        c.happiness = sinirla(c.happiness + k.treat_happiness);
      }
    }
    if (neden) return { result: 'declined', reason: neden, pet: pet, toy: oyuncak, favorite: false, bonus: 0 };
    return {
      result: 'applied',
      reason: null,
      toy: oyuncak,
      favorite: favori,
      bonus: bonus,
      pet: {
        hunger: c.hunger,
        happiness: c.happiness,
        energy: c.energy,
        cleanliness: c.cleanliness,
        updated_at: new Date(simdi).toISOString(),
        resting_until: c.resting_until == null ? null : new Date(c.resting_until).toISOString()
      }
    };
  }

  // Göstergeler: her ihtiyaç için değer, "iyilik" (yüksek = iyi), seviye ve kısa metin.
  // Açlıkta yüksek değer kötüdür; diğerlerinde iyidir.
  var IHTIYACLAR = [
    { anahtar: 'hunger', ad: 'Açlık', ters: true, metinler: ['Tok', 'Biraz aç', 'Aç', 'Çok aç'] },
    { anahtar: 'happiness', ad: 'Mutluluk', metinler: ['Neşeli', 'Sakin', 'Keyifsiz', 'Üzgün'] },
    { anahtar: 'energy', ad: 'Enerji', metinler: ['Dinç', 'Normal', 'Yorgun', 'Bitkin'] },
    { anahtar: 'cleanliness', ad: 'Temizlik', metinler: ['Tertemiz', 'Fena değil', 'Tozlu', 'Çok kirli'] }
  ];
  function ihtiyaclar(c) {
    return IHTIYACLAR.map(function (i) {
      var deger = Math.round(c[i.anahtar]);
      var iyilik = i.ters ? 100 - c[i.anahtar] : c[i.anahtar];
      var sira = iyilik >= 70 ? 0 : iyilik >= 45 ? 1 : iyilik >= 25 ? 2 : 3;
      return {
        anahtar: i.anahtar,
        ad: i.ad,
        deger: deger,
        seviye: iyilik >= 60 ? 'iyi' : iyilik >= 30 ? 'orta' : 'dusuk',
        metin: i.metinler[sira]
      };
    });
  }

  // Kedinin davranışını yönlendiren işaretler
  function isaretler(c) {
    return {
      uyuyor: c.resting,
      ac: c.hunger > 60,
      uzgun: c.happiness < 30,
      yorgun: c.energy < 25,
      kirli: c.cleanliness < 35,
      mutlu: c.hunger < 40 && c.happiness > 70 && c.cleanliness > 60
    };
  }

  // Ruh hâli ve kısa durum mesajı; en acil ihtiyaç önce
  function ruhHali(c, simdi) {
    if (c.resting) {
      var dk = Math.max(1, Math.round((c.resting_until - simdi) / 60000));
      return { kod: 'uyuyor', ad: 'Uykuda', mesaj: 'Mışıl mışıl uyuyor; yaklaşık ' + sure(dk) + ' sonra uyanacak.' };
    }
    if (c.energy < 20) return { kod: 'yorgun', ad: 'Uykulu', mesaj: 'Gözleri kapanıyor, biraz dinlenmek istiyor.' };
    if (c.hunger > 75) return { kod: 'ac', ad: 'Aç', mesaj: 'Mama kabını düşünüyor.' };
    if (c.cleanliness < 25) return { kod: 'kirli', ad: 'Pasaklı', mesaj: 'Tüyleri karışmış, taranmak istiyor.' };
    if (c.happiness < 25) return { kod: 'uzgun', ad: 'Keyifsiz', mesaj: 'Biraz yalnız hissediyor, oyun arkadaşı arıyor.' };
    if (c.hunger > 55) return { kod: 'ac', ad: 'Acıkıyor', mesaj: 'Arada bir mama kabına göz atıyor.' };
    if (c.energy < 40) return { kod: 'yorgun', ad: 'Yorgun', mesaj: 'Sık sık esniyor.' };
    if (c.cleanliness < 45) return { kod: 'kirli', ad: 'Tozlu', mesaj: 'Kendini temizlemeye çalışıyor.' };
    if (c.happiness < 45) return { kod: 'uzgun', ad: 'Durgun', mesaj: 'Pek oynamak istemiyor, biraz ilgi iyi gelir.' };
    if (c.happiness > 70 && c.hunger < 40) return { kod: 'mutlu', ad: 'Keyfi yerinde', mesaj: 'Etrafı kolaçan ediyor, kuyruğu havada.' };
    return { kod: 'sakin', ad: 'Sakin', mesaj: 'Kendi hâlinde dolaşıyor.' };
  }

  // Kedinin özlediği kişiler: en az "gun" gündür uğramayanlar (hiç uğramamışsa listeye eklendiği andan sayılır).
  // ekip: [{ id, name, created_at, last_action_at }]. En uzun süredir uğramayan önce.
  function ozlenenler(ekip, simdi, gun) {
    var esik = gun * 864e5;
    return (ekip || [])
      .map(function (m) {
        var son = zaman(m.last_action_at) || zaman(m.created_at);
        return { id: m.id, name: m.name, gun: Math.floor((simdi - son) / 864e5), hic: !m.last_action_at, son: son };
      })
      .filter(function (m) { return m.son != null && simdi - m.son >= esik; })
      .sort(function (a, b) { return a.son - b.son; });
  }

  // ---------------------------------------------------------------------------
  // Etkinlik özetleri. "aktivite": kabul edilmiş bakımlar
  //   [{ member_id, actor_name, action, toy, bonus, created_at }] (eskiden yeniye ya da karışık)
  // Hepsi Türkiye saatine göre gün/hafta sayar.
  // ---------------------------------------------------------------------------
  var GUN = 864e5;
  function yerel(t) {
    var d = new Date(zaman(t) + IST);
    return {
      gun: d.toISOString().slice(0, 10),
      saat: d.getUTCHours(),
      haftaGunu: (d.getUTCDay() + 6) % 7, // pazartesi 0 … pazar 6
      ay: d.getUTCMonth() + 1,
      ayGunu: d.getUTCDate()
    };
  }
  // Bu haftanın pazartesi 00:00'ı (Türkiye saatiyle), ms
  function haftaBasi(simdi) {
    var y = yerel(simdi);
    return Date.parse(y.gun + 'T00:00:00Z') - IST - y.haftaGunu * GUN;
  }
  function kisiAnahtari(a) { return a.member_id != null ? 'm' + a.member_id : 'a' + (a.actor_name || ''); }

  // Kişi başına sayım; çoktan aza
  function kisiSay(liste) {
    var say = {};
    liste.forEach(function (a) {
      var k = kisiAnahtari(a);
      if (!say[k]) say[k] = { id: a.member_id, ad: a.actor_name, n: 0 };
      say[k].n++;
    });
    return Object.keys(say).map(function (k) { return say[k]; })
      .sort(function (a, b) { return b.n - a.n || String(a.ad).localeCompare(String(b.ad), 'tr'); });
  }
  function enCok(liste, alan) {
    var say = {}, en = null;
    liste.forEach(function (a) { if (a[alan]) say[a[alan]] = (say[a[alan]] || 0) + 1; });
    Object.keys(say).forEach(function (k) { if (!en || say[k] > say[en]) en = k; });
    return en;
  }

  // Haftalık özet: bu haftaki bakım sayısı, en çok bakanlar, en çok oynanan oyuncak
  function haftalikOzet(aktivite, simdi) {
    var bas = haftaBasi(simdi);
    var bu = (aktivite || []).filter(function (a) { var t = zaman(a.created_at); return t >= bas && t <= simdi; });
    return {
      toplam: bu.length,
      kisiler: kisiSay(bu),
      oyuncak: enCok(bu.filter(function (a) { return a.action === 'play'; }), 'toy')
    };
  }

  // Bir günün dökümü (gun: 'YYYY-MM-DD', Türkiye saati)
  function gunOzeti(aktivite, gun) {
    var o = { toplam: 0, eylem: {}, kisiler: {}, oyuncak: {}, ilk: null, son: null };
    (aktivite || []).forEach(function (a) {
      if (yerel(a.created_at).gun !== gun) return;
      o.toplam++;
      o.eylem[a.action] = (o.eylem[a.action] || 0) + 1;
      (o.kisiler[a.action] = o.kisiler[a.action] || []).push(a);
      if (a.action === 'play' && a.toy) o.oyuncak[a.toy] = (o.oyuncak[a.toy] || 0) + 1;
      var t = zaman(a.created_at);
      if (o.ilk == null || t < o.ilk) o.ilk = t;
      if (o.son == null || t > o.son) o.son = t;
    });
    Object.keys(o.kisiler).forEach(function (k) { o.kisiler[k] = kisiSay(o.kisiler[k]); });
    return o;
  }

  // Kedinin ağzından günlük paragrafı
  // Ünlü uyumuyla: topla, iple, lazerle
  var OYUNCAKLA = { top: 'topla', ip: 'iple', lazer: 'lazerle' };
  function gunlukMetni(o, bugunMu) {
    if (!o.toplam) {
      return bugunMu
        ? 'Bugün daha kimse uğramadı. Pencereden dışarıyı izleyip kapıya kulak kabartıyorum.'
        : 'O gün kimse uğramamış. Sessiz bir gündü.';
    }
    var c = [];
    function kim(eylem) {
      var k = o.kisiler[eylem];
      if (!k || !k.length) return '';
      return k[0].n > 1 && k.length > 1 ? ' (en çok ' + k[0].ad + ')' : k.length === 1 ? ' (' + k[0].ad + ')' : '';
    }
    var e = o.eylem;
    if (e.feed) c.push(e.feed + ' kez mama yedim' + kim('feed'));
    if (e.treat) c.push(e.treat + ' kez ödül maması kaptım' + kim('treat'));
    if (e.play) {
      var oy = Object.keys(o.oyuncak).sort(function (a, b) { return o.oyuncak[b] - o.oyuncak[a]; })
        .map(function (t) { return OYUNCAKLA[t]; });
      c.push(e.play + ' kez oynadım' + (oy.length ? ', en çok ' + oy[0] : '') + kim('play'));
    }
    if (e.clean) c.push(e.clean + ' kez tarandım' + kim('clean'));
    if (e.rest) c.push(e.rest + ' kez minderimde uyudum');
    if (e.wake) c.push(e.wake + ' kez uykumdan uyandırıldım' + kim('wake'));
    var cumle = c.length > 1 ? c.slice(0, -1).join(', ') + ' ve ' + c[c.length - 1] : c[0];
    var hepsi = {};
    Object.keys(o.kisiler).forEach(function (k) { o.kisiler[k].forEach(function (x) { hepsi[x.ad] = 1; }); });
    var kisiSayisi = Object.keys(hepsi).length;
    return (bugunMu ? 'Bugün ' : 'O gün ') + cumle + '. ' +
      (kisiSayisi > 1 ? kisiSayisi + ' kişi uğradı; ' : '') +
      (o.toplam >= 8 ? 'Çok güzel bir gündü!' : o.toplam >= 4 ? 'Fena değildi.' : 'Biraz daha ilgi isterdim.');
  }

  // Rozetler: son haftaların bakımlarından kişi başına kazanılanlar
  var ROZETLER = [
    { kod: 'sabah', ad: 'Sabah kuşu', aciklama: "09:00'dan önce 3 bakım" },
    { kod: 'gece', ad: 'Akşam nöbetçisi', aciklama: "18:00'den sonra 3 bakım" },
    { kod: 'seri', ad: 'Sadık dost', aciklama: '5 iş günü üst üste bakım' },
    { kod: 'mama', ad: 'Mama ustası', aciklama: '20 kez mama' },
    { kod: 'oyun', ad: 'Oyun arkadaşı', aciklama: '20 kez oyun' },
    { kod: 'tarak', ad: 'Tarak ustası', aciklama: '15 kez tarama' },
    { kod: 'odul', ad: 'Şımartan', aciklama: '5 kez ödül maması' },
    { kod: 'lazer', ad: 'Lazer avcısı', aciklama: 'Lazer oyununda 8 yakalama' }
  ];
  // En uzun iş günü serisi: hafta sonu seriyi bozmaz, atlanır
  function isGunuSerisi(gunler) {
    var liste = Object.keys(gunler).sort();
    if (!liste.length) return 0;
    var en = 0, seri = 0, t = Date.parse(liste[0] + 'T00:00:00Z'), son = Date.parse(liste[liste.length - 1] + 'T00:00:00Z');
    for (; t <= son; t += GUN) {
      var hg = (new Date(t).getUTCDay() + 6) % 7;
      if (hg >= 5) continue;
      if (gunler[new Date(t).toISOString().slice(0, 10)]) { seri++; if (seri > en) en = seri; }
      else seri = 0;
    }
    return en;
  }
  function rozetler(aktivite) {
    var kisi = {};
    (aktivite || []).forEach(function (a) {
      var k = kisiAnahtari(a);
      var x = kisi[k] = kisi[k] || { id: a.member_id, ad: a.actor_name, sabah: 0, gece: 0, gunler: {}, eylem: {}, lazer: 0 };
      var y = yerel(a.created_at);
      if (y.saat < 9) x.sabah++;
      if (y.saat >= 18) x.gece++;
      x.gunler[y.gun] = true;
      x.eylem[a.action] = (x.eylem[a.action] || 0) + 1;
      if (a.action === 'play' && a.toy === 'lazer' && (a.bonus || 0) > x.lazer) x.lazer = a.bonus;
    });
    var sonuc = {};
    Object.keys(kisi).forEach(function (k) {
      var x = kisi[k], e = x.eylem;
      var var_ = {
        sabah: x.sabah >= 3, gece: x.gece >= 3, seri: isGunuSerisi(x.gunler) >= 5,
        mama: (e.feed || 0) >= 20, oyun: (e.play || 0) >= 20, tarak: (e.clean || 0) >= 15,
        odul: (e.treat || 0) >= 5, lazer: x.lazer >= 8
      };
      sonuc[k] = ROZETLER.filter(function (r) { return var_[r.kod]; });
    });
    return sonuc;
  }

  // Kedinin en çok bağlandığı kişi: son 14 günde en çok bakan (en az 5 bakım, açık ara birinci)
  function baglilik(aktivite, simdi) {
    var bas = simdi - 14 * GUN;
    var k = kisiSay((aktivite || []).filter(function (a) { var t = zaman(a.created_at); return t >= bas && t <= simdi; }));
    if (!k.length || k[0].n < 5 || (k[1] && k[1].n === k[0].n)) return null;
    return k[0];
  }

  // Günün dilimi (pencere ve gece uykusu için)
  function gunDilimi(simdi) {
    var h = yerel(simdi).saat;
    return h >= 22 || h < 7 ? 'gece' : h < 11 ? 'sabah' : h < 17 ? 'gunduz' : 'aksam';
  }

  // Oda süsü: akademik takvimdeki tatil günleri, yılbaşı, yoksa mevsim
  // tatiller: [{ ad, bas: 'YYYY-MM-DD', bit?: 'YYYY-MM-DD' }]
  function susleme(simdi, tatiller) {
    var y = yerel(simdi);
    var tatil = (tatiller || []).filter(function (e) { return e.bas <= y.gun && (e.bit || e.bas) >= y.gun; })[0];
    if (tatil) {
      // Dini bayramlar; "Cumhuriyet Bayramı" gibi ulusal bayramlar bayrakla süslenir
      if (/Ramazan|Kurban/i.test(tatil.ad)) return { kod: 'bayram', ad: tatil.ad };
      if (/Yılbaşı/i.test(tatil.ad)) return { kod: 'yilbasi', ad: tatil.ad };
      return { kod: 'bayrak', ad: tatil.ad };
    }
    if ((y.ay === 12 && y.ayGunu >= 20) || (y.ay === 1 && y.ayGunu <= 6)) return { kod: 'yilbasi', ad: 'Yeni yıl' };
    if (y.ay >= 3 && y.ay <= 5) return { kod: 'bahar', ad: 'İlkbahar' };
    if (y.ay >= 6 && y.ay <= 8) return { kod: 'yaz', ad: 'Yaz' };
    if (y.ay >= 9 && y.ay <= 11) return { kod: 'sonbahar', ad: 'Sonbahar' };
    return { kod: 'kis', ad: 'Kış' };
  }

  // Haftalık hedefle kazanılan oda eşyaları (sırayla)
  var ODA_ESYALARI = [
    { kod: 'agac', ad: 'Kedi ağacı' },
    { kod: 'bitki', ad: 'Saksı çiçeği' },
    { kod: 'tablo', ad: 'Balık tablosu' },
    { kod: 'hali', ad: 'Yuvarlak halı' },
    { kod: 'lamba', ad: 'Ayaklı lamba' },
    { kod: 'sepet', ad: 'Yumak sepeti' }
  ];
  function esyalar(tamamlanan) { return ODA_ESYALARI.slice(0, Math.max(0, tamamlanan || 0)); }

  // Kedinin balonda söyleyebileceği sözler. kime: bakan kişinin adı (yoksa genel sözler),
  // ozlenen: kedinin özlediği birinin adı. Uyurken söz yok.
  function sozler(c, kime, ozlenen) {
    if (!c || c.resting) return [];
    var l = [];
    function ekle(adli, genel) { l.push(kime && adli ? adli : genel); }
    if (c.hunger > 60) { ekle(kime + ', mama?', 'Mama?'); l.push('Karnım guruldadı…'); l.push('Mama kabı boş görünüyor'); }
    if (c.happiness < 40) { ekle(kime + ', oynayalım mı?', 'Oynayalım mı?'); l.push('Çok sıkıldım'); l.push('Topum nerede?'); }
    if (c.cleanliness < 40) { ekle(kime + ', beni tarar mısın?', 'Tüylerim karıştı'); }
    if (c.energy < 25) l.push('Uykum geldi…');
    if (l.length) return l;
    if (ozlenen) l.push(ozlenen + ' nerede?');
    ekle('Merhaba ' + kime + '!', 'Mrrr…');
    l.push('Pencereden kuş izliyorum');
    l.push('Mrrr…');
    return l;
  }

  function sure(dk) {
    if (dk < 60) return dk + ' dk';
    var s = Math.floor(dk / 60), d = dk % 60;
    return s + ' sa' + (d ? ' ' + d + ' dk' : '');
  }

  return {
    EYLEMLER: EYLEMLER,
    hesapla: hesapla,
    uygula: uygula,
    ihtiyaclar: ihtiyaclar,
    isaretler: isaretler,
    ruhHali: ruhHali,
    ozlenenler: ozlenenler,
    OYUNCAKLAR: OYUNCAKLAR,
    isoHafta: isoHafta,
    favoriOyuncak: favoriOyuncak,
    yerel: yerel,
    haftaBasi: haftaBasi,
    haftalikOzet: haftalikOzet,
    gunOzeti: gunOzeti,
    gunlukMetni: gunlukMetni,
    ROZETLER: ROZETLER,
    rozetler: rozetler,
    kisiAnahtari: kisiAnahtari,
    baglilik: baglilik,
    gunDilimi: gunDilimi,
    susleme: susleme,
    ODA_ESYALARI: ODA_ESYALARI,
    esyalar: esyalar,
    sozler: sozler,
    sure: sure
  };
});
