-- V12.3 — Ajout complet de la Banque de Valentine
-- Migration additive. Elle ne modifie aucune donnée existante.

begin;

-- Utilisateurs / employés
alter table if exists public.pret_users
  drop constraint if exists pret_users_agency_check;
alter table if exists public.pret_users
  add constraint pret_users_agency_check
  check (agency in ('van_horn','saint_denis','rhodes','valentine'));

-- Prêts
alter table if exists public.pret_loans
  add column if not exists agence text not null default 'van_horn';
alter table if exists public.pret_loans
  add column if not exists bank_code text not null default 'VH';
alter table if exists public.pret_loans
  drop constraint if exists pret_loans_agence_check;
alter table if exists public.pret_loans
  drop constraint if exists pret_loans_bank_code_check;
alter table if exists public.pret_loans
  add constraint pret_loans_agence_check
  check (agence in ('van_horn','saint_denis','rhodes','valentine'));
alter table if exists public.pret_loans
  add constraint pret_loans_bank_code_check
  check (bank_code in ('VH','SD','RH','VT'));

-- Clients : certaines installations possèdent bank_code, d'autres non.
do $$
begin
  if to_regclass('public.pret_clients') is not null then
    alter table public.pret_clients add column if not exists bank_code text not null default 'VH';
    alter table public.pret_clients drop constraint if exists pret_clients_bank_code_check;
    alter table public.pret_clients add constraint pret_clients_bank_code_check
      check (bank_code in ('VH','SD','RH','VT'));
  end if;
end $$;

create index if not exists idx_pret_users_agency on public.pret_users(agency);
create index if not exists idx_pret_loans_agence on public.pret_loans(agence);
create index if not exists idx_pret_loans_bank_code on public.pret_loans(bank_code);

commit;

-- Vérification
select 'pret_users' as source, agency as agence, count(*) as total
from public.pret_users group by agency
union all
select 'pret_loans', agence, count(*)
from public.pret_loans group by agence
order by source, agence;
