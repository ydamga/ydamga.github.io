-- Güncelleme: kedi daha sık bakım ister ve uyurken uyandırılabilir.
-- schema.sql'i (isimle bakım sürümü) daha önce çalıştırdıysanız bunu bir kez SQL Editor'de çalıştırın.
-- schema.sql'i henüz çalıştırmadıysanız gerekmez: schema.sql bu değişiklikleri zaten içerir
-- (yine de çalıştırırsanız zararı yoktur).
--
-- Kedinin şimdiki değerleri korunur; yeni oranlar bu andan itibaren işler.

begin;

-- 1) Kedinin şimdiki değerlerini eski oranlarla bu ana sabitle, sonra oranları değiştir.
--    (Yeni oran yalnızca bundan sonrasına uygulanır; geçmiş süre eski oranla kalır.)
update public.pets p set
  hunger = c.hunger, happiness = c.happiness, energy = c.energy, cleanliness = c.cleanliness,
  resting_until = case when c.resting then p.resting_until else null end,
  updated_at = now(), version = p.version + 1
from public.game_rules r, lateral private.pet_current(p, r, now()) c
where p.id = 1 and r.id = 1;

update public.game_rules set
  hunger_rise_per_hour = 8,
  happiness_drop_per_hour = 5,
  cleanliness_drop_per_hour = 3,
  energy_drop_per_hour = 4,
  energy_rest_per_hour = 15,
  updated_at = now()
where id = 1;

alter table public.game_rules alter column hunger_rise_per_hour set default 8;
alter table public.game_rules alter column happiness_drop_per_hour set default 5;
alter table public.game_rules alter column cleanliness_drop_per_hour set default 3;
alter table public.game_rules alter column energy_drop_per_hour set default 4;
alter table public.game_rules alter column energy_rest_per_hour set default 15;

-- 2) Geçmiş tablosu uyandırma eylemini ve "zaten uyanık" reddini kabul etsin
alter table public.pet_actions drop constraint if exists pet_actions_action_check;
alter table public.pet_actions add constraint pet_actions_action_check
  check (action in ('feed', 'play', 'rest', 'wake', 'clean'));
alter table public.pet_actions drop constraint if exists pet_actions_reason_check;
alter table public.pet_actions add constraint pet_actions_reason_check
  check (reason in ('already_full', 'sleeping', 'too_tired', 'already_happy', 'already_resting', 'not_tired', 'not_sleeping', 'already_clean'));

-- 3) Bakım fonksiyonu (schema.sql'deki ile aynı)
create or replace function public.perform_pet_action(p_action text, p_member_id bigint) returns jsonb
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
  if p_action is null or p_action not in ('feed', 'play', 'rest', 'wake', 'clean') then
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
  elsif p_action = 'wake' then
    -- Uyandırma: o ana kadar kazanılan enerji kalır, uyku biter
    if not c.resting then v_reason := 'not_sleeping';
    else v_until := null; end if;
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

commit;
