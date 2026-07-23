-- Correctif Banque de Rhodes + compatibilité Pandore Studio
-- À lancer dans Supabase, dans le projet Banque Van Horn / Banque de Reckless RP.
-- Ce script est additif : il ne supprime aucun prêt.

alter table public.pret_loans
  add column if not exists agence text default 'van_horn';

alter table public.pret_loans
  add column if not exists bank_code text default 'VH';

-- Normalise les anciens prêts qui n'auraient pas encore de banque.
update public.pret_loans
set agence = case
  when bank_code = 'SD' then 'saint_denis'
  when bank_code = 'RH' then 'rhodes'
  else coalesce(nullif(agence,''),'van_horn')
end,
bank_code = case
  when agence = 'saint_denis' then 'SD'
  when agence = 'rhodes' then 'RH'
  else coalesce(nullif(bank_code,''),'VH')
end
where agence is null
   or agence = ''
   or bank_code is null
   or bank_code = '';

-- Aucune contrainte CHECK n'est ajoutée ici afin d'éviter de casser une contrainte existante
-- déjà présente dans ton projet. Le filtrage des valeurs se fait côté API.
