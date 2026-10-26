// ÖSYM bildirim Worker'ı
// - POST /abone: sitedeki "Bildirimleri aç" düğmesinden gelen aboneliği KV'ye kaydeder, hoş geldin bildirimi yollar
// - POST /iptal: aboneliği siler
// - Her sabah (cron): sitedeki data/osym.json'dan o güne düşen hatırlatmaları bulur, bütün abonelere gönderir
//
// Hatırlatma günleri index.html ile aynı: başvurudan 7 gün önce, başvuru günü, bitişten 3 gün önce.
//
// Cloudflare panelinde tek dosya olarak yapıştırılır; bağımlılığı yoktur.

// ---- Web Push (RFC 8291 şifreleme, RFC 8292 VAPID) ----

const enc = new TextEncoder();

function b64uCoz(s) {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
}

function b64u(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function birlestir(...parcalar) {
  const out = new Uint8Array(parcalar.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parcalar) { out.set(p, i); i += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, uzunluk) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, uzunluk * 8));
}

// Yükü abonenin anahtarlarıyla şifreler; isteğin gövdesini döndürür.
async function sifrele(abonelik, metin) {
  const uaPublic = b64uCoz(abonelik.keys.p256dh);
  const authSecret = b64uCoz(abonelik.keys.auth);
  const yerel = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', yerel.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, yerel.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdh, birlestir(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const duz = birlestir(enc.encode(metin), new Uint8Array([2])); // 0x02: son kayıt
  const sifreli = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, duz));

  const rs = new Uint8Array([0, 0, 16, 0]); // kayıt boyutu 4096
  return birlestir(salt, rs, new Uint8Array([asPublic.length]), asPublic, sifreli);
}

// VAPID özel anahtarı (32 bayt, base64url) ve açık anahtarıyla (65 bayt) imzalı JWT üretir.
async function vapidJwt(ozel, acik, aud, sub) {
  const pub = b64uCoz(acik);
  const jwk = { kty: 'EC', crv: 'P-256', d: ozel, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const govde = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) + '.' +
    b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })));
  const imza = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(govde));
  return govde + '.' + b64u(imza);
}

// Tek bir aboneliğe bildirim gönderir; push servisinin yanıtını döndürür.
async function gonder(abonelik, yuk, { ozel, acik, sub, ttl = 86400 }) {
  const aud = new URL(abonelik.endpoint).origin;
  const jwt = await vapidJwt(ozel, acik, aud, sub);
  return fetch(abonelik.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal',
      Authorization: `vapid t=${jwt}, k=${acik}`,
    },
    body: await sifrele(abonelik, JSON.stringify(yuk)),
  });
}

// ---- Hatırlatma günleri ----

const ONCE_GUN = 7;
const BITIS_GUN = 3;

function turkiyeGunu(t = Date.now()) {
  return new Date(t + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function kaydir(gun, n) {
  const d = new Date(gun + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function kisa(gun) {
  return gun.split('-').reverse().join('.');
}

function hatirlatmalar(sinavlar, bugun) {
  const out = [];
  for (const s of sinavlar) {
    if (!s.basvuru_baslangic) continue;
    // ISO değerler +03:00 ile yazılır; ilk 10 karakter Türkiye takvim günüdür
    const bas = s.basvuru_baslangic.slice(0, 10);
    const bit = s.basvuru_bitis.slice(0, 10);
    const son = kisa(bit) + ' ' + s.basvuru_bitis.slice(11, 16);
    if (kaydir(bas, -ONCE_GUN) === bugun) out.push({ s, metin: `Başvuru 1 hafta sonra başlıyor: ${kisa(bas)}` });
    else if (bas === bugun) out.push({ s, metin: `Başvuru bugün başladı. Son gün: ${son}` });
    else if (kaydir(bit, -BITIS_GUN) === bugun) out.push({ s, metin: `Başvurunun bitmesine ${BITIS_GUN} gün kaldı. Son gün: ${son}` });
  }
  return out;
}

// ---- Worker ----

const IZINLI_KOKENLER = ['https://ydamga.github.io', 'http://localhost:8765'];

function cors(istek) {
  const koken = istek.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': IZINLI_KOKENLER.includes(koken) ? koken : IZINLI_KOKENLER[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function yanit(istek, govde, durum = 200) {
  return new Response(JSON.stringify(govde), { status: durum, headers: { 'Content-Type': 'application/json', ...cors(istek) } });
}

async function anahtar(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return 'abone:' + [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function gecerliMi(a) {
  return a && typeof a.endpoint === 'string' && a.endpoint.startsWith('https://') && a.endpoint.length < 1000 &&
    a.keys && typeof a.keys.p256dh === 'string' && typeof a.keys.auth === 'string';
}

function vapid(env) {
  return { ozel: env.VAPID_PRIVATE_KEY, acik: env.VAPID_PUBLIC_KEY, sub: env.SITE };
}

// Gönderir; abonelik iptal edilmişse (404/410) KV'den siler. Başarılıysa true döner.
async function teslimEt(env, abonelik, yuk) {
  try {
    const r = await gonder(abonelik, yuk, vapid(env));
    if (r.status === 404 || r.status === 410) {
      await env.SUBS.delete(await anahtar(abonelik.endpoint));
      return false;
    }
    if (!r.ok) console.log('push hatası', r.status, await r.text());
    return r.ok;
  } catch (h) {
    console.log('push istisnası', h.message);
    return false;
  }
}

async function gunlukGonderim(env) {
  const bugun = turkiyeGunu();
  const isaret = 'gonderildi:' + bugun;
  if (await env.SUBS.get(isaret)) return;

  const r = await fetch(env.SITE + '/data/osym.json', { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error('osym.json okunamadı: ' + r.status);
  const liste = hatirlatmalar((await r.json()).sinavlar, bugun);
  if (!liste.length) return;

  // Aynı gün birden çok hatırlatma varsa tek bildirimde toplanır (abone başına tek istek)
  const yuk = liste.length === 1
    ? { baslik: liste[0].s.ad, govde: liste[0].metin, url: liste[0].s.link, etiket: 'osym-' + bugun }
    : { baslik: `ÖSYM: ${liste.length} hatırlatma`, govde: liste.map((h) => `${h.s.ad}: ${h.metin}`).join('\n'), url: env.SITE + '/', etiket: 'osym-' + bugun };

  let imlec, basarili = 0;
  do {
    const sayfa = await env.SUBS.list({ prefix: 'abone:', cursor: imlec });
    const sonuclar = await Promise.all(sayfa.keys.filter((k) => k.metadata).map((k) => teslimEt(env, k.metadata, yuk)));
    basarili += sonuclar.filter(Boolean).length;
    imlec = sayfa.list_complete ? null : sayfa.cursor;
  } while (imlec);

  await env.SUBS.put(isaret, String(basarili), { expirationTtl: 8 * 86400 });
  console.log(`${bugun}: ${liste.length} hatırlatma, ${basarili} aboneye gönderildi`);
}

export default {
  async fetch(istek, env) {
    const yol = new URL(istek.url).pathname;
    if (istek.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(istek) });
    if (istek.method !== 'POST') return new Response('ÖSYM bildirim servisi', { headers: cors(istek) });

    let govde;
    try { govde = await istek.json(); } catch { return yanit(istek, { hata: 'JSON bekleniyor' }, 400); }

    if (yol === '/abone') {
      if (!gecerliMi(govde)) return yanit(istek, { hata: 'Geçersiz abonelik' }, 400);
      const abonelik = { endpoint: govde.endpoint, keys: { p256dh: govde.keys.p256dh, auth: govde.keys.auth } };
      const ok = await teslimEt(env, abonelik, {
        baslik: 'ÖSYM bildirimleri açık',
        govde: 'Başvuru tarihlerinden 1 hafta önce, başvuru günü ve bitişten 3 gün önce haber vereceğiz.',
        url: env.SITE + '/',
        etiket: 'osym-hosgeldin',
      });
      if (!ok) return yanit(istek, { hata: 'Bu tarayıcıya bildirim gönderilemedi' }, 502);
      await env.SUBS.put(await anahtar(abonelik.endpoint), '', { metadata: abonelik });
      return yanit(istek, { tamam: true });
    }
    if (yol === '/iptal') {
      if (typeof govde.endpoint !== 'string') return yanit(istek, { hata: 'endpoint gerekli' }, 400);
      await env.SUBS.delete(await anahtar(govde.endpoint));
      return yanit(istek, { tamam: true });
    }
    return yanit(istek, { hata: 'Bulunamadı' }, 404);
  },

  async scheduled(olay, env, ctx) {
    ctx.waitUntil(gunlukGonderim(env));
  },
};
