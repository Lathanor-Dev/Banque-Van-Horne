-- À exécuter après les migrations 12.6.1. Rejouable, sans modification des lignes existantes.
begin;

insert into public.pret_banks (code, nom, is_active) values
  ('BW','Blackwater',true),
  ('ST','Strawberry',true),
  ('SS','Sunset',true)
on conflict (code) do nothing;

alter table public.pret_users drop constraint if exists pret_users_agency_check;
alter table public.pret_users add constraint pret_users_agency_check
  check (agency in ('van_horn','saint_denis','rhodes','valentine','blackwater','strawberry','sunset'));

alter table public.pret_loans drop constraint if exists pret_loans_agence_check;
alter table public.pret_loans add constraint pret_loans_agence_check
  check (agence in ('van_horn','saint_denis','rhodes','valentine','blackwater','strawberry','sunset'));
alter table public.pret_loans drop constraint if exists pret_loans_bank_code_check;
alter table public.pret_loans add constraint pret_loans_bank_code_check
  check (bank_code in ('VH','SD','RH','VT','BW','ST','SS'));

alter table public.pret_clients drop constraint if exists pret_clients_bank_code_check;
alter table public.pret_clients add constraint pret_clients_bank_code_check
  check (bank_code in ('VH','SD','RH','VT','BW','ST','SS'));

alter table public.pret_life_insurance_contracts
  drop constraint if exists pret_life_insurance_contracts_agency_check;
alter table public.pret_life_insurance_contracts
  add constraint pret_life_insurance_contracts_agency_check
  check (agency in ('van_horn','saint_denis','rhodes','valentine','blackwater','strawberry','sunset'));

commit;
