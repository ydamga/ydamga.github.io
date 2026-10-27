-- Ekip kedisi: Supabase şeması
-- Supabase panelinde SQL Editor'e yapıştırıp bir kez çalıştırın (yeni, boş bir projede).
-- Sonra supabase/test-rls.sql ile politikaları sınayın.
--
-- Güvenlik modeli
--  * Tek kedi: pets.id yalnızca 1 olabilir; satır şemayla birlikte oluşur, istemci ekleyemez/silemez.
--  * İstemci hiçbir tabloya doğrudan yazamaz. Bakım yalnızca public.perform_pet_action('feed'|'play'|'rest'|'clean')
--    ile yapılır: tarayıcı değer göndermez, yalnızca eylemin adını gönderir. Fonksiyon kimliği auth.uid()'den alır,
--    ekip üyeliğini profiles.is_member'dan doğrular, kedi satırını kilitleyip (FOR UPDATE) sunucu saatine göre
--    hesaplar ve tek işlemde günceller. Aynı anda gelen iki bakım sırayla uygulanır, biri ötekini ezmez.
--  * Ekip üyeliğini yalnızca yönetici verir (SQL Editor'den); kullanıcı kendi profilini değiştiremez.
--  * Anonim ziyaretçiler yalnızca kedinin durumunu ve oyun kurallarını okur (anasayfadaki kedi için).
--    Bakım geçmişini ve adları yalnızca ekip üyeleri görür.
--  * Sıklık sınırı: kişi başına game_rules.cooldown_seconds saniyede bir ve saatte max_actions_per_hour bakım.
--
-- Hesap kedi/kurallar.js ile aynıdır; birini değiştirirseniz ötekini de değiştirin.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Oyun ayarları (tek satır). Sütun adları kedi/ayar.js'teki anahtarlarla aynı.
-- ---------------------------------------------------------------------------
create table public.game_rules (
  id smallint primary key default 1 check (id = 1),
  hunger_rise_per_hour      numeric not null default 4  check (hunger_rise_per_hour between 0 and 100),
  happiness_drop_per_hour   numeric not null default 2  check (happiness_drop_per_hour between 0 and 100),
  cleanliness_drop_per_hour numeric not null default 1  check (cleanliness_drop_per_hour between 0 and 100),
  energy_drop_per_hour      numeric not null default 2  check (energy_drop_per_hour between 0 and 100),
  energy_rest_per_hour      numeric not null default 10 check (energy_rest_per_hour between 0 and 100),
  rest_max_hours            numeric not null default 3  check (rest_max_hours > 0 and rest_max_hours <= 24),
  feed_amount               numeric not null default 25 check (feed_amount between 0 and 100),
  play_amount               numeric not null default 15 check (play_amount between 0 and 100),
  play_energy_cost          numeric not null default 10 check (play_energy_cost between 0 and 100),
  clean_amount              numeric not null default 25 check (clean_amount between 0 and 100),
  full_hunger               numeric not null default 10 check (full_hunger between 0 and 100),
  full_happiness            numeric not null default 95 check (full_happiness between 0 and 100),
  full_energy               numeric not null default 90 check (full_energy between 0 and 100),
  full_cleanliness          numeric not null default 95 check (full_cleanliness between 0 and 100),
  play_min_energy           numeric not null default 15 check (play_min_energy between 0 and 100),
  cooldown_seconds          integer not null default 3  check (cooldown_seconds between 0 and 3600),
  max_actions_per_hour      integer not null default 60 check (max_actions_per_hour between 1 and 10000),
  updated_at timestamptz not null default now()
);
insert into public.game_rules (id) values (1);

-- ---------------------------------------------------------------------------
-- Tek ortak kedi. Değerler updated_at anındaki anlık görüntüdür; sonrası okunurken hesaplanır.
-- ---------------------------------------------------------------------------
create table public.pets (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Fındık' check (char_length(name) between 1 and 40),
  hunger      numeric(7,3) not null check (hunger between 0 and 100),
  happiness   numeric(7,3) not null check (happiness between 0 and 100),
  energy      numeric(7,3) not null check (energy between 0 and 100),
  cleanliness numeric(7,3) not null check (cleanliness between 0 and 100),
  resting_until timestamptz,
  updated_at    timestamptz not null default now(),
  last_cared_at timestamptz,
  version bigint not null default 0
);
insert into public.pets (id, hunger, happiness, energy, cleanliness) values (1, 30, 70, 70, 80);

-- ---------------------------------------------------------------------------
-- Profiller: her Supabase Auth kullanıcısı için bir satır (tetikleyiciyle oluşur).
-- display_name ve is_member'ı yalnızca yönetici değiştirir.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  is_member boolean not null default false,
  created_at timestamptz not null default now()
);

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Kullanıcının kayıt sırasında gönderdiği meta veriye (ad vb.) güvenilmez; ad yöneticiden gelir
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Bakım geçmişi. actor_name, eylem anında profilden sunucu tarafından kopyalanır.
-- ---------------------------------------------------------------------------
create table public.pet_actions (
  id bigint generated always as identity primary key,
  pet_id smallint not null default 1 references public.pets (id),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null check (char_length(actor_name) between 1 and 60),
  action text not null check (action in ('feed', 'play', 'rest', 'clean')),
  result text not null check (result in ('applied', 'declined')),
  reason text check (reason in ('already_full', 'sleeping', 'too_tired', 'already_happy', 'already_resting', 'not_tired', 'already_clean')),
  created_at timestamptz not null default now(),
  check ((result = 'applied') = (reason is null))
);
create index pet_actions_created_at_idx on public.pet_actions (created_at desc);
create index pet_actions_actor_created_idx on public.pet_actions (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Yardımcılar (private şema API'de görünmez)
-- ---------------------------------------------------------------------------
create function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_member from public.profiles p where p.id = auth.uid()), false)
$$;
revoke all on function private.is_member() from public;
grant execute on function private.is_member() to authenticated;

-- Anlık görüntüden "at" anındaki değerler. kedi/kurallar.js → hesapla() ile aynı.
create function private.pet_current(
  p public.pets, r public.game_rules, at timestamptz,
  out hunger numeric, out happiness numeric, out energy numeric, out cleanliness numeric, out resting boolean
)
language plpgsql immutable set search_path = '' as $$
declare
  h numeric := greatest(0, extract(epoch from (at - p.updated_at)) / 3600.0);
  dinlenme numeric := 0;
begin
  if p.resting_until is not null and p.resting_until > p.updated_at then
    dinlenme := greatest(0, extract(epoch from (least(at, p.resting_until) - p.updated_at)) / 3600.0);
  end if;
  hunger      := least(100, greatest(0, p.hunger + h * r.hunger_rise_per_hour));
  happiness   := least(100, greatest(0, p.happiness - h * r.happiness_drop_per_hour));
  cleanliness := least(100, greatest(0, p.cleanliness - h * r.cleanliness_drop_per_hour));
  -- Önce dinlenme, sonra uyanık geçen süre
  energy := least(100, greatest(0, p.energy + dinlenme * r.energy_rest_per_hour));
  energy := least(100, greatest(0, energy - (h - dinlenme) * r.energy_drop_per_hour));
  resting := p.resting_until is not null and at < p.resting_until;
end $$;
revoke all on function private.pet_current(public.pets, public.game_rules, timestamptz) from public;

-- ---------------------------------------------------------------------------
-- İstemcinin çağırdığı fonksiyonlar
-- ---------------------------------------------------------------------------

-- Kedinin anlık görüntüsü, kurallar ve sunucu saati. Hesabı istemci yapar (her saniye istek gerekmez).
create function public.get_pet_state() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'pet', (select to_jsonb(p) from public.pets p where p.id = 1),
    'rules', (select to_jsonb(r) - 'id' - 'updated_at' from public.game_rules r where r.id = 1),
    'server_now', now()
  )
$$;
revoke all on function public.get_pet_state() from public;
grant execute on function public.get_pet_state() to anon, authenticated;

-- Bakım eylemi. Tek giriş noktası; değerleri tarayıcıdan almaz.
create function public.perform_pet_action(p_action text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.profiles;
  v_rules public.game_rules;
  v_pet public.pets;
  v_now timestamptz;
  c record;
  v_reason text := null;
  v_hunger numeric; v_happiness numeric; v_energy numeric; v_clean numeric;
  v_until timestamptz;
  v_hours numeric;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found or not v_prof.is_member then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('feed', 'play', 'rest', 'clean') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  select * into v_rules from public.game_rules where id = 1;

  -- Kedi satırını kilitle: eşzamanlı bakımlar burada sıraya girer. Sıklık denetimi de kilidin
  -- arkasında olduğundan aynı kişinin paralel istekleri sınırı aşamaz.
  select * into v_pet from public.pets where id = 1 for update;

  -- Kilidi bekledikten sonraki gerçek saat; updated_at geriye gitmesin
  v_now := greatest(clock_timestamp(), v_pet.updated_at);

  if exists (
    select 1 from public.pet_actions a
    where a.actor_id = v_uid and a.created_at > v_now - make_interval(secs => v_rules.cooldown_seconds)
  ) then
    raise exception 'cooldown' using errcode = 'P0001';
  end if;
  if (select count(*) from public.pet_actions a
      where a.actor_id = v_uid and a.created_at > v_now - interval '1 hour') >= v_rules.max_actions_per_hour then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select * into c from private.pet_current(v_pet, v_rules, v_now);
  v_hunger := c.hunger; v_happiness := c.happiness; v_energy := c.energy; v_clean := c.cleanliness;
  v_until := case when c.resting then v_pet.resting_until else null end;

  if p_action = 'feed' then
    if v_hunger <= v_rules.full_hunger then v_reason := 'already_full';
    else v_hunger := greatest(0, v_hunger - v_rules.feed_amount); end if;
  elsif p_action = 'play' then
    if c.resting then v_reason := 'sleeping';
    elsif v_energy < v_rules.play_min_energy then v_reason := 'too_tired';
    elsif v_happiness >= v_rules.full_happiness then v_reason := 'already_happy';
    else
      v_happiness := least(100, v_happiness + v_rules.play_amount);
      v_energy := greatest(0, v_energy - v_rules.play_energy_cost);
    end if;
  elsif p_action = 'rest' then
    if c.resting then v_reason := 'already_resting';
    elsif v_energy >= v_rules.full_energy then v_reason := 'not_tired';
    else
      -- Enerji 100'e ulaşınca erken uyanır
      v_hours := case when v_rules.energy_rest_per_hour > 0
                      then least(v_rules.rest_max_hours, (100 - v_energy) / v_rules.energy_rest_per_hour)
                      else v_rules.rest_max_hours end;
      v_until := v_now + make_interval(secs => v_hours * 3600);
    end if;
  elsif p_action = 'clean' then
    if v_clean >= v_rules.full_cleanliness then v_reason := 'already_clean';
    else v_clean := least(100, v_clean + v_rules.clean_amount); end if;
  end if;

  if v_reason is null then
    update public.pets set
      hunger = v_hunger, happiness = v_happiness, energy = v_energy, cleanliness = v_clean,
      resting_until = v_until, updated_at = v_now, last_cared_at = v_now, version = version + 1
    where id = 1
    returning * into v_pet;
  end if;

  insert into public.pet_actions (actor_id, actor_name, action, result, reason, created_at)
  values (v_uid, coalesce(nullif(btrim(v_prof.display_name), ''), 'Ekip üyesi'), p_action,
          case when v_reason is null then 'applied' else 'declined' end, v_reason, v_now);

  return jsonb_build_object(
    'result', case when v_reason is null then 'applied' else 'declined' end,
    'reason', v_reason,
    'pet', to_jsonb(v_pet),
    'server_now', v_now
  );
end $$;
revoke all on function public.perform_pet_action(text) from public, anon;
grant execute on function public.perform_pet_action(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Yetkiler ve Row Level Security
-- Supabase yeni tablolarda anon/authenticated'a geniş yetki verebilir; hepsi geri alınıp
-- yalnızca gereken okuma yetkileri verilir. Yazma yetkisi hiçbir istemci rolünde yoktur.
-- ---------------------------------------------------------------------------
revoke all on table public.game_rules, public.pets, public.profiles, public.pet_actions from anon, authenticated;
grant select on table public.game_rules, public.pets to anon, authenticated;
grant select on table public.profiles, public.pet_actions to authenticated;

alter table public.game_rules enable row level security;
alter table public.pets enable row level security;
alter table public.profiles enable row level security;
alter table public.pet_actions enable row level security;

-- Anonim okuma: anasayfadaki kedinin herkese görünmesi için. Kapatmak isterseniz bu iki politikada
-- "anon, " kısmını silin ve yukarıdaki anon select yetkisini geri alın; o zaman kedi yalnızca giriş yapanlara görünür.
create policy "Kurallari herkes okur" on public.game_rules for select to anon, authenticated using (true);
create policy "Kediyi herkes gorur" on public.pets for select to anon, authenticated using (true);

create policy "Kendi profilini ve uyeler ekibi gorur" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_member()));

create policy "Gecmisi ekip uyeleri gorur" on public.pet_actions for select to authenticated
  using ((select private.is_member()));

-- ---------------------------------------------------------------------------
-- Realtime: kedinin durumu ve yeni bakımlar açık sayfalara iletilir (RLS'ye uyar)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.pets, public.pet_actions;

commit;

-- ===========================================================================
-- Yönetici işlemleri (SQL Editor'de, gerektiğinde tek tek çalıştırın)
-- ===========================================================================
-- Ekip üyesi ekleme: önce Authentication → Users → "Invite user" ile e-postayı davet edin, sonra:
--   update public.profiles set is_member = true, display_name = 'Ayşe Y.'
--   where id = (select id from auth.users where email = 'ayse@ornek.edu.tr');
--
-- Üyeliği kaldırma:
--   update public.profiles set is_member = false where id = (select id from auth.users where email = '...');
--
-- Oyun ayarlarını değiştirme (kedi/ayar.js'i de aynı değerlerle güncelleyin):
--   update public.game_rules set hunger_rise_per_hour = 3, updated_at = now() where id = 1;
--   Not: yeni oran, son bakımdan (pets.updated_at) bu yana geçen sürenin tamamına uygulanır.
--   Eski oranla geçen süreyi korumak için değiştirmeden hemen önce bir bakım yapın.
--
-- Kediyi başlangıç değerlerine döndürme:
--   update public.pets set hunger = 30, happiness = 70, energy = 70, cleanliness = 80,
--     resting_until = null, updated_at = now(), version = version + 1 where id = 1;
