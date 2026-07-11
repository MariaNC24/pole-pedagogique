-- ============================================================================
-- Pôle Pédagogique — ajouts v6
-- Suivi des anomalies : apprenants qui ne reviennent pas en cours ou ne
-- répondent pas au téléphone. Journal des appels (date + NRP ou Répondu) et
-- des décisions prises. Réservé aux administrateurs — le pôle administratif
-- n'a pas accès à cet onglet.
-- À exécuter APRÈS 0001 à 0005 : SQL Editor > New query > coller > Run
-- ============================================================================

create table if not exists public.suivi_anomalies (
  id uuid primary key default gen_random_uuid(),
  apprenant_id uuid not null references public.apprenants (id) on delete cascade,
  date_appel date not null default current_date,
  statut_appel text not null default 'NRP' check (statut_appel in ('NRP', 'Répondu')),
  decision text,
  commentaire text,
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_suivi_anomalies_apprenant on public.suivi_anomalies (apprenant_id);

drop trigger if exists trg_suivi_anomalies_updated_at on public.suivi_anomalies;
create trigger trg_suivi_anomalies_updated_at
  before update on public.suivi_anomalies
  for each row execute procedure public.set_updated_at();

alter table public.suivi_anomalies enable row level security;

-- Lecture : toute l'équipe connectée (comme les autres onglets).
drop policy if exists suivi_anomalies_select on public.suivi_anomalies;
create policy suivi_anomalies_select on public.suivi_anomalies
  for select to authenticated using (true);

-- Écriture : administrateurs uniquement (ni éditeur, ni pôle administratif).
drop policy if exists suivi_anomalies_write on public.suivi_anomalies;
create policy suivi_anomalies_write on public.suivi_anomalies
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter publication supabase_realtime add table public.suivi_anomalies;

drop trigger if exists trg_audit_suivi_anomalies on public.suivi_anomalies;
create trigger trg_audit_suivi_anomalies
  after insert or update or delete on public.suivi_anomalies
  for each row execute procedure public.log_audit();
