-- Mise à jour V7 : grades d'agence + statut Jamais remboursé

alter table pret_users add column if not exists agency text not null default 'van_horn';
alter table pret_users add column if not exists agency_grade text not null default 'conseiller_bancaire';

alter table pret_users drop constraint if exists pret_users_agency_check;
alter table pret_users add constraint pret_users_agency_check
  check (agency in ('van_horn','saint_denis','rhodes'));

alter table pret_users drop constraint if exists pret_users_agency_grade_check;
alter table pret_users add constraint pret_users_agency_grade_check
  check (agency_grade in (
    'directeur_agence','directeur_adjoint','responsable_clientele',
    'conseiller_bancaire','caissier','secretaire_direction',
    'stagiaire','attente_affectation'
  ));

alter table pret_loans add column if not exists repayment_status text not null default 'normal';
alter table pret_loans drop constraint if exists pret_loans_repayment_status_check;
alter table pret_loans add constraint pret_loans_repayment_status_check
  check (repayment_status in ('normal','jamais_rembourse'));

create index if not exists idx_pret_users_agency on pret_users(agency);
create index if not exists idx_pret_users_agency_grade on pret_users(agency_grade);
create index if not exists idx_pret_loans_repayment_status on pret_loans(repayment_status);
