-- Correctif préparé pour les cinq alertes du rapport Supabase fourni.
-- À appliquer séparément de v12_7_trois_agences.sql, après contrôle en recette.
-- Le site utilise le rôle de service côté serveur ; il n'utilise pas anon/authenticated
-- pour interroger directement ces trois tables ni la fonction ci-dessous.
begin;

alter table public.pret_clients enable row level security;
alter table public.pret_loans enable row level security;
alter table public.pret_users enable row level security;

drop policy if exists acces_total on public.pret_clients;
drop policy if exists acces_total on public.pret_loans;
drop policy if exists acces_total on public.pret_users;

revoke all privileges on table public.pret_clients from public, anon, authenticated;
revoke all privileges on table public.pret_loans from public, anon, authenticated;
revoke all privileges on table public.pret_users from public, anon, authenticated;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

commit;

-- Contrôle des politiques : aucune ligne attendue.
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('pret_clients','pret_loans','pret_users')
  and policyname = 'acces_total';

-- Contrôle de la fonction : deux lignes avec can_execute = false attendues.
select role_name, has_function_privilege(role_name, 'public.rls_auto_enable()', 'EXECUTE') as can_execute
from (values ('anon'),('authenticated')) as roles(role_name);

-- Contrôle des tables : six lignes avec can_access = false attendues.
select role_name, table_name,
  has_table_privilege(role_name, 'public.' || table_name, 'SELECT,INSERT,UPDATE,DELETE') as can_access
from (values ('anon'),('authenticated')) as roles(role_name)
cross join (values ('pret_clients'),('pret_loans'),('pret_users')) as tables(table_name);
