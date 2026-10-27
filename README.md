# ÖDHM araçları

GitHub Pages'te yayınlanan statik site (HTML, CSS, vanilla JavaScript; derleme adımı yok).

| Sayfa | İçerik |
| --- | --- |
| `index.html` | Üniversite sistemleri, araçlar, günün menüsü, ÖSYM takvimi, alt bilgide ekip kedisi |
| `kedi-odasi.html` | Ekip kedisinin odası: göstergeler, bakım, geçmiş, giriş |
| `ders-programi.html`, `ziyaret.html`, `yemek.html`, `sinavlar.html` | Mevcut araçlar |

Ortak görünüm `ortak.css`, tema ve ayarlar paneli `ayarlar.js`, ÖSYM bildirimleri `worker/` ve `.github/workflows/osym.yml`.

---

## Ekip kedisi

Anasayfanın alt bilgisinde, yalnızca kendisine ayrılmış bir şeritte dolaşan ortak bir kedi (Fındık). Kediye ya da
**Araçlar → Kedi Odası**'na basınca odası açılır; orada beslenir, oynatılır, dinlendirilir ve temizlenir.

### Dosyalar

| Dosya | Görevi |
| --- | --- |
| `kedi/ayar.js` | Oyun ayarları (oranlar, eşikler, sıklık sınırı) ve kedinin adı. Tek yapılandırma yeri |
| `kedi/baglanti.js` | Supabase adresi ve herkese açık anahtar. Boşsa yerel deneme modu |
| `kedi/baglanti.ornek.js` | Doldurulmuş örnek (sayfalarda yüklenmez) |
| `kedi/kurallar.js` | Geçen süreye göre ihtiyaç hesabı, eylemler, ruh hâli. DOM'suz; Node'da test edilir |
| `kedi/durum.js` | Durumun kaynağı: yerel deneme (localStorage) ya da Supabase (RPC + Realtime) |
| `kedi/karakter.js` | SVG kedi ve davranış seçimi (yürüme, bakınma, esneme, yalanma, uyuma) |
| `kedi/kedi.css` | Pozlar ve animasyonlar |
| `kedi/ana.js`, `kedi/oda.js` | Anasayfa şeridi ve Kedi Odası arayüzü |
| `supabase/schema.sql` | Tablolar, kısıtlar, indeksler, fonksiyonlar, RLS, Realtime |
| `supabase/test-rls.sql` | Yetki/RLS sınaması (geri alınan tek işlem) |
| `test/kedi-kurallar.test.js` | Oyun kuralları birim testleri |

Bütün yollar görelidir (`kedi/...`, `kedi-odasi.html`); site bir depo alt dizininde (`kullanici.github.io/depo/`) yayınlansa da çalışır.

### Nasıl çalışır

- **Zaman gerçek süreye göre işler.** Kedinin kaydı bir anlık görüntüdür (değerler + `updated_at` + `resting_until`).
  Şimdiki değerler her okumada geçen süreden hesaplanır; sayfa kapalıyken de ihtiyaçlar ilerler. Sunucuya
  periyodik istek gitmez; sayfa yalnızca açılışta, sekmeye dönüldüğünde ve bağlantı geri geldiğinde durumu okur,
  değişiklikleri Realtime ile alır.
- **Dinlenme süreli bir durumdur.** "Dinlendir" kediyi en çok `rest_max_hours` saat uyutur; bu sürede enerji
  saatte `energy_rest_per_hour` artar, enerji 100 olunca kedi erken uyanır. Uyurken oyun reddedilir; besleme ve
  temizleme uykuyu bozmaz.
- **İhtiyaç zaten karşılanmışsa** eylem reddedilir ve kedi buna uygun tepki verir (tokken yemez, temizken
  temizlenmez, uykusu yokken uyumaz, yorgunken oynamaz). Reddedilen deneme de geçmişe yazılır.
- **Ceza yok.** Değerler 0–100 arasında kalır; ihmal edilen kedi yalnızca aç, üzgün, yorgun ve tozlu görünür,
  ilk bakımda toparlanır.
- **Görünür davranış:** acıkınca mama balonu, mutsuzken düşük kulak ve üzgün yüz, daha az ve yavaş yürüme,
  yorgunken esneme ve uyuklama, kirliyken lekeler ve kendini yalama, bakım sonrası kalpler. Göstergeler renk,
  simge, metin ve (düşükse) ünlem + çizgili çubukla okunur.
- **Performans:** yalnızca `transform`/`opacity` animasyonları; yürüme tek bir CSS geçişi, sürekli JavaScript
  döngüsü yok, sekme gizliyken davranış seçimi durur. Değerler 30–60 saniyede bir yeniden hesaplanır.
- **Hareketi azalt** (`prefers-reduced-motion`) açıksa kedi yerinde durur, animasyonlar kapanır; pozu ve
  balonu yine durumunu gösterir.

### İki çalışma modu

| | Yerel deneme | Ortak canlı |
| --- | --- | --- |
| Ne zaman | `kedi/baglanti.js` boş | `kedi/baglanti.js` dolu |
| Durum | Bu tarayıcının localStorage'ı | Supabase PostgreSQL |
| Kim bakım yapar | Bu tarayıcıyı kullanan | Giriş yapmış ve yöneticinin onayladığı ekip üyeleri |
| Eşitleme | Yok (yalnızca aynı tarayıcının sekmeleri) | Realtime ile bütün açık sayfalar |
| Arayüzde | "Yerel deneme" rozeti ve uyarı notu | "Ortak · canlı" rozeti |

Canlı modda bağlantı kurulamazsa sayfa yerel moda **düşmez**: hata gösterir, bakım düğmelerini kapatır, hiçbir
şeyi yerelde kaydetmez.

---

## Ortak canlı mod kurulumu

Aşağıdaki adımları sizin yapmanız gerekir; bu depoda gerçek bir Supabase projesi yok.

### 1. Supabase projesi

1. <https://supabase.com> → **New project**. Bölge olarak yakın bir yer seçin (ör. *Central EU (Frankfurt)*).
2. Veri tabanı parolasını bir parola yöneticisine kaydedin; siteye ya da depoya girmez.

### 2. Şema ve sınama

1. **SQL Editor → New query**: `supabase/schema.sql` dosyasının tamamını yapıştırıp **Run**.
2. Yeni bir sorguda `supabase/test-rls.sql`'i çalıştırın. Çıktıda (Messages/Notices) yalnızca `OK ...` satırları ve
   sonda `Bütün denetimler geçti` görünmeli. `HATA: ...` görürseniz canlıya geçmeyin.
   Betik tek işlemde çalışır ve sonunda geri alınır; test kullanıcıları kalmaz.

### 3. Giriş ayarları

1. **Authentication → Sign In / Providers**: *Email* açık kalsın; **Allow new users to sign up** kapatın.
   Böylece hesabı yalnızca yönetici açar (site de `shouldCreateUser: false` ile istek gönderir).
2. **Authentication → URL Configuration**
   - *Site URL*: `https://ydamga.github.io/`
   - *Redirect URLs*: `https://ydamga.github.io/kedi-odasi.html`
     (yerel deneme için isterseniz `http://localhost:8000/kedi-odasi.html` gibi bir adres de ekleyin)
3. Supabase'in yerleşik e-posta servisi saatte birkaç iletiyle sınırlıdır. Ekip düzenli kullanacaksa
   **Authentication → Emails → SMTP Settings**'ten kurumsal bir SMTP tanımlayın.

### 4. Ekip üyeliği ve davet

Sayfanın herkese açık adresini bilmek ekip üyesi olmak demek değildir. Üyelik iki adımda verilir:

1. **Authentication → Users → Invite user**: kişinin e-postasını davet edin. Bu, bir `profiles` satırı oluşturur
   (`is_member = false`).
2. **SQL Editor**'de üyeliği ve görünen adı siz verin:

   ```sql
   update public.profiles set is_member = true, display_name = 'Ayşe Y.'
   where id = (select id from auth.users where email = 'ayse@arel.edu.tr');
   ```

Üye, Kedi Odası'nda e-postasını yazıp gelen bağlantıyı açarak giriş yapar. Görünen adı ve üyeliği kullanıcı
kendisi değiştiremez; geçmişteki ad sunucu tarafından profilden yazılır. Üyeliği kaldırmak için
`is_member = false` yapın.

### 5. Siteyi bağlama

1. **Project Settings → API Keys**: *anon public* (ya da *publishable*) anahtarını ve proje adresini alın.
2. `kedi/baglanti.js`'i doldurun (biçim için `kedi/baglanti.ornek.js`):

   ```js
   window.KEDI_BAGLANTI = { url: 'https://<proje>.supabase.co', anahtar: '<anon/publishable anahtar>' };
   ```

3. Commit edip `main`'e gönderin; GitHub Pages birkaç dakika içinde yayınlar (tarayıcılar dosyaları ~10 dakika
   önbellekte tutabilir).

> **service_role / secret anahtarı** (`"role":"service_role"` içeren JWT ya da `sb_secret_` ile başlayan anahtar)
> RLS'yi atlar. Bu anahtar `kedi/baglanti.js`'e, depoya, `.env` dosyalarına ya da herhangi bir sayfaya girmemelidir.
> Herkese açık anahtarın görünmesi sorun değildir; verileri RLS ve fonksiyon yetkileri korur.

### 6. Oyun ayarlarını değiştirme

Canlı modda kurallar `public.game_rules` tablosundan gelir ve sunucuda uygulanır; yerel deneme `kedi/ayar.js`'i
kullanır. İkisini aynı tutun:

```sql
update public.game_rules set hunger_rise_per_hour = 3, updated_at = now() where id = 1;
```

Yeni oran son bakımdan bu yana geçen sürenin tamamına uygulanır; eski oranla geçen süreyi korumak için
değiştirmeden hemen önce bir bakım yapın. Hesabın kendisi `kedi/kurallar.js` ve `private.pet_current()` /
`public.perform_pet_action()` içinde aynıdır; birini değiştirirseniz ötekini de değiştirin ve testleri çalıştırın.

---

## Güvenlik modeli

- **Tek kedi:** `pets.id` birincil anahtar ve `check (id = 1)`; satır şemayla oluşur, istemci ekleyemez/silemez.
- **İstemci hiçbir tabloya yazamaz.** `anon` ve `authenticated` rollerinin tablo yetkileri geri alınmış, yalnızca
  okuma verilmiştir. Bakım tek yoldan yapılır: `perform_pet_action(p_action)`. Tarayıcı yalnızca eylemin adını
  gönderir; değerleri, zamanı ve kimliği sunucu belirler (`auth.uid()`, `clock_timestamp()`).
- **Atomik ve eşzamanlı güvenli:** fonksiyon kedi satırını `SELECT ... FOR UPDATE` ile kilitler, durumu kilit
  alındıktan sonraki sunucu saatine göre hesaplar, günceller ve geçmişi aynı işlemde yazar. Aynı anda gelen iki
  bakım sıraya girer; ikincisi birincinin sonucunu görür, veri ezilmez.
- **Sahte kimlik yok:** `actor_id` ve `actor_name` istemciden alınmaz; `profiles`'ı yalnızca yönetici değiştirir.
- **Okuma yetkileri (RLS):** kedinin durumu ve kurallar herkese açık (anasayfadaki kedi için). Bakım geçmişini
  ve adları yalnızca ekip üyeleri görür; üye olmayan giriş yapmış kullanıcı yalnızca kendi profilini görür.
  Anonim okumayı kapatmak için `schema.sql`'deki ilgili iki politikadan `anon`'u çıkarın.
- **Sıklık sınırı:** kişi başına `cooldown_seconds` (3 sn) bekleme ve saatte `max_actions_per_hour` (60) bakım;
  denetim satır kilidinin arkasında olduğundan paralel isteklerle aşılamaz. Giriş e-postalarını Supabase Auth
  kendi sınırıyla korur.
- **Gizli anahtar yok:** istemcide yalnızca herkese açık anahtar bulunur; `.gitignore` `.env` dosyalarını dışarıda tutar.

---

## Testler

```bash
node --test test/kedi-kurallar.test.js
```

Oyun kurallarını sınar: geçen süre, 0–100 sınırları, dört eylem, reddetme koşulları, süreli dinlenme ve erken
uyanma, ihmalde ceza olmaması, göstergeler.

RLS ve fonksiyonlar için `supabase/test-rls.sql` (yukarıda 2. adım).

### Canlıya geçince elle sınayın

1. İki farklı tarayıcıda (ör. Chrome ve Firefox) Kedi Odası'nı açın; iki ekranda aynı değerler görünmeli.
2. Birinde giriş yapıp **Besle**'ye basın; ötekinde gösterge ve geçmiş sayfa yenilenmeden değişmeli.
3. İki üye hesabıyla iki tarayıcıda aynı anda farklı düğmelere basın; `pet_actions`'ta iki satır olmalı ve
   kedinin değerleri iki eylemin toplam etkisini göstermeli.
4. Giriş yapmadan düğmeler kapalı olmalı; tarayıcı konsolundan
   `supabase.createClient(url, anahtar).from('pets').update({ hunger: 0 }).eq('id', 1)` hata vermeli.
5. Ağı kapatın (DevTools → Network → Offline): "bağlantı koptu" uyarısı çıkmalı, düğmeler kapanmalı;
   ağ gelince durum kendiliğinden tazelenmeli.
6. Telefonda anasayfa ve Kedi Odası yatay kaydırmasız açılmalı.
