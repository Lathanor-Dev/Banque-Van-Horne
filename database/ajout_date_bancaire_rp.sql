-- Banque Van Horn : date bancaire RP partagée
-- À exécuter UNE seule fois dans Supabase > SQL Editor.

create table if not exists public.pret_bank_settings (
  setting_key text primary key,
  setting_value text not null,
  updated_by_username text,
  updated_at timestamptz not null default now(),
  constraint pret_bank_settings_date_format
    check (
      setting_key <> 'bank_date'
      or setting_value ~ '^\\d{4}-\\d{2}-\\d{2}$'
    )
);

-- Date de départ. Elle n'écrase pas la date déjà définie si elle existe.
insert into public.pret_bank_settings (setting_key, setting_value)
values ('bank_date', '1904-06-26')
on conflict (setting_key) do nothing;

-- La table reste privée : seules les API Vercel avec la service key y accèdent.
alter table public.pret_bank_settings enable row level security;

drop policy if exists "deny anon pret_bank_settings" on public.pret_bank_settings;
create policy "deny anon pret_bank_settings"
on public.pret_bank_settings
for all
using (false)
with check (false);

notify pgrst, 'reload schema';
