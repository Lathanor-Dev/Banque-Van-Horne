-- V12.6.1 - Gestion et archivage des contrats assurance-vie
alter table public.pret_life_insurance_contracts
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists updated_by_username text;

alter table public.pret_life_insurance_contracts
  drop constraint if exists pret_life_insurance_contracts_status_check;
alter table public.pret_life_insurance_contracts
  add constraint pret_life_insurance_contracts_status_check check (status in (
    'active','payments_complete','placed','closure_requested','closed',
    'death_reported','under_review','paid_to_beneficiary','cancelled'
  ));

create index if not exists pret_life_insurance_contracts_next_payment_idx
  on public.pret_life_insurance_contracts using gin (payments);
