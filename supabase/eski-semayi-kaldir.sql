-- Eski (e-postayla girişli) kedi şemasını kaldırır. Yalnızca o şema kuruluysa, schema.sql'den ÖNCE bir kez çalıştırın.
-- Kedinin değerleri, bakım geçmişi ve profiller silinir; kedi schema.sql ile başlangıç değerleriyle yeniden oluşur.
-- Supabase Authentication'daki kullanıcılar silinmez (artık kullanılmazlar; isterseniz panelden silin).

begin;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.perform_pet_action(text);
drop function if exists public.perform_pet_action(text, bigint);
drop function if exists public.add_team_member(text);
drop function if exists public.get_pet_state();
drop table if exists public.pet_actions, public.team_members, public.profiles, public.pets, public.game_rules cascade;
drop schema if exists private cascade;

commit;
