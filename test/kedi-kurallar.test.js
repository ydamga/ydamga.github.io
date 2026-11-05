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
