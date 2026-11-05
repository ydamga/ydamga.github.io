// kedi/kurallar.js birim testleri. Çalıştırma: node --test test/kedi-kurallar.test.js
// Oranlar kedi/ayar.js'ten okunur; testler oran değişince de geçerli kalır.
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../kedi/kurallar.js');

// kedi/ayar.js tarayıcı dosyası; değerleri buradan okunur
global.window = {};
require('../kedi/ayar.js');
const R = window.KEDI_AYAR.kurallar;

const SAAT = 3600 * 1000;
const T0 = Date.parse('2026-10-27T09:00:00Z');
const kedi = (o) => Object.assign({ hunger: 30, happiness: 70, energy: 70, cleanliness: 80, updated_at: new Date(T0).toISOString(), resting_until: null }, o);
const yakin = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' ≈ ' + b);

test('geçen süreye göre ihtiyaçlar değişir', () => {
  const c = K.hesapla(kedi(), R, T0 + 5 * SAAT);
  const s = (x) => Math.min(100, Math.max(0, x));
  yakin(c.hunger, s(30 + 5 * R.hunger_rise_per_hour));
  yakin(c.happiness, s(70 - 5 * R.happiness_drop_per_hour));
  yakin(c.cleanliness, s(80 - 5 * R.cleanliness_drop_per_hour));
  yakin(c.energy, s(70 - 5 * R.energy_drop_per_hour));
  assert.equal(c.resting, false);
});

test('değerler 0–100 dışına çıkmaz', () => {
  const c = K.hesapla(kedi(), R, T0 + 1000 * SAAT);
  assert.equal(c.hunger, 100);
  assert.equal(c.happiness, 0);
  assert.equal(c.cleanliness, 0);
  assert.equal(c.energy, 0);
  const s = K.uygula(kedi({ hunger: 20 }), 'feed', R, T0);
  assert.equal(s.pet.hunger, 0);
  const t = K.uygula(kedi({ cleanliness: 90 }), 'clean', R, T0);
  assert.equal(t.pet.cleanliness, 100);
});

test('saat geri giderse değerler değişmez', () => {
  const c = K.hesapla(kedi(), R, T0 - SAAT);
  yakin(c.hunger, 30);
  yakin(c.energy, 70);
});

test('besleme açlığı 25 azaltır; tokken reddedilir', () => {
  const s = K.uygula(kedi({ hunger: 60 }), 'feed', R, T0);
  assert.equal(s.result, 'applied');
  yakin(s.pet.hunger, 35);
  const r = K.uygula(kedi({ hunger: 8 }), 'feed', R, T0);
  assert.equal(r.result, 'declined');
  assert.equal(r.reason, 'already_full');
});

test('oyun mutluluğu 15 artırır, enerji harcatır; yorgunken ve çok mutluyken reddedilir', () => {
  const s = K.uygula(kedi({ happiness: 40, energy: 50 }), 'play', R, T0);
  yakin(s.pet.happiness, 55);
  yakin(s.pet.energy, 40);
  assert.equal(K.uygula(kedi({ energy: 10 }), 'play', R, T0).reason, 'too_tired');
  assert.equal(K.uygula(kedi({ happiness: 96 }), 'play', R, T0).reason, 'already_happy');
});

test('temizleme temizliği 25 artırır; temizken reddedilir', () => {
  yakin(K.uygula(kedi({ cleanliness: 40 }), 'clean', R, T0).pet.cleanliness, 65);
  assert.equal(K.uygula(kedi({ cleanliness: 97 }), 'clean', R, T0).reason, 'already_clean');
});

test('dinlenme süre boyunca enerji kazandırır ve kendiliğinden biter', () => {
  const k = Object.assign({}, R, { energy_rest_per_hour: 10, energy_drop_per_hour: 2, rest_max_hours: 3 });
  const s = K.uygula(kedi({ energy: 40 }), 'rest', k, T0);
  assert.equal(s.result, 'applied');
  // 60 puan / saatte 10 = 6 saat gerekir; en çok 3 saat sürer
  assert.equal(Date.parse(s.pet.resting_until), T0 + 3 * SAAT);
  const iki = K.hesapla(s.pet, k, T0 + 2 * SAAT);
  assert.equal(iki.resting, true);
  yakin(iki.energy, 60);
  // 3 saat dinlenme (+30), sonra 1 saat uyanık (−2)
  const dort = K.hesapla(s.pet, k, T0 + 4 * SAAT);
  assert.equal(dort.resting, false);
  yakin(dort.energy, 68);
});

test('enerji dolunca dinlenme erken biter', () => {
  const s = K.uygula(kedi({ energy: 85 }), 'rest', R, T0);
  const sure = (100 - 85) / R.energy_rest_per_hour;
  assert.equal(Date.parse(s.pet.resting_until), T0 + sure * SAAT);
  yakin(K.hesapla(s.pet, R, T0 + sure * SAAT).energy, 100);
});

test('uyuyan kedi uyandırılabilir; kazandığı enerji kalır, uyanıkken uyandırma reddedilir', () => {
  const s = K.uygula(kedi({ energy: 30 }), 'rest', R, T0);
  const u = K.uygula(s.pet, 'wake', R, T0 + SAAT);
  assert.equal(u.result, 'applied');
  assert.equal(u.pet.resting_until, null);
  const c = K.hesapla(u.pet, R, T0 + SAAT);
  assert.equal(c.resting, false);
  yakin(c.energy, 30 + R.energy_rest_per_hour);
  // Uyandıktan sonra oyun oynanabilir
  assert.equal(K.uygula(u.pet, 'play', R, T0 + SAAT).result, 'applied');
  assert.equal(K.uygula(u.pet, 'wake', R, T0 + SAAT).reason, 'not_sleeping');
  assert.equal(K.uygula(kedi(), 'wake', R, T0).reason, 'not_sleeping');
});

test('dinlenirken başka bakım dinlenmeyi bozmaz, uyurken oyun reddedilir', () => {
  const s = K.uygula(kedi({ energy: 40, hunger: 60 }), 'rest', R, T0);
  const b = K.uygula(s.pet, 'feed', R, T0 + SAAT);
  assert.equal(b.result, 'applied');
  assert.equal(b.pet.resting_until, s.pet.resting_until);
  const uyku = Date.parse(s.pet.resting_until) - T0;
  yakin(K.hesapla(b.pet, R, T0 + uyku).energy, Math.min(100, 40 + (uyku / SAAT) * R.energy_rest_per_hour));
  assert.equal(K.uygula(b.pet, 'play', R, T0 + 2 * SAAT).reason, 'sleeping');
  assert.equal(K.uygula(b.pet, 'rest', R, T0 + 2 * SAAT).reason, 'already_resting');
  assert.equal(K.uygula(kedi({ energy: 95 }), 'rest', R, T0).reason, 'not_tired');
});

test('reddedilen eylem durumu değiştirmez', () => {
  const p = kedi({ hunger: 5 });
  assert.equal(K.uygula(p, 'feed', R, T0).pet, p);
});

test('bilinmeyen eylem hata verir', () => {
  assert.throws(() => K.uygula(kedi(), 'dance', R, T0), /invalid_action/);
});

test('ihmal edilen kedi kaybolmaz; yalnızca ihtiyaçları en uçta kalır', () => {
  const c = K.hesapla(kedi(), R, T0 + 24 * 365 * SAAT);
  assert.deepEqual(K.ihtiyaclar(c).map((i) => i.seviye), ['dusuk', 'dusuk', 'dusuk', 'dusuk']);
  assert.equal(K.ruhHali(c, T0).kod, 'yorgun');
  const s = K.uygula(kedi({ hunger: 100, happiness: 0, energy: 0, cleanliness: 0 }), 'feed', R, T0);
  assert.equal(s.result, 'applied');
});

test('göstergeler metin ve seviye taşır; açlıkta yüksek değer kötüdür', () => {
  const g = K.ihtiyaclar({ hunger: 90, happiness: 90, energy: 50, cleanliness: 10 });
  assert.deepEqual(g.map((i) => [i.ad, i.seviye, i.metin]), [
    ['Açlık', 'dusuk', 'Çok aç'], ['Mutluluk', 'iyi', 'Neşeli'], ['Enerji', 'orta', 'Normal'], ['Temizlik', 'dusuk', 'Çok kirli']
  ]);
});

test('davranış işaretleri ihtiyaçlara göre', () => {
  const i = K.isaretler({ hunger: 80, happiness: 20, energy: 10, cleanliness: 20, resting: false });
  assert.deepEqual(i, { uyuyor: false, ac: true, uzgun: true, yorgun: true, kirli: true, mutlu: false });
});

test('kedi uzun süredir uğramayanları özler', () => {
  const gun = 864e5;
  const ekip = [
    { id: 1, name: 'Yeni gelen', created_at: new Date(T0 - 1 * gun).toISOString(), last_action_at: null },
    { id: 2, name: 'Dün baktı', created_at: new Date(T0 - 30 * gun).toISOString(), last_action_at: new Date(T0 - 1 * gun).toISOString() },
    { id: 3, name: 'Beş gün', created_at: new Date(T0 - 30 * gun).toISOString(), last_action_at: new Date(T0 - 5 * gun).toISOString() },
    { id: 4, name: 'Hiç bakmadı', created_at: new Date(T0 - 10 * gun).toISOString(), last_action_at: null },
    { id: 5, name: 'Tam üç gün', created_at: new Date(T0 - 30 * gun).toISOString(), last_action_at: new Date(T0 - 3 * gun).toISOString() }
  ];
  const o = K.ozlenenler(ekip, T0, 3);
  assert.deepEqual(o.map((m) => m.name), ['Hiç bakmadı', 'Beş gün', 'Tam üç gün']);
  assert.equal(o[0].hic, true);
  assert.equal(o[1].gun, 5);
  assert.deepEqual(K.ozlenenler([], T0, 3), []);
  assert.deepEqual(K.ozlenenler(undefined, T0, 3), []);
});

// ---- Etkileşim ----
const GUN = 864e5;
// Türkiye saatiyle bir an: '2026-11-05 10:30'
const tr = (metin) => Date.parse(metin.replace(' ', 'T') + ':00+03:00');

test('ISO hafta ve haftanın gözde oyuncağı', () => {
  assert.equal(K.isoHafta(tr('2026-11-05 10:00')), 45);
  assert.equal(K.isoHafta(tr('2027-01-01 10:00')), 53); // 2026'nın 53. haftası
  assert.equal(K.isoHafta(tr('2027-01-04 00:30')), 1);  // pazartesi, Türkiye saatiyle
  assert.equal(K.favoriOyuncak(tr('2026-11-05 10:00')), K.OYUNCAKLAR[45 % 3]);
  // Hafta içinde değişmez, sonraki hafta değişir
  assert.equal(K.favoriOyuncak(tr('2026-11-02 00:10')), K.favoriOyuncak(tr('2026-11-08 23:50')));
  assert.notEqual(K.favoriOyuncak(tr('2026-11-08 23:50')), K.favoriOyuncak(tr('2026-11-09 00:10')));
});

test('oyuncaklar: gözde oyuncak ek mutluluk verir, lazer puanı sınırlı, bilinmeyen oyuncak hata', () => {
  const t = tr('2026-11-05 10:00');
  const fav = K.favoriOyuncak(t);
  const baska = K.OYUNCAKLAR.find((o) => o !== fav && o !== 'lazer');
  const p = kedi({ happiness: 40, energy: 80, updated_at: new Date(t).toISOString() });
  const a = K.uygula(p, 'play', R, t, { toy: fav });
  assert.equal(a.favorite, true);
  const b = K.uygula(p, 'play', R, t, { toy: baska });
  assert.equal(b.favorite, false);
  const happyAt = (x) => K.hesapla(x.pet, R, t).happiness;
  yakin(happyAt(b), 40 + R.play_amount);
  yakin(happyAt(a) - happyAt(b), R.favorite_toy_bonus);
  const l = K.uygula(p, 'play', R, t, { toy: 'lazer', bonus: 999 });
  assert.equal(l.bonus, R.max_game_bonus);
  const l0 = K.uygula(p, 'play', R, t, { toy: 'top', bonus: 7 });
  assert.equal(l0.bonus, 0);
  assert.equal(K.uygula(p, 'play', R, t).toy, 'top');
  assert.throws(() => K.uygula(p, 'play', R, t, { toy: 'kemik' }), /invalid_action/);
});

test('ödül maması günde bir kez', () => {
  const p = kedi({ hunger: 50, happiness: 50 });
  const s1 = K.uygula(p, 'treat', R, T0);
  assert.equal(s1.result, 'applied');
  yakin(s1.pet.hunger, 50 - R.treat_hunger);
  yakin(s1.pet.happiness, 50 + R.treat_happiness);
  assert.equal(K.uygula(p, 'treat', R, T0, { odulVerildi: true }).reason, 'treat_used');
});

const akt = (ad, id, eylem, zamanMetni, ek) => Object.assign({ member_id: id, actor_name: ad, action: eylem, toy: null, bonus: 0, created_at: new Date(tr(zamanMetni)).toISOString() }, ek);

test('haftalık özet bu haftayı sayar (pazartesi 00:00, Türkiye saati)', () => {
  const simdi = tr('2026-11-05 15:00'); // perşembe
  const a = [
    akt('Ayşe', 1, 'feed', '2026-11-01 23:59'), // geçen hafta (pazar)
    akt('Ayşe', 1, 'feed', '2026-11-02 00:01'),
    akt('Ayşe', 1, 'play', '2026-11-03 10:00', { toy: 'ip' }),
    akt('Mehmet', 2, 'play', '2026-11-04 10:00', { toy: 'ip' }),
    akt('Mehmet', 2, 'play', '2026-11-04 11:00', { toy: 'top' })
  ];
  const o = K.haftalikOzet(a, simdi);
  assert.equal(o.toplam, 4);
  assert.deepEqual(o.kisiler.map((k) => [k.ad, k.n]), [['Ayşe', 2], ['Mehmet', 2]]);
  assert.equal(o.oyuncak, 'ip');
  assert.equal(K.haftaBasi(simdi), tr('2026-11-02 00:00'));
});

test('günlük paragrafı günün bakımlarını anlatır', () => {
  const a = [
    akt('Ayşe', 1, 'feed', '2026-11-05 09:00'),
    akt('Ayşe', 1, 'feed', '2026-11-05 11:00'),
    akt('Mehmet', 2, 'feed', '2026-11-05 13:00'),
    akt('Mehmet', 2, 'play', '2026-11-05 13:05', { toy: 'lazer' }),
    akt('Zeynep', 3, 'feed', '2026-11-04 13:00') // başka gün
  ];
  const o = K.gunOzeti(a, '2026-11-05');
  assert.equal(o.toplam, 4);
  const m = K.gunlukMetni(o, true);
  assert.match(m, /^Bugün 3 kez mama yedim \(en çok Ayşe\) ve 1 kez oynadım, en çok lazerle \(Mehmet\)\. 2 kişi uğradı;/);
  assert.match(K.gunlukMetni(K.gunOzeti([], '2026-11-05'), true), /kimse uğramadı/);
});

test('rozetler: sabah, seri (hafta sonu bozmaz), sayılar', () => {
  const a = [];
  // Ayşe: perşembe, cuma, (hafta sonu yok), pazartesi, salı, çarşamba → 5 iş günü seri; üçü sabah erken
  ['2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04'].forEach((g, i) =>
    a.push(akt('Ayşe', 1, 'feed', g + (i < 3 ? ' 08:30' : ' 12:00'))));
  // Mehmet: 4 gün, araya boş bir iş günü → seri yok; 8 yakalamalı lazer oyunu
  ['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30'].forEach((g) => a.push(akt('Mehmet', 2, 'play', g + ' 19:00')));
  a.push(akt('Mehmet', 2, 'play', '2026-10-30 19:30', { toy: 'lazer', bonus: 8 }));
  const r = K.rozetler(a);
  assert.deepEqual(r.m1.map((x) => x.kod), ['sabah', 'seri']);
  assert.deepEqual(r.m2.map((x) => x.kod), ['gece', 'lazer']);
});

test('bağlılık: son 14 günde açık ara en çok bakan', () => {
  const simdi = tr('2026-11-05 12:00');
  const a = [];
  for (let i = 0; i < 6; i++) a.push(akt('Ayşe', 1, 'feed', '2026-11-0' + (i % 4 + 1) + ' 10:00'));
  for (let i = 0; i < 3; i++) a.push(akt('Mehmet', 2, 'feed', '2026-11-03 1' + i + ':00'));
  for (let i = 0; i < 9; i++) a.push(akt('Zeynep', 3, 'feed', '2026-10-0' + (i + 1) + ' 10:00')); // 14 günden eski
  assert.equal(K.baglilik(a, simdi).ad, 'Ayşe');
  assert.equal(K.baglilik(a.slice(6), simdi), null); // Mehmet'in 3 bakımı yetmez
});

test('gün dilimi ve süsler', () => {
  assert.equal(K.gunDilimi(tr('2026-11-05 23:00')), 'gece');
  assert.equal(K.gunDilimi(tr('2026-11-05 06:59')), 'gece');
  assert.equal(K.gunDilimi(tr('2026-11-05 08:00')), 'sabah');
  assert.equal(K.gunDilimi(tr('2026-11-05 13:00')), 'gunduz');
  assert.equal(K.gunDilimi(tr('2026-11-05 19:00')), 'aksam');
  const tatiller = [
    { ad: 'Cumhuriyet Bayramı tatili', bas: '2026-10-28', bit: '2026-10-29' },
    { ad: 'Ramazan Bayramı tatili', bas: '2027-03-08', bit: '2027-03-12' },
    { ad: 'Yılbaşı tatili', bas: '2027-01-01' }
  ];
  assert.equal(K.susleme(tr('2026-10-29 12:00'), tatiller).kod, 'bayrak');
  assert.equal(K.susleme(tr('2027-03-10 12:00'), tatiller).kod, 'bayram');
  assert.equal(K.susleme(tr('2027-01-01 12:00'), tatiller).kod, 'yilbasi');
  assert.equal(K.susleme(tr('2026-12-24 12:00'), tatiller).kod, 'yilbasi');
  assert.equal(K.susleme(tr('2026-11-05 12:00'), tatiller).kod, 'sonbahar');
  assert.equal(K.susleme(tr('2027-04-15 12:00'), tatiller).kod, 'bahar');
});

test('oda eşyaları tamamlanan hafta sayısıyla açılır', () => {
  assert.deepEqual(K.esyalar(0), []);
  assert.deepEqual(K.esyalar(2).map((e) => e.kod), ['agac', 'bitki']);
  assert.equal(K.esyalar(99).length, K.ODA_ESYALARI.length);
});

test('sözler ihtiyaca ve kişiye göre; uyurken susar', () => {
  const ac = { hunger: 80, happiness: 70, energy: 70, cleanliness: 80, resting: false };
  assert.ok(K.sozler(ac, 'Ayşe').includes('Ayşe, mama?'));
  assert.ok(K.sozler(ac, null).includes('Mama?'));
  assert.ok(!K.sozler(ac, null).some((x) => /null/.test(x)));
  assert.deepEqual(K.sozler(Object.assign({}, ac, { resting: true }), 'Ayşe'), []);
  const iyi = { hunger: 20, happiness: 80, energy: 80, cleanliness: 90, resting: false };
  assert.ok(K.sozler(iyi, 'Ayşe', 'Zeynep').includes('Zeynep nerede?'));
});

