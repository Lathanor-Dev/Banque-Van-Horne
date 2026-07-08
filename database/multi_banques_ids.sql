-- =========================================================
-- Banque Van Horn — Multi-banques + IDs VH/SD + recouvrement
-- À lancer dans le projet Supabase Banque Van Horn uniquement.
-- Script additif : ne supprime aucun prêt existant.
-- =========================================================

create table if not exists public.pret_banks (
  code text primary key,
  nom text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.pret_banks (code, nom, is_active)
values
  ('VH','Van Horn',true),
  ('SD','Saint-Denis',true)
on conflict (code) do update set
  nom = excluded.nom,
  is_active = excluded.is_active;

alter table public.pret_loans
  add column if not exists bank_code text not null default 'VH';

-- Compatibilité avec l’ancien correctif qui utilisait "agence".
alter table public.pret_loans
  add column if not exists agence text not null default 'van_horn';

alter table public.pret_loans
  add column if not exists recouvrement_status text not null default 'aucun',
  add column if not exists recouvrement_notes text not null default '',
  add column if not exists recouvrement_started_at timestamptz;

update public.pret_loans
set bank_code =
  case
    when agence = 'saint_denis' then 'SD'
    when bank_code = 'SD' then 'SD'
    else 'VH'
  end;

update public.pret_loans
set agence =
  case
    when bank_code = 'SD' then 'saint_denis'
    else 'van_horn'
  end;

alter table public.pret_loans
  drop constraint if exists pret_loans_bank_code_check;

alter table public.pret_loans
  add constraint pret_loans_bank_code_check
  check (bank_code in ('VH','SD'));

alter table public.pret_loans
  drop constraint if exists pret_loans_agence_check;

alter table public.pret_loans
  add constraint pret_loans_agence_check
  check (agence in ('van_horn','saint_denis'));

alter table public.pret_loans
  drop constraint if exists pret_loans_recouvrement_status_check;

alter table public.pret_loans
  add constraint pret_loans_recouvrement_status_check
  check (recouvrement_status in ('aucun','relance_simple','mise_en_demeure','recouvrement_actif','saisie_garantie','cloture'));

create index if not exists idx_pret_loans_bank_code on public.pret_loans(bank_code);
create index if not exists idx_pret_loans_agence on public.pret_loans(agence);
create index if not exists idx_pret_loans_recouvrement_status on public.pret_loans(recouvrement_status);
create index if not exists idx_pret_loans_loan_id on public.pret_loans(loan_id);

-- Colonnes prévues pour extensions futures : clients, demandes et agenda par banque.
alter table public.pret_clients
  add column if not exists bank_code text not null default 'VH';

alter table public.pret_clients
  drop constraint if exists pret_clients_bank_code_check;

alter table public.pret_clients
  add constraint pret_clients_bank_code_check
  check (bank_code in ('VH','SD'));

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='pret_credit_applications'
  ) then
    alter table public.pret_credit_applications
      add column if not exists bank_code text not null default 'VH';
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='pret_agenda'
  ) then
    alter table public.pret_agenda
      add column if not exists bank_code text not null default 'VH';
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='pret_appointments'
  ) then
    alter table public.pret_appointments
      add column if not exists bank_code text not null default 'VH';
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='pret_horse_credits'
  ) then
    alter table public.pret_horse_credits
      add column if not exists bank_code text not null default 'VH';
  end if;
end $$;

notify pgrst, 'reload schema';
