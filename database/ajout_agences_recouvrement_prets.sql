-- Banque Van Horn — agences et recouvrement des prêts
-- Script additif : ne supprime aucun prêt existant.

alter table public.pret_loans
  add column if not exists agence text not null default 'van_horn',
  add column if not exists recouvrement_status text not null default 'aucun',
  add column if not exists recouvrement_notes text not null default '',
  add column if not exists recouvrement_started_at timestamptz;

update public.pret_loans set agence='van_horn' where agence is null or agence='';
update public.pret_loans set recouvrement_status='aucun' where recouvrement_status is null or recouvrement_status='';
update public.pret_loans set recouvrement_notes='' where recouvrement_notes is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='pret_loans_agence_check') then
    alter table public.pret_loans
      add constraint pret_loans_agence_check
      check (agence in ('van_horn','saint_denis'));
  end if;

  if not exists (select 1 from pg_constraint where conname='pret_loans_recouvrement_status_check') then
    alter table public.pret_loans
      add constraint pret_loans_recouvrement_status_check
      check (recouvrement_status in ('aucun','relance_simple','mise_en_demeure','recouvrement_actif','saisie_garantie','cloture'));
  end if;
end $$;

create index if not exists idx_pret_loans_agence on public.pret_loans(agence);
create index if not exists idx_pret_loans_recouvrement_status on public.pret_loans(recouvrement_status);

notify pgrst, 'reload schema';
