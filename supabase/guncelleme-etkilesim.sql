-- Güncelleme: etkileşim (oyuncaklar, lazer oyunu, ödül maması, haftalık hedef, görünüş oyları).
-- Kurulu isimli şemaya (schema.sql + guncelleme-uyandir.sql) bir kez SQL Editor'de çalıştırın.
-- schema.sql'i bu sürümle yeni kurduysanız gerekmez.
-- Sıra: önce guncelleme-uyandir.sql (çalıştırmadıysanız), sonra bu dosya, sonra test-rls.sql.

begin;

-- 1) Yeni ayarlar
alter table public.game_rules
  add column if not exists treat_hunger numeric not null default 10 check (treat_hunger between 0 and 100),
  add column if not exists treat_happiness numeric not null default 20 check (treat_happiness between 0 and 100),
  add column if not exists favorite_toy_bonus numeric not null default 10 check (favorite_toy_bonus between 0 and 100),
  add column if not exists max_game_bonus integer not null default 10 check (max_game_bonus between 0 and 100),
  add column if not exists weekly_goal integer not null default 60 check (weekly_goal between 1 and 10000);

-- 2) Geçmiş: ödül maması, oyuncak ve oyun puanı
alter table public.pet_actions
  add column if not exists toy text check (toy in ('top', 'ip', 'lazer')),
  add column if not exists bonus smallint not null default 0 check (bonus between 0 and 100);
alter table public.pet_actions drop constraint if exists pet_actions_action_check;
alter table public.pet_actions add constraint pet_actions_action_check
  check (action in ('feed', 'play', 'rest', 'wake', 'clean', 'treat'));
alter table public.pet_actions drop constraint if exists pet_actions_reason_check;
alter table public.pet_actions add constraint pet_actions_reason_check
  check (reason in ('already_full', 'sleeping', 'too_tired', 'already_happy', 'already_resting', 'not_tired', 'not_sleeping', 'already_clean', 'treat_used'));

-- 3) Görünüş oyları
-- ---------------------------------------------------------------------------
-- Görünüş oyları: her kişinin tasma ve tüy rengi için birer oyu. En çok oy alan görünür.
-- ---------------------------------------------------------------------------
create table if not exists public.cosmetic_votes (
  member_id bigint not null references public.team_members (id) on delete cascade,
  kind text not null check (kind in ('collar', 'coat')),
  value text not null check (
    (kind = 'collar' and value in ('yok', 'kirmizi', 'mavi', 'yesil', 'mor', 'sari')) or
    (kind = 'coat' and value in ('turuncu', 'gri', 'siyah', 'krem'))
  ),
  updated_at timestamptz not null default now(),
  primary key (member_id, kind)
);

revoke all on table public.cosmetic_votes from anon, authenticated;
grant select on table public.cosmetic_votes to anon, authenticated;
alter table public.cosmetic_votes enable row level security;
drop policy if exists "Oylari herkes gorur" on public.cosmetic_votes;
create policy "Oylari herkes gorur" on public.cosmetic_votes for select to anon, authenticated using (true);
do $$
begin
  alter publication supabase_realtime add table public.cosmetic_votes;
exception when duplicate_object then null;
end $$;

-- 4) Yardımcılar
drop function if exists private.favorite_toy(timestamptz);
drop function if exists private.week_json();
drop function if exists private.cosmetics_json();

-- Haftanın gözde oyuncağı: ISO haftasına göre döner (kedi/kurallar.js → favoriOyuncak ile aynı)
create function private.favorite_toy(at timestamptz) returns text
language sql stable set search_path = '' as $$
  select (array['top', 'ip', 'lazer'])[(extract(week from (at at time zone 'Europe/Istanbul'))::int % 3) + 1]
$$;
revoke all on function private.favorite_toy(timestamptz) from public;

-- Bu haftanın bakım sayısı, hedef ve hedefi tutturulan hafta sayısı (Türkiye saatiyle pazartesiden pazartesiye)
create function private.week_json() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'count', (select count(*) from public.pet_actions a
              where a.result = 'applied'
                and a.created_at >= (date_trunc('week', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')),
    'goal', r.weekly_goal,
    'completed', (select count(*) from (
                    select 1 from public.pet_actions a where a.result = 'applied'
                    group by date_trunc('week', a.created_at at time zone 'Europe/Istanbul')
                    having count(*) >= r.weekly_goal) x)
  )
  from public.game_rules r where r.id = 1
$$;
revoke all on function private.week_json() from public;

-- Görünüş: kazanan tasma ve tüy rengi (eşitlikte en son oy verilen) ve bütün oylar
create function private.cosmetics_json() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'collar', coalesce((select v.value from public.cosmetic_votes v where v.kind = 'collar'
                        group by v.value order by count(*) desc, max(v.updated_at) desc limit 1), 'yok'),
    'coat', coalesce((select v.value from public.cosmetic_votes v where v.kind = 'coat'
                      group by v.value order by count(*) desc, max(v.updated_at) desc limit 1), 'turuncu'),
    'votes', coalesce((select jsonb_agg(jsonb_build_object('member_id', v.member_id, 'kind', v.kind, 'value', v.value))
                       from public.cosmetic_votes v), '[]'::jsonb)
  )
$$;
revoke all on function private.cosmetics_json() from public;

-- 5) İstemci fonksiyonları
-- Kedinin anlık görüntüsü, kurallar, ekip, haftalık hedef, görünüş ve sunucu saati. Hesabı istemci yapar (her saniye istek gerekmez).
create or replace function public.get_pet_state() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'pet', (select to_jsonb(p) from public.pets p where p.id = 1),
    'rules', (select to_jsonb(r) - 'id' - 'updated_at' from public.game_rules r where r.id = 1),
    'team', private.team_json(),
    'week', private.week_json(),
    'cosmetics', private.cosmetics_json(),
    'server_now', now()
  )
$$;
revoke all on function public.get_pet_state() from public;
grant execute on function public.get_pet_state() to anon, authenticated;

drop function if exists public.perform_pet_action(text, bigint);
drop function if exists public.perform_pet_action(text, bigint, text, integer);
-- Bakım eylemi. Tek giriş noktası; değerleri tarayıcıdan almaz. Eylemin adını, bakan kişiyi ve oyunda
-- oyuncağı (top/ip/lazer) alır. Lazer oyununun yakalama sayısı (p_bonus) mutluluğa en çok max_game_bonus ekler.
create function public.perform_pet_action(p_action text, p_member_id bigint, p_toy text default null, p_bonus integer default 0) returns jsonb
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
  v_toy text := null;
  v_bonus integer := 0;
  v_favorite boolean := false;
begin
  if p_action is null or p_action not in ('feed', 'play', 'rest', 'wake', 'clean', 'treat') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  if p_action = 'play' then
    v_toy := coalesce(p_toy, 'top');
    if v_toy not in ('top', 'ip', 'lazer') then
      raise exception 'invalid_action' using errcode = '22023';
    end if;
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

  if p_action = 'play' then
    v_favorite := v_toy = private.favorite_toy(v_now);
    if v_toy = 'lazer' then v_bonus := least(greatest(coalesce(p_bonus, 0), 0), v_rules.max_game_bonus); end if;
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
      v_happiness := least(100, v_happiness + v_rules.play_amount
                                + case when v_favorite then v_rules.favorite_toy_bonus else 0 end + v_bonus);
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
  elsif p_action = 'wake' then
    -- Uyandırma: o ana kadar kazanılan enerji kalır, uyku biter
    if not c.resting then v_reason := 'not_sleeping';
    else v_until := null; end if;
  elsif p_action = 'clean' then
    if v_clean >= v_rules.full_cleanliness then v_reason := 'already_clean';
    else v_clean := least(100, v_clean + v_rules.clean_amount); end if;
  elsif p_action = 'treat' then
    -- Ödül maması: kişi başı günde bir (Türkiye saatiyle)
    if exists (
      select 1 from public.pet_actions a
      where a.member_id = v_member.id and a.action = 'treat' and a.result = 'applied'
        and (a.created_at at time zone 'Europe/Istanbul')::date = (v_now at time zone 'Europe/Istanbul')::date
    ) then
      v_reason := 'treat_used';
    else
      v_hunger := greatest(0, v_hunger - v_rules.treat_hunger);
      v_happiness := least(100, v_happiness + v_rules.treat_happiness);
    end if;
  end if;

  if v_reason is null then
    update public.pets set
      hunger = v_hunger, happiness = v_happiness, energy = v_energy, cleanliness = v_clean,
      resting_until = v_until, updated_at = v_now, last_cared_at = v_now, version = version + 1
    where id = 1
    returning * into v_pet;
  end if;

  insert into public.pet_actions (member_id, actor_name, action, toy, bonus, result, reason, created_at)
  values (v_member.id, v_member.name, p_action, v_toy, v_bonus,
          case when v_reason is null then 'applied' else 'declined' end, v_reason, v_now);

  return jsonb_build_object(
    'result', case when v_reason is null then 'applied' else 'declined' end,
    'reason', v_reason,
    'toy', v_toy,
    'favorite', v_favorite and v_reason is null,
    'pet', to_jsonb(v_pet),
    'server_now', v_now
  );
end $$;
revoke all on function public.perform_pet_action(text, bigint, text, integer) from public;
grant execute on function public.perform_pet_action(text, bigint, text, integer) to anon, authenticated;

drop function if exists public.vote_cosmetic(bigint, text, text);
-- Görünüş oyu: kişi tasma ya da tüy rengi için oyunu verir (değiştirir). Güncel görünüşü döndürür.
create function public.vote_cosmetic(p_member_id bigint, p_kind text, p_value text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.team_members m where m.id = p_member_id) then
    raise exception 'unknown_member' using errcode = '22023';
  end if;
  if not ((p_kind = 'collar' and p_value in ('yok', 'kirmizi', 'mavi', 'yesil', 'mor', 'sari')) or
          (p_kind = 'coat' and p_value in ('turuncu', 'gri', 'siyah', 'krem'))) then
    raise exception 'invalid_vote' using errcode = '22023';
  end if;
  insert into public.cosmetic_votes (member_id, kind, value) values (p_member_id, p_kind, p_value)
  on conflict (member_id, kind) do update set value = excluded.value, updated_at = now();
  return private.cosmetics_json();
end $$;
revoke all on function public.vote_cosmetic(bigint, text, text) from public;
grant execute on function public.vote_cosmetic(bigint, text, text) to anon, authenticated;

commit;
