-- ============================================================================
-- Pôle Pédagogique — ajouts v5
-- Pagination, liste fixe des documents administratifs (gérée par les admins),
-- onglet Examen (mi-parcours, fin de parcours, certification, titre de séjour),
-- numéro de dossier, suppression d'accès par un admin.
-- À exécuter APRÈS 0001, 0002, 0003 et 0004 : SQL Editor > New query > coller > Run
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. APPRENANTS : nouveaux champs
-- ----------------------------------------------------------------------------
alter table public.apprenants add column if not exists numero_dossier text;
alter table public.apprenants add column if not exists date_expiration_titre_sejour date;
alter table public.apprenants add column if not exists test_mi_parcours_fait boolean not null default false;
alter table public.apprenants add column if not exists test_fin_parcours_fait boolean not null default false;

-- ----------------------------------------------------------------------------
-- 2. Vue des totaux : ajout du pourcentage d'avancement (heures faites /
--    heures totales prévues), utilisé pour les alertes mi-parcours/fin de
--    parcours/100%.
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
  end as heures_restantes,
  case
    when a.heures_totales_prevues is null or a.heures_totales_prevues = 0 then null
    else round(
      (coalesce(sum(p.heures) filter (where p.statut = 'present'), 0) / a.heures_totales_prevues) * 100
    )
  end as pourcentage_avancement
from public.apprenants a
left join public.groupes g on g.id = a.groupe_id
left join public.presences p on p.apprenant_id = a.id
group by a.id, a.nom_complet, g.nom, a.groupe, a.formateur, a.heures_totales_prevues;

-- ----------------------------------------------------------------------------
-- 3. DOCUMENTS REQUIS : liste fixe (gérée par les admins/pôle administratif)
--    des documents demandés à TOUS les apprenants. Remplace la liste
--    suggérée codée en dur de la v4.
-- ----------------------------------------------------------------------------
create table if not exists public.documents_requis (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  ordre integer not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.documents_requis enable row level security;

drop policy if exists documents_requis_select on public.documents_requis;
create policy documents_requis_select on public.documents_requis
  for select to authenticated using (true);

drop policy if exists documents_requis_write on public.documents_requis;
create policy documents_requis_write on public.documents_requis
  for all to authenticated
  using (public.is_admin_or_pole_administratif())
  with check (public.is_admin_or_pole_administratif());

alter publication supabase_realtime add table public.documents_requis;

-- Rattache chaque ligne de documents_administratifs à un document requis
-- (NULL = document personnalisé ajouté pour un apprenant en particulier).
alter table public.documents_administratifs
  add column if not exists document_requis_id uuid references public.documents_requis (id) on delete set null;

-- ----------------------------------------------------------------------------
-- 4. SUIVI EXAMEN : rendez-vous de certification, résultat, titre de séjour
--    (édition par admin + pôle administratif, comme les dossiers admin.)
-- ----------------------------------------------------------------------------
create table if not exists public.suivi_examen (
  apprenant_id uuid primary key references public.apprenants (id) on delete cascade,
  date_souhaitee date,
  commentaire text,
  statut text not null default 'attente' check (statut in ('attente', 'obtenu')),
  niveau_obtenu text,
  date_obtention date,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_suivi_examen_updated_at on public.suivi_examen;
create trigger trg_suivi_examen_updated_at
  before update on public.suivi_examen
  for each row execute procedure public.set_updated_at();

alter table public.suivi_examen enable row level security;

drop policy if exists suivi_examen_select on public.suivi_examen;
create policy suivi_examen_select on public.suivi_examen
  for select to authenticated using (true);

drop policy if exists suivi_examen_write on public.suivi_examen;
create policy suivi_examen_write on public.suivi_examen
  for all to authenticated
  using (public.is_admin_or_pole_administratif())
  with check (public.is_admin_or_pole_administratif());

alter publication supabase_realtime add table public.suivi_examen;

drop trigger if exists trg_audit_suivi_examen on public.suivi_examen;
create trigger trg_audit_suivi_examen
  after insert or update or delete on public.suivi_examen
  for each row execute procedure public.log_audit();

-- ----------------------------------------------------------------------------
-- 5. Permettre à un admin de modifier le champ test_mi_parcours_fait /
--    test_fin_parcours_fait / numero_dossier / date_expiration_titre_sejour :
--    déjà couvert par la policy d'écriture existante sur apprenants
--    (is_editor_or_admin). Rien à changer ici.
-- ============================================================================
