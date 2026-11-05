// Supabase bağlantısı. İkisi de boşsa kedi "yerel deneme" modunda çalışır (durum yalnızca bu tarayıcıda).
// Doldurmak için kedi/baglanti.ornek.js'e ve README.md'deki "Ortak canlı mod" adımlarına bakın.
//
// Buraya YALNIZCA herkese açık (anon / publishable) anahtar yazılır. Bu anahtar tarayıcıya gider ve
// herkes görebilir; verileri koruyan Row Level Security politikalarıdır (supabase/schema.sql).
// service_role / secret anahtarı asla bu dosyaya, depoya ya da sayfaya koymayın.
window.KEDI_BAGLANTI = {
  url: 'https://mzqvmppxntsrkrehrtjy.supabase.co',
  anahtar: 'sb_publishable_cdCV1S4hU-BhDxPogF5tMw_4kuX5OFg'
};
