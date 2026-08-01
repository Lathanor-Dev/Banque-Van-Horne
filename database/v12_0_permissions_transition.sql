-- Registre bancaire de Reckless — V12.0
-- Sécurisation de la transition vers role_code.
-- Ce script est idempotent et ne remplace pas les rôles déjà attribués.

begin;

alter table public.pret_users
  alter column role_code set default 'PENDING_ASSIGNMENT';

update public.pret_users
set role_code = case role
  when 'admin' then 'TECHNICIAN'
  when 'directeur' then 'DIRECTOR'
  when 'co_directeur' then 'DEPUTY_DIRECTOR'
  when 'employe' then 'BANKER'
  else 'PENDING_ASSIGNMENT'
end
where role_code is null or btrim(role_code) = '';

create index if not exists pret_users_role_code_idx
  on public.pret_users(role_code);

create index if not exists pret_users_discord_id_idx
  on public.pret_users(discord_id)
  where discord_id is not null;

commit;

-- Contrôle recommandé :
select username, role, role_code, discord_id
from public.pret_users
order by username;
