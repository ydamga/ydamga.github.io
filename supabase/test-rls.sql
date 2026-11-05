-- Ekip kedisi: yetki ve fonksiyon sınaması (isimle bakım)
-- schema.sql'den sonra Supabase SQL Editor'de çalıştırın. Hepsi tek işlemde yapılır ve sonunda geri alınır;
-- veri tabanında iz bırakmaz. Her denetim "OK ..." notu yazar; bir denetim başarısız olursa betik
-- "HATA: ..." ile durur.
--
-- Rol geçişi Supabase'in yaptığı gibidir: SET ROLE anon + request.jwt.claims.
-- Eşzamanlılık bu betikle sınanamaz (tek bağlantı); README.md'deki elle sınama adımlarına bakın.

begin;

-- ---- Hazırlık (postgres olarak) ----
do $$
begin
  -- Tek kedi
  begin
    insert into public.pets (id, hunger, happiness, energy, cleanliness) values (2, 0, 0, 0, 0);
    raise exception 'HATA: ikinci kedi eklenebildi';
  exception when check_violation then raise notice 'OK tek kedi: id=2 reddedildi';
  end;
  begin
    update public.pets set hunger = 101 where id = 1;
    raise exception 'HATA: 100 üstü değer kaydedilebildi';
  exception when check_violation then raise notice 'OK sınır: 101 reddedildi';
  end;
end $$;

-- Sınamada bekleme süresi kapalı; sıklık sınırları aşağıda ayrıca sınanır
update public.game_rules set cooldown_seconds = 0 where id = 1;
update public.pets set hunger = 50, happiness = 50, energy = 50, cleanliness = 50,
  resting_until = null, updated_at = now() where id = 1;

-- ---- 1) Anonim ziyaretçi: isim ekler, bakım yapar ----
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare r jsonb; m jsonb; m2 jsonb; once numeric; sonra numeric; n int; durum jsonb;
begin
  m := public.add_team_member('  Test   Kişi  ');
  assert m->>'name' = 'Test Kişi', 'HATA: ad boşlukları düzeltilmedi: ' || m::text;
  assert (m->>'existed')::boolean = false, 'HATA: yeni ad var olan sayıldı';
  m2 := public.add_team_member('test kişi');
  assert m2->>'id' = m->>'id' and (m2->>'existed')::boolean, 'HATA: aynı ad (harf farkıyla) ikinci kez eklendi';
  raise notice 'OK isim: eklendi, aynı ad tekrar eklenmedi';

  begin
    perform public.add_team_member('   ');
    raise exception 'HATA: boş ad kabul edildi';
  exception when invalid_parameter_value then raise notice 'OK isim: boş ad reddedildi';
  end;
  begin
    perform public.add_team_member(repeat('a', 31));
    raise exception 'HATA: 30 karakterden uzun ad kabul edildi';
  exception when invalid_parameter_value then raise notice 'OK isim: uzun ad reddedildi';
  end;

  durum := public.get_pet_state();
  assert durum->'pet' is not null and durum->'rules' is not null, 'HATA: durum okunamadı';
  assert jsonb_array_length(durum->'team') >= 1, 'HATA: ekip durumda yok';
  raise notice 'OK durum: kedi, kurallar ve ekip okunuyor';

  select hunger into once from public.pets where id = 1;
  r := public.perform_pet_action('feed', (m->>'id')::bigint);
  assert r->>'result' = 'applied', 'HATA: besleme uygulanmadı: ' || r::text;
  select hunger into sonra from public.pets where id = 1;
  assert sonra < once, 'HATA: besleme açlığı azaltmadı';
  raise notice 'OK bakım: besleme uygulandı (açlık % → %)', round(once), round(sonra);

  select count(*) into n from public.pet_actions where actor_name = 'Test Kişi' and action = 'feed';
  assert n = 1, 'HATA: geçmişte ad yok';
  durum := public.get_pet_state();
  assert exists (select 1 from jsonb_array_elements(durum->'team') e
                 where e->>'name' = 'Test Kişi' and e->>'last_action_at' is not null), 'HATA: son uğrama zamanı yok';
  raise notice 'OK geçmiş: ad sunucuda yazıldı, son uğrama zamanı ekipte görünüyor';

  r := public.perform_pet_action('play', (m->>'id')::bigint);
  assert r->>'result' = 'applied', 'HATA: oyun uygulanmadı';
  r := public.perform_pet_action('clean', (m->>'id')::bigint);
  assert r->>'result' = 'applied', 'HATA: temizleme uygulanmadı';
  r := public.perform_pet_action('rest', (m->>'id')::bigint);
  assert r->>'result' = 'applied' and (r->'pet'->>'resting_until') is not null, 'HATA: dinlenme başlamadı';
  r := public.perform_pet_action('play', (m->>'id')::bigint);
  assert r->>'result' = 'declined' and r->>'reason' = 'sleeping', 'HATA: uyuyan kedi oynatıldı';
  raise notice 'OK bakım: oyna/temizle/dinlendir uygulandı, uykudayken oyun reddedildi';
  r := public.perform_pet_action('wake', (m->>'id')::bigint);
  assert r->>'result' = 'applied' and (r->'pet'->>'resting_until') is null, 'HATA: uyandırma uygulanmadı: ' || r::text;
  r := public.perform_pet_action('wake', (m->>'id')::bigint);
  assert r->>'result' = 'declined' and r->>'reason' = 'not_sleeping', 'HATA: uyanık kedi uyandırıldı';
  raise notice 'OK bakım: uyuyan kedi uyandırıldı, uyanıkken uyandırma reddedildi';

  begin
    perform public.perform_pet_action('dance', (m->>'id')::bigint);
    raise exception 'HATA: bilinmeyen eylem kabul edildi';
  exception when invalid_parameter_value then raise notice 'OK bakım: bilinmeyen eylem reddedildi';
  end;
  begin
    perform public.perform_pet_action('feed', -1);
    raise exception 'HATA: listede olmayan kişi bakım yapabildi';
  exception when invalid_parameter_value then
    if sqlerrm <> 'unknown_member' then raise; end if;
    raise notice 'OK bakım: listede olmayan kişi reddedildi';
  end;

  -- Doğrudan yazma yok
  begin
    update public.pets set hunger = 0 where id = 1;
    raise exception 'HATA: kedi doğrudan güncellenebildi';
  exception when insufficient_privilege then raise notice 'OK yetki: pets doğrudan güncellenemiyor';
  end;
  begin
    insert into public.pet_actions (actor_name, action, result) values ('Sahte', 'feed', 'applied');
    raise exception 'HATA: geçmişe sahte satır eklenebildi';
  exception when insufficient_privilege then raise notice 'OK yetki: pet_actions doğrudan yazılamıyor';
  end;
  begin
    insert into public.team_members (name) values ('Sahte');
    raise exception 'HATA: ekip listesine doğrudan yazılabildi';
  exception when insufficient_privilege then raise notice 'OK yetki: team_members doğrudan yazılamıyor';
  end;
  begin
    delete from public.team_members;
    raise exception 'HATA: ekip listesi silinebildi';
  exception when insufficient_privilege then raise notice 'OK yetki: team_members silinemiyor';
  end;
  begin
    update public.game_rules set feed_amount = 100 where id = 1;
    raise exception 'HATA: oyun ayarları değiştirilebildi';
  exception when insufficient_privilege then raise notice 'OK yetki: game_rules değiştirilemiyor';
  end;

  select count(*) into n from public.pet_actions;
  assert n >= 1, 'HATA: geçmiş okunamıyor';
  raise notice 'OK okuma: geçmiş ve ekip herkese açık';
end $$;

-- ---- 2) Sıklık sınırları (postgres olarak ayarla, anonim olarak dene) ----
reset role;
update public.game_rules set cooldown_seconds = 60 where id = 1;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  perform public.perform_pet_action('feed', (select id from public.team_members where name = 'Test Kişi'));
  raise exception 'HATA: bekleme süresi uygulanmadı';
exception when raise_exception then
  if sqlerrm <> 'cooldown' then raise; end if;
  raise notice 'OK sıklık: bekleme süresi içinde ikinci istek reddedildi';
end $$;

reset role;
update public.game_rules set cooldown_seconds = 0, max_actions_per_hour = 7 where id = 1;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  perform public.perform_pet_action('feed', (select id from public.team_members where name = 'Test Kişi'));
  raise exception 'HATA: kişi başı saatlik sınır uygulanmadı';
exception when raise_exception then
  if sqlerrm <> 'rate_limited' then raise; end if;
  raise notice 'OK sıklık: kişi başı saatlik sınır aşılınca istek reddedildi';
end $$;

reset role;
update public.game_rules set max_actions_per_hour = 1000, max_actions_per_minute_total = 7 where id = 1;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare m jsonb;
begin
  m := public.add_team_member('Başka Kişi');
  perform public.perform_pet_action('feed', (m->>'id')::bigint);
  raise exception 'HATA: toplam dakikalık sınır uygulanmadı';
exception when raise_exception then
  if sqlerrm <> 'rate_limited' then raise; end if;
  raise notice 'OK sıklık: herkes toplamındaki dakikalık sınır uygulandı';
end $$;

-- ---- 3) Etkileşim: ödül maması, oyuncaklar, lazer puanı, görünüş oyları, haftalık hedef ----
reset role;
update public.game_rules set cooldown_seconds = 0, max_actions_per_hour = 1000, max_actions_per_minute_total = 1000 where id = 1;
update public.pets set hunger = 50, happiness = 30, energy = 80, cleanliness = 50,
  resting_until = null, updated_at = now() where id = 1;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare m jsonb; uye bigint; r jsonb; k jsonb; n int;
begin
  m := public.add_team_member('Etkileşim Kişi');
  uye := (m->>'id')::bigint;

  r := public.perform_pet_action('treat', uye);
  assert r->>'result' = 'applied', 'HATA: ödül maması verilemedi: ' || r::text;
  r := public.perform_pet_action('treat', uye);
  assert r->>'result' = 'declined' and r->>'reason' = 'treat_used', 'HATA: aynı gün ikinci ödül maması verildi';
  raise notice 'OK ödül: kişi başı günde bir kez';

  r := public.perform_pet_action('play', uye, 'lazer', 999);
  assert r->>'result' = 'applied' and r->>'toy' = 'lazer', 'HATA: lazerle oyun uygulanmadı: ' || r::text;
  assert r->>'favorite' in ('true', 'false'), 'HATA: gözde oyuncak bilgisi yok';
  select bonus into n from public.pet_actions where member_id = uye and action = 'play' order by id desc limit 1;
  assert n = 10, 'HATA: lazer puanı sınırlanmadı: ' || n;
  r := public.perform_pet_action('play', uye, null, 50);
  assert r->>'toy' = 'top', 'HATA: oyuncak seçilmeyince top kullanılmadı';
  select bonus into n from public.pet_actions where member_id = uye and action = 'play' order by id desc limit 1;
  assert n = 0, 'HATA: lazer dışındaki oyuna puan eklendi';
  begin
    perform public.perform_pet_action('play', uye, 'kemik', 0);
    raise exception 'HATA: bilinmeyen oyuncak kabul edildi';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK oyuncak: lazer puanı sınırlı, varsayılan top, bilinmeyen oyuncak reddedildi';

  k := public.vote_cosmetic(uye, 'collar', 'mavi');
  assert k->>'collar' = 'mavi', 'HATA: tasma oyu sayılmadı: ' || k::text;
  k := public.vote_cosmetic(uye, 'coat', 'gri');
  assert k->>'coat' = 'gri', 'HATA: tüy oyu sayılmadı';
  k := public.vote_cosmetic(uye, 'collar', 'kirmizi');
  assert k->>'collar' = 'kirmizi', 'HATA: oy değiştirilemedi';
  select count(*) into n from public.cosmetic_votes where member_id = uye;
  assert n = 2, 'HATA: kişi başına tür başı tek oy değil';
  begin
    perform public.vote_cosmetic(uye, 'collar', 'pembe');
    raise exception 'HATA: geçersiz renk kabul edildi';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.vote_cosmetic(-1, 'collar', 'mavi');
    raise exception 'HATA: listede olmayan kişi oy verebildi';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.cosmetic_votes (member_id, kind, value) values (uye, 'coat', 'siyah');
    raise exception 'HATA: oylara doğrudan yazılabildi';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK görünüş: oy verildi ve değiştirildi; geçersiz renk, yabancı kişi ve doğrudan yazma reddedildi';

  r := public.get_pet_state();
  assert (r->'week'->>'count')::int >= 4 and (r->'week'->>'goal')::int > 0 and r->'week' ? 'completed',
    'HATA: haftalık hedef bilgisi eksik: ' || (r->'week')::text;
  assert r->'cosmetics'->>'collar' = 'kirmizi' and r->'cosmetics'->>'coat' = 'gri', 'HATA: görünüş durumda yok';
  raise notice 'OK durum: haftalık hedef ve görünüş okunuyor';
end $$;

reset role;
select 'Bütün denetimler geçti (değişiklikler geri alınıyor)' as sonuc;
rollback;
