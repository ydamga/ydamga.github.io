// Ekip kedisinin oyun ayarları. Oyun dengesi buradan değiştirilir.
// Anahtar adları Supabase'deki public.game_rules sütunlarıyla aynıdır: canlı modda kurallar
// veri tabanından gelir (sunucu tarafında uygulanır), bu dosya yerel deneme modunda kullanılır.
// Canlı modda değeri değiştirmek için supabase/schema.sql'deki "Oyun ayarlarını değiştirme" örneğine bakın.
window.KEDI_AYAR = {
  ad: 'Fındık',

  kurallar: {
    hunger_rise_per_hour: 4,        // açlık saatte artar
    happiness_drop_per_hour: 2,     // mutluluk saatte azalır
    cleanliness_drop_per_hour: 1,   // temizlik saatte azalır
    energy_drop_per_hour: 2,        // uyanıkken enerji saatte azalır (istenen kurallarda yoktu; enerjinin zamanla düşmesi için eklendi)
    energy_rest_per_hour: 10,       // dinlenirken enerji saatte artar
    rest_max_hours: 3,              // bir dinlenme en çok bu kadar sürer; enerji 100 olunca erken uyanır

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
    max_actions_per_hour: 60
  },

  // Yerel deneme modunda ilk açılıştaki değerler
  baslangic: { hunger: 30, happiness: 70, energy: 70, cleanliness: 80 }
};
