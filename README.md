# ÖDHM araçları

GitHub Pages'te yayınlanan statik site (HTML, CSS, vanilla JavaScript; derleme adımı yok).

| Sayfa | İçerik |
| --- | --- |
| `index.html` | Üniversite sistemleri, araçlar, günün menüsü, ÖSYM takvimi, alt bilgide ekip kedisi |
| `kedi-odasi.html` | Ekip kedisinin odası: göstergeler, bakım, geçmiş, ad seçimi, ekip ve özlem |
| `ders-programi.html`, `ziyaret.html`, `yemek.html`, `sinavlar.html` | Mevcut araçlar |

Ortak görünüm `ortak.css`, tema ve ayarlar paneli `ayarlar.js`, ÖSYM bildirimleri `worker/` ve `.github/workflows/osym.yml`.

---

## Ekip kedisi

Anasayfanın alt bilgisinde, yalnızca kendisine ayrılmış bir şeritte dolaşan ortak bir kedi (Fındık). Kediye ya da
**Araçlar → Kedi Odası**'na basınca odası açılır; orada beslenir, oynatılır, dinlendirilir ve temizlenir.

### Dosyalar

| Dosya | Görevi |
| --- | --- |
| `kedi/ayar.js` | Oyun ayarları (oranlar, eşikler, sıklık sınırı), kedinin adı ve özlem süresi (`ozlemGun`). Tek yapılandırma yeri |
| `kedi/baglanti.js` | Supabase adresi ve herkese açık anahtar. Boşsa yerel deneme modu |
| `kedi/baglanti.ornek.js` | Doldurulmuş örnek (sayfalarda yüklenmez) |
| `kedi/kurallar.js` | Geçen süreye göre ihtiyaç hesabı, eylemler, ruh hâli, özlenenler. DOM'suz; Node'da test edilir |
| `kedi/durum.js` | Durumun kaynağı: yerel deneme (localStorage) ya da Supabase (RPC + Realtime) |
| `kedi/karakter.js` | SVG kedi ve davranış seçimi (yürüme, bakınma, esneme, yalanma, uyuma) |
| `kedi/kedi.css` | Pozlar ve animasyonlar |
| `kedi/ana.js`, `kedi/oda.js` | Anasayfa şeridi ve Kedi Odası arayüzü |
| `kedi/bildirim.js` | Anlık duyurular (başkası bakım yapınca/sevince), sekme başlığı uyarısı, masaüstü bildirimi |
| `kedi/sahne.js` | Odanın gökyüzü (günün saati), süsleri (tatil, yılbaşı, mevsim) ve kazanılan eşyaları |
| `kedi/lazer.js` | Lazer mini oyunu |
| `supabase/schema.sql` | Tablolar, kısıtlar, indeksler, fonksiyonlar, RLS, Realtime |
| `supabase/test-rls.sql` | Yetki ve fonksiyon sınaması (geri alınan tek işlem) |
| `supabase/guncelleme-etkilesim.sql` | Kurulu şemaya oyuncakları, ödül mamasını, haftalık hedefi ve görünüş oylarını ekler |
| `supabase/guncelleme-uyandir.sql` | Kurulu isimli şemaya 2 saatlik bakım oranlarını ve uyandırmayı ekler (tekrar çalıştırılabilir) |
| `supabase/eski-semayi-kaldir.sql` | Eski e-postayla girişli şemayı kaldırır (yalnızca o kuruluysa) |
| `test/kedi-kurallar.test.js` | Oyun kuralları birim testleri |

Bütün yollar görelidir (`kedi/...`, `kedi-odasi.html`); site bir depo alt dizininde (`kullanici.github.io/depo/`) yayınlansa da çalışır.

### Nasıl çalışır

- **Zaman gerçek süreye göre işler.** Kedinin kaydı bir anlık görüntüdür (değerler + `updated_at` + `resting_until`).
  Şimdiki değerler her okumada geçen süreden hesaplanır; sayfa kapalıyken de ihtiyaçlar ilerler. Sunucuya
  periyodik istek gitmez; sayfa yalnızca açılışta, sekmeye dönüldüğünde ve bağlantı geri geldiğinde durumu okur,
  değişiklikleri Realtime ile alır.
- **Dinlenme süreli bir durumdur.** "Dinlendir" kediyi en çok `rest_max_hours` saat uyutur; bu sürede enerji
  saatte `energy_rest_per_hour` artar, enerji 100 olunca kedi erken uyanır. Kedi uyurken "Dinlendir" düğmesi
  **Uyandır** olur: uyandırılan kedi o ana kadar kazandığı enerjiyi korur. Uyurken oyun reddedilir; besleme ve
  temizleme uykuyu bozmaz.
- **Bakım sıklığı:** varsayılan oranlarla (saatte açlık +12,5, mutluluk −7,5, temizlik −12,5, enerji −4) kedi
  yaklaşık 2 saatte bir beslenmek, oynanmak ve taranmak ister.
- **İhtiyaç zaten karşılanmışsa** eylem reddedilir ve kedi buna uygun tepki verir (tokken yemez, temizken
  temizlenmez, uykusu yokken uyumaz, yorgunken oynamaz, uyanıkken uyandırılmaz). Reddedilen deneme de geçmişe yazılır.
- **Ceza yok.** Değerler 0–100 arasında kalır; ihmal edilen kedi yalnızca aç, üzgün, yorgun ve tozlu görünür,
  ilk bakımda toparlanır.
- **Görünür davranış:** acıkınca mama balonu, mutsuzken düşük kulak ve üzgün yüz, daha az ve yavaş yürüme,
  yorgunken esneme ve uyuklama, kirliyken lekeler ve kendini yalama, bakım sonrası kalpler. Göstergeler renk,
  simge, metin ve (düşükse) ünlem + çizgili çubukla okunur.
- **Performans:** yalnızca `transform`/`opacity` animasyonları; yürüme tek bir CSS geçişi, sürekli JavaScript
  döngüsü yok, sekme gizliyken davranış seçimi durur. Değerler 30–60 saniyede bir yeniden hesaplanır.
- **Hareketi azalt** (`prefers-reduced-motion`) açıksa kedi yerinde durur, animasyonlar kapanır; pozu ve
  balonu yine durumunu gösterir.

### Etkileşim

- **Sevme:** Odada kediye dokun ya da **Sev**'e bas; anasayfada kediye basılı tut. Kedi mırlar, kalpler çıkar.
  Sayaç yok, veri tabanına yazılmaz; öteki açık sayfalarda "Ayşe Fındık ile sevgi paylaştı" duyurusu çıkar.
- **Sözler:** Kedi ara sıra balonda konuşur: ihtiyacını bakan kişiye adıyla söyler ("Ayşe, mama?"),
  özlediği birini sorar ("Zeynep nerede?").
- **Uyarılar:** Acil ihtiyaçta anasayfadaki kedinin üstünde ünlem çıkar, sekme başlığı "(!) Fındık acıktı" olur.
  Odadaki **Fındık acıkınca bildir** açılırsa site bir sekmede açıkken masaüstü bildirimi gelir (en çok 2 saatte
  bir). Hiçbir sekme açık değilken bildirim için sunucuda zamanlayıcı gerekir; bu kurulu değil.
- **Canlılık:** Başkası bakım yapınca açık sayfalarda kısa duyuru çıkar ve kedi o bakıma tepki verir.
- **Oyuncaklar:** **Oynat** top, ip ya da lazer sorar. Her hafta bir oyuncak gözdedir (ISO haftasına göre döner,
  söylenmez); onunla oynayınca `favorite_toy_bonus` kadar ek mutluluk ve "bayıldı" tepkisi gelir.
- **Lazer oyunu:** 10 saniye; noktayı fareyle, parmakla ya da ok tuşlarıyla gezdir. Nokta yerdeyken kedi
  yetişirse yakalama sayılır; her yakalama +1 mutluluk (en çok `max_game_bonus`, sunucu da sınırlar).
- **Ödül maması:** kişi başı günde bir (Türkiye saatiyle); açlık `treat_hunger` azalır, mutluluk `treat_happiness` artar.
- **Bağlılık:** Son 14 günde açık ara en çok bakan (en az 5 bakım) sayfayı açınca kedi koşarak karşılar (oturumda bir kez).
- **Haftalık hedef:** Haftada `weekly_goal` (60) bakım. Hedefin tuttuğu her hafta odaya sırayla bir eşya gelir:
  kedi ağacı, saksı çiçeği, balık tablosu, halı, lamba, yumak sepeti. Kartta en çok bakanlar ve en çok oynanan oyuncak.
- **Günlük:** Kedinin ağzından bugünün ve dünün özeti.
- **Rozetler:** Son 5 haftanın bakımlarından: Sabah kuşu (09:00'dan önce 3), Akşam nöbetçisi (18:00'den sonra 3),
  Sadık dost (5 iş günü üst üste; hafta sonu seriyi bozmaz), Mama ustası (20), Oyun arkadaşı (20),
  Tarak ustası (15), Şımartan (5 ödül), Lazer avcısı (bir oyunda 8 yakalama).
- **Gün saati:** Pencerede sabah, gündüz, akşam ve gece gökyüzü; 22:00–07:00 arası kedi uyur görünür
  (yalnızca görünüş: ihtiyaçlar işlemeye devam eder, bakım yapılabilir).
- **Süsler:** Akademik takvimdeki tatillerde (ulusal bayramda bayrak, dini bayramda fener), yılbaşında ışıklar
  ve ağaç; başka zaman mevsime göre pencere (çiçek, güneş, yaprak, kar).
- **Görünüş:** Ekip tasma rengi (yok/kırmızı/mavi/yeşil/mor/sarı) ve tüy rengi (turuncu/gri/siyah/krem) için oy
  verir; en çok oy alan görünür (eşitlikte en son oylanan).

### İki çalışma modu

| | Yerel deneme | Ortak canlı |
| --- | --- | --- |
| Ne zaman | `kedi/baglanti.js` boş | `kedi/baglanti.js` dolu |
| Durum | Bu tarayıcının localStorage'ı | Supabase PostgreSQL |
| Kim bakım yapar | Bu tarayıcıyı kullanan | Ekip listesinden adını seçen herkes (giriş yok) |
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

1. **SQL Editor → New query**: `supabase/schema.sql` dosyasının tamamını yapıştırıp **Run**
   (eski girişli şema kuruluysa önce 4. adıma bakın). Şema daha önce kurulduysa onun yerine sırayla
   `guncelleme-uyandir.sql` ve `guncelleme-etkilesim.sql`'i çalıştırın.
2. Yeni bir sorguda `supabase/test-rls.sql`'i çalıştırın. Çıktıda (Messages/Notices) yalnızca `OK ...` satırları ve
   sonda `Bütün denetimler geçti` görünmeli. `HATA: ...` görürseniz canlıya geçmeyin.
   Betik tek işlemde çalışır ve sonunda geri alınır; test kullanıcıları kalmaz.

### 3. Ekip (isimle bakım, giriş yok)

Giriş ya da kayıt yoktur; Supabase Authentication ayarlarına dokunmanız gerekmez. Kedi Odası'nı açan kişi
**Kediye kim bakıyor?** kutusundan adını seçer ya da listede yoksa yazıp ekler. Seçim o tarayıcıda hatırlanır;
her bakım bu adla geçmişe yazılır ve geçmişi herkes görür.

- **Özlem:** `kedi/ayar.js` → `ozlemGun` (varsayılan 3) gündür bakım yapmayan kişiyi kedi özler. Odada
  "Fındık özledi: …" satırı ve Ekip listesinde etiket görünür; o kişi sayfayı açınca kedi onu karşılar, bakım
  yapınca da özel bir tepki verir. Hiç bakım yapmamış kişi için süre listeye eklendiği andan sayılır.
- Kimlik doğrulaması olmadığından sayfayı açan herkes listedeki herhangi bir adı seçebilir. Site yalnızca ekipçe
  kullanıldığı için bu bilinçli bir tercihtir; kötüye kullanımı sıklık sınırları ve isim sınırları önler.
- Ad düzeltme ya da listeden çıkarma SQL Editor'den yapılır (`schema.sql` sonundaki örnekler).

### 4. (Yalnızca eski kurulumdan geçiyorsanız)

Önceki sürümün e-postayla girişli şeması kuruluysa, `schema.sql`'den önce `supabase/eski-semayi-kaldir.sql`'i
çalıştırın. Kedinin değerleri ve geçmişi sıfırlanır. Authentication'daki eski kullanıcılar artık kullanılmaz;
isterseniz panelden silebilirsiniz. *Allow new users to sign up* ayarının bir önemi kalmaz.

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
update public.game_rules set hunger_rise_per_hour = 6, updated_at = now() where id = 1;
```

Yeni oran son bakımdan bu yana geçen sürenin tamamına uygulanır; eski oranla geçen süreyi korumak için
değiştirmeden hemen önce bir bakım yapın. Hesabın kendisi `kedi/kurallar.js` ve `private.pet_current()` /
`public.perform_pet_action()` içinde aynıdır; birini değiştirirseniz ötekini de değiştirin ve testleri çalıştırın.

---

## Güvenlik modeli

- **Tek kedi:** `pets.id` birincil anahtar ve `check (id = 1)`; satır şemayla oluşur, istemci ekleyemez/silemez.
- **İstemci hiçbir tabloya yazamaz.** `anon` ve `authenticated` rollerinin tablo yetkileri geri alınmış, yalnızca
  okuma verilmiştir. Yazma iki fonksiyonla yapılır: `add_team_member(ad)` ve `perform_pet_action(eylem, üye_id)`.
  Tarayıcı değer göndermez; kedinin değerlerini ve zamanı sunucu belirler (`clock_timestamp()`), geçmişteki adı
  ekip listesinden sunucu kopyalar.
- **Atomik ve eşzamanlı güvenli:** bakım fonksiyonu kedi satırını `SELECT ... FOR UPDATE` ile kilitler, durumu kilit
  alındıktan sonraki sunucu saatine göre hesaplar, günceller ve geçmişi aynı işlemde yazar. Aynı anda gelen iki
  bakım sıraya girer; ikincisi birincinin sonucunu görür, veri ezilmez.
- **Kimlik yok, ad var:** giriş olmadığı için bakan kişi doğrulanmaz; herkes listedeki bir adı seçebilir (yukarıda
  3. adım). Ad 1–30 karakter, büyük/küçük harf farkı olmadan tekildir.
- **Okuma:** kedinin durumu, kurallar, ekip listesi ve bakım geçmişi herkese açıktır.
- **Sıklık sınırları:** kişi başına `cooldown_seconds` (3 sn) bekleme ve saatte `max_actions_per_hour` (60) bakım;
  herkes toplamında dakikada `max_actions_per_minute_total` (30) bakım. Ekip listesi en çok 40 ad; saatte en çok
  10 yeni ad. Bakım denetimleri satır kilidinin arkasında olduğundan paralel isteklerle aşılamaz.
- **Gizli anahtar yok:** istemcide yalnızca herkese açık anahtar bulunur; `.gitignore` `.env` dosyalarını dışarıda tutar.

---

## Testler

```bash
node --test test/kedi-kurallar.test.js
```

Oyun kurallarını sınar: geçen süre, 0–100 sınırları, dört eylem, reddetme koşulları, süreli dinlenme ve erken
uyanma, ihmalde ceza olmaması, göstergeler.

Yetkiler ve fonksiyonlar için `supabase/test-rls.sql` (yukarıda 2. adım).

### Canlıya geçince elle sınayın

1. İki farklı tarayıcıda (ör. Chrome ve Firefox) Kedi Odası'nı açın; iki ekranda aynı değerler görünmeli.
2. Birinde adınızı ekleyip **Besle**'ye basın; ötekinde gösterge, geçmiş ve Ekip listesi sayfa yenilenmeden değişmeli.
3. İki farklı adla iki tarayıcıda aynı anda farklı düğmelere basın; `pet_actions`'ta iki satır olmalı ve
   kedinin değerleri iki eylemin toplam etkisini göstermeli.
4. Ad seçmeden **Besle**'ye basınca ad seçme kutusu açılmalı; tarayıcı konsolundan
   `supabase.createClient(url, anahtar).from('pets').update({ hunger: 0 }).eq('id', 1)` hata vermeli.
5. Ağı kapatın (DevTools → Network → Offline): "bağlantı koptu" uyarısı çıkmalı, düğmeler kapanmalı;
   ağ gelince durum kendiliğinden tazelenmeli.
6. Telefonda anasayfa ve Kedi Odası yatay kaydırmasız açılmalı.
