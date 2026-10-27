// Örnek: kedi/baglanti.js canlı mod için böyle doldurulur. Bu dosya sayfalarda yüklenmez.
//
// url:     Supabase panelinde Project Settings → Data API → Project URL
// anahtar: Project Settings → API Keys → "anon public" (eski anahtarlar) ya da "publishable" anahtar
//
// Yanlış anahtarı ayırt etmek için: service_role anahtarının JWT gövdesinde "role":"service_role",
// yeni secret anahtarlarda "sb_secret_" öneki bulunur. Bunlar RLS'yi atlar; tarayıcıya ve depoya girmemelidir.
window.KEDI_BAGLANTI = {
  url: 'https://abcdefghijklmnop.supabase.co',
  anahtar: 'sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx'
};
