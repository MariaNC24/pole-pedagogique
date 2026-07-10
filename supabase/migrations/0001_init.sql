-- ============================================================================
-- Pôle Pédagogique — schéma de base de données
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > coller > Run
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. PROFILS (miroir de auth.users + rôle applicatif)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nom text,
  prenom text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- Fonction utilitaire (security definer = évite les boucles RLS quand une
-- policy a besoin de connaître le rôle de l'utilisateur courant)
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.get_my_role() = 'admin', false);
$$;

create or replace function public.is_editor_or_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.get_my_role() in ('admin', 'editor'), false);
$$;

-- ----------------------------------------------------------------------------
-- 2. INVITATIONS (traçabilité des invitations envoyées par un admin)
-- ----------------------------------------------------------------------------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nom text,
  prenom text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  invited_by uuid references public.profiles (id),
  invited_at timestamptz not null default now(),
  accepted boolean not null default false,
  accepted_at timestamptz
);

-- ----------------------------------------------------------------------------
-- 3. Création automatique du profil à la validation d'un compte (email confirmé)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nom, prenom, role, actif)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'nom',
    new.raw_user_meta_data ->> 'prenom',
    coalesce(new.raw_user_meta_data ->> 'role', 'viewer'),
    true
  )
  on conflict (id) do nothing;

  update public.invitations
  set accepted = true, accepted_at = now()
  where email = new.email and accepted = false;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. APPRENANTS
-- ----------------------------------------------------------------------------
create table if not exists public.apprenants (
  id uuid primary key default gen_random_uuid(),
  nom_complet text not null,
  groupe text,
  certification_visee text,
  date_entree date,
  date_sortie date,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

-- ----------------------------------------------------------------------------
-- 5. ÉVALUATIONS (suivi pédagogique — reprend les colonnes du fichier existant)
-- ----------------------------------------------------------------------------
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  apprenant_id uuid not null references public.apprenants (id) on delete cascade,
  date_prevue date,
  date_realisee date,
  certification_visee text,
  type_evaluation text,
  competence_evaluee text,
  resultat_score text,
  niveau_cecrl text,
  objectif_atteint text check (objectif_atteint in ('Oui', 'Non', 'Partiel') or objectif_atteint is null),
  action_pedagogique text,
  statut text not null default 'À faire' check (statut in ('À faire', 'En cours', 'Fait', 'Reporté')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create index if not exists idx_evaluations_apprenant on public.evaluations (apprenant_id);

-- ----------------------------------------------------------------------------
-- 6. PRÉSENCES (feuille de présence)
-- ----------------------------------------------------------------------------
create table if not exists public.presences (
  id uuid primary key default gen_random_uuid(),
  apprenant_id uuid not null references public.apprenants (id) on delete cascade,
  date date not null,
  statut text not null default 'present' check (statut in ('present', 'absent', 'retard', 'absence_justifiee')),
  heure_debut time,
  heure_fin time,
  heures numeric(5, 2) default 0,
  commentaire text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (apprenant_id, date)
);

create index if not exists idx_presences_apprenant on public.presences (apprenant_id);
create index if not exists idx_presences_date on public.presences (date);

-- ----------------------------------------------------------------------------
-- 7. VUE : total jours de présence + total heures par apprenant
-- ----------------------------------------------------------------------------
create or replace view public.vue_totaux_apprenants as
select
  a.id as apprenant_id,
  a.nom_complet,
  a.groupe,
  count(distinct p.date) filter (where p.statut = 'present') as total_jours_presence,
  coalesce(sum(p.heures) filter (where p.statut = 'present'), 0) as total_heures
from public.apprenants a
left join public.presences p on p.apprenant_id = a.id
group by a.id, a.nom_complet, a.groupe;

-- ----------------------------------------------------------------------------
-- 8. Mise à jour automatique de "updated_at" sur les évaluations
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_evaluations_updated_at on public.evaluations;
create trigger trg_evaluations_updated_at
  before update on public.evaluations
  for each row execute procedure public.set_updated_at();

-- ============================================================================
-- SÉCURITÉ (Row Level Security) — chaque table n'est accessible qu'aux
-- utilisateurs connectés, avec des droits différents selon le rôle.
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.apprenants enable row level security;
alter table public.evaluations enable row level security;
alter table public.presences enable row level security;

-- PROFILES : tout utilisateur connecté peut voir l'équipe ; seul un admin
-- peut créer/modifier/supprimer des profils (rôle, statut actif...).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- INVITATIONS : réservé aux admins.
drop policy if exists invitations_admin_all on public.invitations;
create policy invitations_admin_all on public.invitations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- APPRENANTS : lecture pour tous les connectés ; écriture pour editor/admin ;
-- suppression réservée à l'admin.
drop policy if exists apprenants_select on public.apprenants;
create policy apprenants_select on public.apprenants
  for select to authenticated using (true);

drop policy if exists apprenants_write on public.apprenants;
create policy apprenants_write on public.apprenants
  for insert to authenticated with check (public.is_editor_or_admin());

drop policy if exists apprenants_update on public.apprenants;
create policy apprenants_update on public.apprenants
  for update to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

drop policy if exists apprenants_delete on public.apprenants;
create policy apprenants_delete on public.apprenants
  for delete to authenticated using (public.is_admin());

-- ÉVALUATIONS : même logique que apprenants.
drop policy if exists evaluations_select on public.evaluations;
create policy evaluations_select on public.evaluations
  for select to authenticated using (true);

drop policy if exists evaluations_insert on public.evaluations;
create policy evaluations_insert on public.evaluations
  for insert to authenticated with check (public.is_editor_or_admin());

drop policy if exists evaluations_update on public.evaluations;
create policy evaluations_update on public.evaluations
  for update to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

drop policy if exists evaluations_delete on public.evaluations;
create policy evaluations_delete on public.evaluations
  for delete to authenticated using (public.is_admin());

-- PRÉSENCES : même logique que apprenants.
drop policy if exists presences_select on public.presences;
create policy presences_select on public.presences
  for select to authenticated using (true);

drop policy if exists presences_insert on public.presences;
create policy presences_insert on public.presences
  for insert to authenticated with check (public.is_editor_or_admin());

drop policy if exists presences_update on public.presences;
create policy presences_update on public.presences
  for update to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

drop policy if exists presences_delete on public.presences;
create policy presences_delete on public.presences
  for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. Activer le temps réel (Realtime) sur les tables consultées en direct
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.evaluations;
alter publication supabase_realtime add table public.presences;
alter publication supabase_realtime add table public.apprenants;

-- ============================================================================
-- 10. BOOTSTRAP DU PREMIER ADMIN (Clara Galanis)
-- À exécuter UNE SEULE FOIS, APRÈS que le compte de Clara a été créé dans
-- Supabase (voir README, étape "Créer le premier compte admin").
-- ============================================================================
-- update public.profiles
-- set role = 'admin', nom = 'Galanis', prenom = 'Clara'
-- where email = 'c.galanis@arcs-france.fr';
