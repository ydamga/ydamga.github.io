-- Ekip kedisi: yetki ve RLS sınaması
-- schema.sql'den sonra Supabase SQL Editor'de çalıştırın. Hepsi tek işlemde yapılır ve sonunda geri alınır;
-- veri tabanında iz bırakmaz. Her denetim "OK ..." notu yazar; bir denetim başarısız olursa betik
-- "HATA: ..." ile durur.
--
-- Rol geçişi Supabase'in yaptığı gibidir: SET ROLE anon/authenticated + request.jwt.claims.
-- Eşzamanlılık bu betikle sınanamaz (tek bağlantı); README.md'deki elle sınama adımlarına bakın.

begin;

-- ---- Hazırlık (postgres olarak) ----
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'uye@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'yabanci@test.invalid', 'authenticated', 'authenticated');

do $$
begin
  assert (select count(*) from public.profiles where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2')) = 2,
    'HATA: yeni kullanıcılar için profil oluşmadı';
  assert not (select is_member from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'),
    'HATA: yeni kullanıcı varsayılan olarak üye';
  raise notice 'OK hazırlık: profil tetikleyicisi çalışıyor, yeni kullanıcı üye değil';

  -- Tek kedi
  begin
    insert into public.pets (id, hunger, happiness, energy, cleanliness) values (2, 0, 0, 0, 0);
    raise exception 'HATA: ikinci kedi eklenebildi';
  exception when check_violation then raise notice 'OK tek kedi: id=2 reddedildi';
  end;
  begin
    insert into public.pets (id, hunger, happiness, energy, cleanliness) values (1, 0, 0, 0, 0);
    raise exception 'HATA: id=1 ikinci kez eklenebildi';
  exception when unique_violation then raise notice 'OK tek kedi: ikinci id=1 reddedildi';
  end;
  -- Sınırlar
  begin
    update public.pets set hunger = 101 where id = 1;
    raise exception 'HATA: 100 üstü değer kaydedilebildi';
  exception when check_violation then raise notice 'OK sınır: 101 reddedildi';
  end;
end $$;

update public.profiles set is_member = true, display_name = 'Test Üye' where id = '00000000-0000-4000-8000-0000000000a1';
-- Sınamada bekleme süresi kapalı; sıklık sınırı aşağıda ayrıca sınanır
update public.game_rules set cooldown_seconds = 0 where id = 1;
update public.pets set hunger = 50, happiness = 50, energy = 50, cleanliness = 50,
  resting_until = null, updated_at = now() where id = 1;

-- ---- 1) Ekip üyesi ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$
declare r jsonb; once numeric; sonra numeric; n int;
begin
  select hunger into once from public.pets where id = 1;
  r := public.perform_pet_action('feed');
  assert r->>'result' = 'applied', 'HATA: besleme uygulanmadı: ' || r::text;
  select hunger into sonra from public.pets where id = 1;
  assert sonra < once, 'HATA: besleme açlığı azaltmadı';
  raise notice 'OK üye: besleme uygulandı (açlık % → %)', round(once), round(sonra);

  select count(*) into n from public.pet_actions where actor_name = 'Test Üye' and action = 'feed';
  assert n = 1, 'HATA: geçmişte üyenin adı yok';
  raise notice 'OK üye: geçmiş satırı sunucudaki adla yazıldı';

  r := public.perform_pet_action('play');
  assert r->>'result' = 'applied', 'HATA: oyun uygulanmadı';
  r := public.perform_pet_action('clean');
  assert r->>'result' = 'applied', 'HATA: temizleme uygulanmadı';
  r := public.perform_pet_action('rest');
  assert r->>'result' = 'applied' and (r->'pet'->>'resting_until') is not null, 'HATA: dinlenme başlamadı';
  r := public.perform_pet_action('play');
  assert r->>'result' = 'declined' and r->>'reason' = 'sleeping', 'HATA: uyuyan kedi oynatıldı';
  r := public.perform_pet_action('rest');
  assert r->>'reason' = 'already_resting', 'HATA: ikinci dinlenme reddedilmedi';
  raise notice 'OK üye: oyna/temizle/dinlendir uygulandı, uykudayken oyun reddedildi';

  begin
    perform public.perform_pet_action('dance');
    raise exception 'HATA: bilinmeyen eylem kabul edildi';
  exception when invalid_parameter_value then raise notice 'OK üye: bilinmeyen eylem reddedildi';
  end;

  -- Doğrudan yazma yok
  begin
    update public.pets set hunger = 0 where id = 1;
    raise exception 'HATA: üye kediyi doğrudan güncelleyebildi';
  exception when insufficient_privilege then raise notice 'OK üye: pets doğrudan güncellenemiyor';
  end;
  begin
    insert into public.pet_actions (actor_id, actor_name, action, result) values (null, 'Sahte', 'feed', 'applied');
    raise exception 'HATA: üye geçmişe sahte satır ekleyebildi';
  exception when insufficient_privilege then raise notice 'OK üye: pet_actions doğrudan yazılamıyor';
  end;
  begin
    update public.profiles set display_name = 'Başkası' where id = '00000000-0000-4000-8000-0000000000a1';
    raise exception 'HATA: üye kendi adını değiştirebildi';
  exception when insufficient_privilege then raise notice 'OK üye: profil değiştirilemiyor';
  end;
  begin
    update public.game_rules set feed_amount = 100 where id = 1;
    raise exception 'HATA: üye oyun ayarlarını değiştirebildi';
  exception when insufficient_privilege then raise notice 'OK üye: game_rules değiştirilemiyor';
  end;

  select count(*) into n from public.profiles;
  assert n >= 2, 'HATA: üye ekip profillerini göremiyor';
  raise notice 'OK üye: ekip profillerini ve geçmişi görüyor';
end $$;

-- Sıklık sınırı (postgres olarak ayarla, üye olarak dene)
reset role;
update public.game_rules set cooldown_seconds = 60 where id = 1;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$
begin
  perform public.perform_pet_action('feed');
  raise exception 'HATA: bekleme süresi uygulanmadı';
exception when raise_exception then
  if sqlerrm <> 'cooldown' then raise; end if;
  raise notice 'OK sıklık: bekleme süresi içinde ikinci istek reddedildi';
end $$;
reset role;
update public.game_rules set cooldown_seconds = 0, max_actions_per_hour = 6 where id = 1;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$
begin
  perform public.perform_pet_action('feed');
  raise exception 'HATA: saatlik sınır uygulanmadı';
exception when raise_exception then
  if sqlerrm <> 'rate_limited' then raise; end if;
  raise notice 'OK sıklık: saatlik sınır aşılınca istek reddedildi';
end $$;

-- ---- 2) Giriş yapmış ama ekip üyesi olmayan kullanıcı ----
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

do $$
declare n int;
begin
  begin
    perform public.perform_pet_action('feed');
    raise exception 'HATA: üye olmayan bakım yapabildi';
  exception when insufficient_privilege then
    if sqlerrm <> 'not_member' then raise; end if;
    raise notice 'OK üye olmayan: bakım reddedildi';
  end;
  select count(*) into n from public.pet_actions;
  assert n = 0, 'HATA: üye olmayan geçmişi görüyor';
  select count(*) into n from public.profiles;
  assert n = 1, 'HATA: üye olmayan başka profilleri görüyor';
  raise notice 'OK üye olmayan: geçmişi ve başka profilleri göremiyor';
  begin
    update public.profiles set is_member = true where id = '00000000-0000-4000-8000-0000000000a2';
    raise exception 'HATA: kullanıcı kendini üye yapabildi';
  exception when insufficient_privilege then raise notice 'OK üye olmayan: kendini üye yapamıyor';
  end;
  perform public.get_pet_state();
  raise notice 'OK üye olmayan: kedinin durumunu okuyabiliyor';
end $$;

-- ---- 3) Anonim ziyaretçi ----
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare r jsonb;
begin
  r := public.get_pet_state();
  assert r->'pet' is not null and r->'rules' is not null, 'HATA: anonim durum okuyamadı';
  raise notice 'OK anonim: kedinin durumunu okuyabiliyor';
  begin
    perform public.perform_pet_action('feed');
    raise exception 'HATA: anonim bakım fonksiyonunu çağırabildi';
  exception when insufficient_privilege then raise notice 'OK anonim: bakım fonksiyonu çağrılamıyor';
  end;
  begin
    perform 1 from public.pet_actions;
    raise exception 'HATA: anonim geçmişi okuyabildi';
  exception when insufficient_privilege then raise notice 'OK anonim: geçmiş okunamıyor';
  end;
  begin
    perform 1 from public.profiles;
    raise exception 'HATA: anonim profilleri okuyabildi';
  exception when insufficient_privilege then raise notice 'OK anonim: profiller okunamıyor';
  end;
  begin
    update public.pets set hunger = 0 where id = 1;
    raise exception 'HATA: anonim kediyi güncelleyebildi';
  exception when insufficient_privilege then raise notice 'OK anonim: pets güncellenemiyor';
  end;
end $$;

reset role;
select 'Bütün denetimler geçti (değişiklikler geri alınıyor)' as sonuc;
rollback;
