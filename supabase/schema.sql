-- Ekip kedisi: Supabase şeması (isimle bakım, girişsiz)
-- Supabase panelinde SQL Editor'e yapıştırıp bir kez çalıştırın.
--  * Yeni, boş projede: doğrudan bu dosya.
--  * Eski (e-postayla girişli) şema kuruluysa: önce supabase/eski-semayi-kaldir.sql, sonra bu dosya.
-- Sonra supabase/test-rls.sql ile sınayın.
--
-- Model
--  * Giriş/kayıt yok. Ekip listesi public.team_members'ta isimlerden oluşur; sayfayı açan kişi adını seçer
--    ya da yeni ad ekler (public.add_team_member). Seçilen ad tarayıcıda hatırlanır.
--  * Her bakım bir isimle kaydedilir; geçmişi herkes görür. Kedi, bir süredir uğramayanları "özler"
--    (hesap tarayıcıda: get_pet_state'in döndürdüğü team[].last_action_at'ten).
--  * Kimlik doğrulaması olmadığı için sayfayı açan herkes listedeki herhangi bir adı seçebilir. Bu, sitenin
--    yalnızca ekipçe kullanıldığı varsayımıyla bilinçli bir tercihtir.
--
-- Güvenlik
--  * Tek kedi: pets.id yalnızca 1 olabilir; satır şemayla birlikte oluşur, istemci ekleyemez/silemez.
--  * İstemci hiçbir tabloya doğrudan yazamaz. Bakım yalnızca public.perform_pet_action(eylem, üye_id) ile yapılır:
--    tarayıcı değer göndermez. Fonksiyon kedi satırını kilitleyip (FOR UPDATE) sunucu saatine göre hesaplar ve
--    tek işlemde günceller; aynı anda gelen iki bakım sırayla uygulanır, biri ötekini ezmez.
--  * Kötüye kullanım sınırları: kişi başına game_rules.cooldown_seconds saniyede bir ve saatte
--    max_actions_per_hour bakım; herkes toplamında dakikada max_actions_per_minute_total bakım.
--    Ekip listesi en çok 40 isim; saatte en çok 10 yeni isim eklenebilir.
--
-- Hesap kedi/kurallar.js ile aynıdır; birini değiştirirseniz ötekini de değiştirin.

begin;

create schema if not exists private;
revoke all on schema private from public;

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
  max_actions_per_minute_total integer not null default 30 check (max_actions_per_minute_total between 1 and 10000),
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
-- Ekip: kediye bakan kişilerin adları. Büyük/küçük harf farkı olmadan tekil.
-- ---------------------------------------------------------------------------
create table public.team_members (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 30 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);
create unique index team_members_name_idx on public.team_members (lower(name));

-- ---------------------------------------------------------------------------
-- Bakım geçmişi. actor_name, eylem anında ekip listesinden sunucu tarafından kopyalanır;
-- kişi listeden silinse de geçmişte adı kalır.
-- ---------------------------------------------------------------------------
create table public.pet_actions (
  id bigint generated always as identity primary key,
  pet_id smallint not null default 1 references public.pets (id),
  member_id bigint references public.team_members (id) on delete set null,
  actor_name text not null check (char_length(actor_name) between 1 and 60),
  action text not null check (action in ('feed', 'play', 'rest', 'clean')),
  result text not null check (result in ('applied', 'declined')),
  reason text check (reason in ('already_full', 'sleeping', 'too_tired', 'already_happy', 'already_resting', 'not_tired', 'already_clean')),
  created_at timestamptz not null default now(),
  check ((result = 'applied') = (reason is null))
);
create index pet_actions_created_at_idx on public.pet_actions (created_at desc);
create index pet_actions_member_created_idx on public.pet_actions (member_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Yardımcılar (private şema API'de görünmez)
-- ---------------------------------------------------------------------------

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

-- Ekip listesi ve her kişinin son uğradığı an (kabul edilen ya da reddedilen son bakım denemesi)
create function private.team_json() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'name', m.name, 'created_at', m.created_at,
           'last_action_at', (select max(a.created_at) from public.pet_actions a where a.member_id = m.id)
         ) order by lower(m.name)), '[]'::jsonb)
  from public.team_members m
$$;
revoke all on function private.team_json() from public;

-- ---------------------------------------------------------------------------
-- İstemcinin çağırdığı fonksiyonlar
-- ---------------------------------------------------------------------------

-- Kedinin anlık görüntüsü, kurallar, ekip ve sunucu saati. Hesabı istemci yapar (her saniye istek gerekmez).
create function public.get_pet_state() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'pet', (select to_jsonb(p) from public.pets p where p.id = 1),
    'rules', (select to_jsonb(r) - 'id' - 'updated_at' from public.game_rules r where r.id = 1),
    'team', private.team_json(),
    'server_now', now()
  )
$$;
revoke all on function public.get_pet_state() from public;
grant execute on function public.get_pet_state() to anon, authenticated;

-- Ekibe isim ekleme. Aynı ad (büyük/küçük harf farkı olmadan) zaten varsa yeni satır açmaz, var olanı döndürür.
create function public.add_team_member(p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_m public.team_members;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 30 or v_name ~ '[[:cntrl:]]' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  -- Eşzamanlı eklemeler sırayla: sınır denetimleri yarışmasın
  lock table public.team_members in share row exclusive mode;

  select * into v_m from public.team_members where lower(name) = lower(v_name);
  if found then
    return jsonb_build_object('id', v_m.id, 'name', v_m.name, 'created_at', v_m.created_at, 'existed', true);
  end if;
  if (select count(*) from public.team_members) >= 40 then
    raise exception 'team_full' using errcode = 'P0001';
  end if;
  if (select count(*) from public.team_members where created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.team_members (name) values (v_name) returning * into v_m;
  return jsonb_build_object('id', v_m.id, 'name', v_m.name, 'created_at', v_m.created_at, 'existed', false);
end $$;
revoke all on function public.add_team_member(text) from public;
grant execute on function public.add_team_member(text) to anon, authenticated;

-- Bakım eylemi. Tek giriş noktası; değerleri tarayıcıdan almaz, yalnızca eylemin adını ve bakan kişiyi alır.
create function public.perform_pet_action(p_action text, p_member_id bigint) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_member public.team_members;
  v_rules public.game_rules;
  v_pet public.pets;
  v_now timestamptz;
  c record;
  v_reason text := null;
  v_hunger numeric; v_happiness numeric; v_energy numeric; v_clean numeric;
  v_until timestamptz;
  v_hours numeric;
begin
  if p_action is null or p_action not in ('feed', 'play', 'rest', 'clean') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  select * into v_member from public.team_members where id = p_member_id;
  if not found then
    raise exception 'unknown_member' using errcode = '22023';
  end if;

  select * into v_rules from public.game_rules where id = 1;

  -- Kedi satırını kilitle: eşzamanlı bakımlar burada sıraya girer. Sıklık denetimi de kilidin
  -- arkasında olduğundan paralel isteklerle sınır aşılamaz.
  select * into v_pet from public.pets where id = 1 for update;

  -- Kilidi bekledikten sonraki gerçek saat; updated_at geriye gitmesin
  v_now := greatest(clock_timestamp(), v_pet.updated_at);

  if (select count(*) from public.pet_actions a
      where a.created_at > v_now - interval '1 minute') >= v_rules.max_actions_per_minute_total then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.pet_actions a
    where a.member_id = v_member.id and a.created_at > v_now - make_interval(secs => v_rules.cooldown_seconds)
  ) then
    raise exception 'cooldown' using errcode = 'P0001';
  end if;
  if (select count(*) from public.pet_actions a
      where a.member_id = v_member.id and a.created_at > v_now - interval '1 hour') >= v_rules.max_actions_per_hour then
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

  insert into public.pet_actions (member_id, actor_name, action, result, reason, created_at)
  values (v_member.id, v_member.name, p_action,
          case when v_reason is null then 'applied' else 'declined' end, v_reason, v_now);

  return jsonb_build_object(
    'result', case when v_reason is null then 'applied' else 'declined' end,
    'reason', v_reason,
    'pet', to_jsonb(v_pet),
    'server_now', v_now
  );
end $$;
revoke all on function public.perform_pet_action(text, bigint) from public;
grant execute on function public.perform_pet_action(text, bigint) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Yetkiler ve Row Level Security
-- Supabase yeni tablolarda anon/authenticated'a geniş yetki verebilir; hepsi geri alınıp
-- yalnızca okuma verilir. Yazma yetkisi hiçbir istemci rolünde yoktur (yazma yalnızca fonksiyonlarla).
-- ---------------------------------------------------------------------------
revoke all on table public.game_rules, public.pets, public.team_members, public.pet_actions from anon, authenticated;
grant select on table public.game_rules, public.pets, public.team_members, public.pet_actions to anon, authenticated;

alter table public.game_rules enable row level security;
alter table public.pets enable row level security;
alter table public.team_members enable row level security;
alter table public.pet_actions enable row level security;

create policy "Kurallari herkes okur" on public.game_rules for select to anon, authenticated using (true);
create policy "Kediyi herkes gorur" on public.pets for select to anon, authenticated using (true);
create policy "Ekibi herkes gorur" on public.team_members for select to anon, authenticated using (true);
create policy "Gecmisi herkes gorur" on public.pet_actions for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Realtime: kedinin durumu, yeni bakımlar ve yeni isimler açık sayfalara iletilir
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.pets, public.pet_actions, public.team_members;

commit;

-- ===========================================================================
-- Yönetici işlemleri (SQL Editor'de, gerektiğinde tek tek çalıştırın)
-- ===========================================================================
-- İsmi düzeltme (geçmişteki eski kayıtlar eski adla kalır):
--   update public.team_members set name = 'Ayşe Y.' where name = 'ayse';
--
-- Listeden çıkarma (geçmişteki kayıtları adıyla kalır):
--   delete from public.team_members where name = 'Ayşe Y.';
--
-- Oyun ayarlarını değiştirme (kedi/ayar.js'i de aynı değerlerle güncelleyin):
--   update public.game_rules set hunger_rise_per_hour = 3, updated_at = now() where id = 1;
--   Not: yeni oran, son bakımdan (pets.updated_at) bu yana geçen sürenin tamamına uygulanır.
--   Eski oranla geçen süreyi korumak için değiştirmeden hemen önce bir bakım yapın.
--
-- Kediyi başlangıç değerlerine döndürme:
--   update public.pets set hunger = 30, happiness = 70, energy = 70, cleanliness = 80,
--     resting_until = null, updated_at = now(), version = version + 1 where id = 1;
