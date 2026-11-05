// Ekip kedisinin oyun ayarları. Oyun dengesi buradan değiştirilir.
// Anahtar adları Supabase'deki public.game_rules sütunlarıyla aynıdır: canlı modda kurallar
// veri tabanından gelir (sunucu tarafında uygulanır), bu dosya yerel deneme modunda kullanılır.
// Canlı modda değeri değiştirmek için supabase/schema.sql'deki "Oyun ayarlarını değiştirme" örneğine bakın.
window.KEDI_AYAR = {
  ad: 'Fındık',

  // Bu kadar gündür bakım yapmayan ekip üyesini kedi özler (Kedi Odası'nda görünür)
  ozlemGun: 3,

  kurallar: {
    hunger_rise_per_hour: 12.5,     // açlık saatte artar (bir mama 25 → 2 saatte bir beslenmek ister)
    happiness_drop_per_hour: 7.5,   // mutluluk saatte azalır (bir oyun 15 → 2 saatte bir oyun ister)
    cleanliness_drop_per_hour: 12.5, // temizlik saatte azalır (bir tarama 25 → 2 saatte bir taranmak ister)
    energy_drop_per_hour: 4,        // uyanıkken enerji saatte azalır (istenen kurallarda yoktu; enerjinin zamanla düşmesi için eklendi)
    energy_rest_per_hour: 15,       // dinlenirken enerji saatte artar
    rest_max_hours: 3,              // bir dinlenme en çok bu kadar sürer; enerji 100 olunca erken uyanır (ya da uyandırılır)

    feed_amount: 25,                // besleme açlığı azaltır
    play_amount: 15,                // oyun mutluluğu artırır
    play_energy_cost: 10,           // oyun enerji harcatır
    clean_amount: 25,               // temizleme temizliği artırır

    // İhtiyaç zaten karşılanmışsa eylem reddedilir
    full_hunger: 10,                // açlık bu değer ya da altındaysa yemez
    full_happiness: 95,             // mutluluk bu değer ya da üstündeyse oyun istemez
    full_energy: 90,                // enerji bu değer ya da üstündeyse uyumaz
    full_cleanliness: 95,           // temizlik bu değer ya da üstündeyse temizlenmez
    play_min_energy: 15,            // enerji bunun altındaysa oynayamaz

    // Kötüye kullanım sınırı (yalnızca canlı modda, sunucuda uygulanır)
    cooldown_seconds: 3,
    max_actions_per_hour: 60,
    max_actions_per_minute_total: 30
  },

  // Yerel deneme modunda ilk açılıştaki değerler
  baslangic: { hunger: 30, happiness: 70, energy: 70, cleanliness: 80 }
};
