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
  var EYLEMLER = ['feed', 'play', 'rest', 'clean'];

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

  // Bakım eylemi. Dönüş: { result: 'applied' | 'declined', reason, pet: yeni anlık görüntü }
  // Reddedilen eylem kaydı değiştirmez.
  function uygula(pet, eylem, k, simdi) {
    if (EYLEMLER.indexOf(eylem) < 0) throw new Error('invalid_action');
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
        c.happiness = sinirla(c.happiness + k.play_amount);
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
    } else if (eylem === 'clean') {
      if (c.cleanliness >= k.full_cleanliness) neden = 'already_clean';
      else c.cleanliness = sinirla(c.cleanliness + k.clean_amount);
    }
    if (neden) return { result: 'declined', reason: neden, pet: pet };
    return {
      result: 'applied',
      reason: null,
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
    sure: sure
  };
});
