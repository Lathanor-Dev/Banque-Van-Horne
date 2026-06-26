-- Banque Van Horne v3 secure schema / migration
-- À exécuter dans Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists pret_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text,
  role text not null default 'employe' check (role in ('admin','directeur','co_directeur','employe')),
  is_active boolean not null default true,
  protected boolean not null default false,
  created_at timestamptz not null default now()
);

alter table pret_users add column if not exists password_hash text;
alter table pret_users add column if not exists is_active boolean not null default true;
alter table pret_users add column if not exists protected boolean not null default false;
alter table pret_users alter column role set default 'employe';

create table if not exists pret_clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prenom text not null,
  telegram text,
  adresse text,
  notes text,
  carte_identite_url text,
  created_at timestamptz not null default now()
);

alter table pret_clients add column if not exists telegram text;
alter table pret_clients add column if not exists adresse text;
alter table pret_clients add column if not exists notes text;
alter table pret_clients add column if not exists carte_identite_url text;

create table if not exists pret_loans (
  id uuid primary key default gen_random_uuid(),
  loan_id text unique,
  client_id uuid references pret_clients(id) on delete set null,
  nom text not null,
  prenom text not null,
  telegram text,
  somme numeric not null,
  taux numeric not null,
  total_a_rembourser numeric not null,
  garanties text,
  echeances jsonb not null default '[]'::jsonb,
  banquier_id uuid references pret_users(id) on delete set null,
  banquier_username text,
  date_creation date not null default current_date,
  created_at timestamptz not null default now()
);

alter table pret_loans add column if not exists client_id uuid references pret_clients(id) on delete set null;
alter table pret_loans add column if not exists telegram text;
alter table pret_loans add column if not exists garanties text;
alter table pret_loans add column if not exists echeances jsonb not null default '[]'::jsonb;
alter table pret_loans add column if not exists banquier_id uuid references pret_users(id) on delete set null;
alter table pret_loans add column if not exists banquier_username text;
alter table pret_loans add column if not exists date_creation date not null default current_date;

create table if not exists pret_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  username text,
  role text,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_pret_users_username on pret_users(username);
create index if not exists idx_pret_clients_nom on pret_clients(nom, prenom);
create index if not exists idx_pret_loans_created_at on pret_loans(created_at desc);
create index if not exists idx_pret_loans_banquier_id on pret_loans(banquier_id);
create index if not exists idx_pret_logs_created_at on pret_logs(created_at desc);
create index if not exists idx_pret_logs_action on pret_logs(action);

-- Sécurité côté base : les accès anonymes REST sont bloqués.
alter table pret_users enable row level security;
alter table pret_clients enable row level security;
alter table pret_loans enable row level security;
alter table pret_logs enable row level security;

drop policy if exists "deny anon pret_users" on pret_users;
drop policy if exists "deny anon pret_clients" on pret_clients;
drop policy if exists "deny anon pret_loans" on pret_loans;
drop policy if exists "deny anon pret_logs" on pret_logs;

create policy "deny anon pret_users" on pret_users for all using (false) with check (false);
create policy "deny anon pret_clients" on pret_clients for all using (false) with check (false);
create policy "deny anon pret_loans" on pret_loans for all using (false) with check (false);
create policy "deny anon pret_logs" on pret_logs for all using (false) with check (false);

-- Après avoir généré un hash bcrypt avec scripts/hash_password.js, crée l'admin ainsi :
-- insert into pret_users(username,password_hash,role,protected,is_active)
-- values ('ADMIN','COLLE_ICI_LE_HASH_BCRYPT','admin',true,true)
-- on conflict (username) do update set password_hash=excluded.password_hash, role='admin', protected=true, is_active=true;
