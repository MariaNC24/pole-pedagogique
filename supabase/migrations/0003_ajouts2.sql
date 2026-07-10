-- ============================================================================
-- Pôle Pédagogique — ajouts v3
-- Rôle "pôle administratif", dossiers administratifs, corbeille (suppression
-- réversible), fiche apprenant enrichie (heures totales, CECRL, contact,
-- financement, dates).
-- À exécuter APRÈS 0001_init.sql et 0002_ajouts.sql : SQL Editor > New query
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Nouveau rôle "pole_administratif" : accès en LECTURE à tout le site,
--    mais ne peut MODIFIER que l'onglet "Dossiers administratifs".
-- ----------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'editor', 'viewer', 'pole_administratif'));

alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations
  add constraint invitations_role_check
  check (role in ('admin', 'editor', 'viewer', 'pole_administratif'));

create or replace function public.is_admin_or_pole_administratif()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.get_my_role() in ('admin', 'pole_administratif'), false);
$$;

-- ----------------------------------------------------------------------------
-- 2. APPRENANTS : nouveaux champs
-- ----------------------------------------------------------------------------
alter table public.apprenants add column if not exists heures_totales_prevues numeric(6, 2);
alter table public.apprenants add column if not exists date_session_edof date;
alter table public.apprenants add column if not exists mode_financement text
  check (mode_financement in ('CPF', 'HORS CPF', 'OPCO', 'ENTREPRISE', 'FRANCE TRAVAIL', 'AUTRES') or mode_financement is null);
alter table public.apprenants add column if not exists niveau_cecrl_initial text;
alter table public.apprenants add column if not exists niveau_cecrl_vise text;
alter table public.apprenants add column if not exists telephone text;
alter table public.apprenants add column if not exists email text;
alter table public.apprenants add column if not exists date_naissance date;
alter table public.apprenants add column if not exists deleted_at timestamptz;

-- date_entree et date_sortie existent déjà depuis 0001_init.sql
-- (= date d'entrée en formation / date de sortie de formation).

-- ----------------------------------------------------------------------------
-- 3. GROUPES : suppression réversible (corbeille)
-- ----------------------------------------------------------------------------
alter table public.groupes add column if not exists deleted_at timestamptz;

-- ----------------------------------------------------------------------------
-- 4. Mettre à jour la vue des totaux : heures prévues / heures restantes
-- ----------------------------------------------------------------------------
drop view if exists public.vue_totaux_apprenants;

create view public.vue_totaux_apprenants as
select
  a.id as apprenant_id,
  a.nom_complet,
  coalesce(g.nom, a.groupe) as groupe,
  a.formateur,
  count(distinct p.date) filter (where p.statut = 'present') as total_jours_presence,
  coalesce(sum(p.heures) filter (where p.statut = 'present'), 0) as total_heures,
  a.heures_totales_prevues,
  case
    when a.heures_totales_prevues is null then null
    else a.heures_totales_prevues - coalesce(sum(p.heures) filter (where p.statut = 'present'), 0)
  end as heures_restantes
from public.apprenants a
left join public.groupes g on g.id = a.groupe_id
left join public.presences p on p.apprenant_id = a.id
group by a.id, a.nom_complet, g.nom, a.groupe, a.formateur, a.heures_totales_prevues;

-- ----------------------------------------------------------------------------
-- 5. DOSSIERS ADMINISTRATIFS (documents personnalisables par apprenant)
-- ----------------------------------------------------------------------------
create table if not exists public.documents_administratifs (
  id uuid primary key default gen_random_uuid(),
  apprenant_id uuid not null references public.apprenants (id) on delete cascade,
  nom_document text not null,
  statut text not null default 'manquant' check (statut in ('manquant', 'recu', 'a_mettre_a_jour')),
  commentaire text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_documents_administratifs_apprenant on public.documents_administratifs (apprenant_id);

drop trigger if exists trg_documents_administratifs_updated_at on public.documents_administratifs;
create trigger trg_documents_administratifs_updated_at
  before update on public.documents_administratifs
  for each row execute procedure public.set_updated_at();

alter table public.documents_administratifs enable row level security;

drop policy if exists documents_administratifs_select on public.documents_administratifs;
create policy documents_administratifs_select on public.documents_administratifs
  for select to authenticated using (true);

drop policy if exists documents_administratifs_write on public.documents_administratifs;
create policy documents_administratifs_write on public.documents_administratifs
  for all to authenticated
  using (public.is_admin_or_pole_administratif())
  with check (public.is_admin_or_pole_administratif());

alter publication supabase_realtime add table public.documents_administratifs;

-- Historique (propriétaire uniquement) sur les dossiers administratifs aussi
drop trigger if exists trg_audit_documents_administratifs on public.documents_administratifs;
create trigger trg_audit_documents_administratifs
  after insert or update or delete on public.documents_administratifs
  for each row execute procedure public.log_audit();

-- ============================================================================
-- Note sur la corbeille : la suppression d'un apprenant ou d'un groupe ne
-- fait plus un "delete" SQL mais met simplement deleted_at = now() (fait par
-- le site). L'élément reste ainsi visible 15 jours dans la page "Corbeille"
-- avant que le site le supprime définitivement (vérification faite à chaque
-- ouverture de cette page, pas besoin de tâche planifiée).
-- ============================================================================
