-- V9 consolidée : Discord OAuth2, rôles et agenda sans client
alter table pret_users add column if not exists discord_id text;
alter table pret_users add column if not exists discord_username text;
alter table pret_users add column if not exists discord_display_name text;
alter table pret_users add column if not exists discord_roles jsonb not null default '[]'::jsonb;
alter table pret_users add column if not exists discord_last_sync timestamptz;
create unique index if not exists uq_pret_users_discord_id on pret_users(discord_id) where discord_id is not null;
create index if not exists idx_pret_users_discord_id on pret_users(discord_id);
alter table pret_agenda_events alter column client_id drop not null;
