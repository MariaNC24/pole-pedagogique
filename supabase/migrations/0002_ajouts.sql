-- ============================================================================
-- Pôle Pédagogique — ajouts v2
-- Groupes structurés, alertes, journal de suivi, pièces jointes, historique
-- (réservé au "propriétaire"), attestations.
-- À exécuter APRÈS 0001_init.sql : SQL Editor > New query > coller > Run
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. "Propriétaire" du site : seule cette personne voit l'historique complet
--    des modifications, même les autres administrateurs ne le voient pas.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists is_owner boolean not null default false;

create or replace function public.is_owner_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_owner from public.profiles where id = auth.uid()), false);
$$;

-- ----------------------------------------------------------------------------
-- 2. GROUPES (structurés, avec formateur optionnel)
--    Le formateur est indépendant par apprenant (voir apprenants.formateur) :
--    "formateur_defaut" ne fait que pré-remplir, il peut être retiré/changé
--    librement pour chaque apprenant.
-- ----------------------------------------------------------------------------
create table if not exists public.groupes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  date_debut date,
  date_fin date,
  formateur_defaut text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

alter table public.apprenants add column if not exists groupe_id uuid references public.groupes (id) on delete set null;
alter table public.apprenants add column if not exists formateur text;

-- ----------------------------------------------------------------------------
-- 3. PARAMÈTRES (seuil d'alerte d'absences, configurable par un admin)
-- ----------------------------------------------------------------------------
create table if not exists public.parametres (
  id smallint primary key default 1,
  seuil_absences int not null default 3,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint parametres_singleton check (id = 1)
);
insert into public.parametres (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. JOURNAL DE SUIVI (notes internes par apprenant, distinct des évaluations)
-- ----------------------------------------------------------------------------
create table if not exists public.notes_suivi (
  id uuid primary key default gen_random_uuid(),
  apprenant_id uuid not null references public.apprenants (id) on delete cascade,
  contenu text not null,
  auteur uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_notes_suivi_apprenant on public.notes_suivi (apprenant_id);

-- ----------------------------------------------------------------------------
-- 5. PIÈCES JOINTES (optionnelles, Clara/l'équipe choisit d'en ajouter ou non)
-- ----------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  apprenant_id uuid not null references public.apprenants (id) on delete cascade,
  nom_fichier text not null,
  chemin_storage text not null,
  taille_octets bigint,
  type_mime text,
  uploaded_by uuid references public.profiles (id),
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_documents_apprenant on public.documents (apprenant_id);

insert into storage.buckets (id, name, public)
values ('documents-apprenants', 'documents-apprenants', false)
on conflict (id) do nothing;

drop policy if exists documents_storage_select on storage.objects;
create policy documents_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents-apprenants');

drop policy if exists documents_storage_insert on storage.objects;
create policy documents_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents-apprenants' and public.is_editor_or_admin());

drop policy if exists documents_storage_delete on storage.objects;
create policy documents_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents-apprenants' and public.is_editor_or_admin());

-- ----------------------------------------------------------------------------
-- 6. ATTESTATIONS (générées à la demande, jamais automatiques ; traçabilité)
-- ----------------------------------------------------------------------------
create table if not exists public.attestations_generees (
  id uuid primary key default gen_random_uuid(),
  apprenant_id uuid not null references public.apprenants (id) on delete cascade,
  periode_debut date,
  periode_fin date,
  total_jours numeric,
  total_heures numeric,
  genere_par uuid references public.profiles (id),
  genere_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. HISTORIQUE DES MODIFICATIONS (audit_log) — visible uniquement par le
--    "propriétaire" du site (is_owner), pas par les autres administrateurs.
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_cible text not null,
  ligne_id uuid,
  action text not null,
  donnees_avant jsonb,
  donnees_apres jsonb,
  modifie_par uuid references public.profiles (id),
  modifie_at timestamptz not null default now()
);
create index if not exists idx_audit_log_table on public.audit_log (table_cible, modifie_at desc);

create or replace function public.log_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (table_cible, ligne_id, action, donnees_apres, modifie_par)
    values (tg_table_name, new.id, 'insert', to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (table_cible, ligne_id, action, donnees_avant, donnees_apres, modifie_par)
    values (tg_table_name, new.id, 'update', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (table_cible, ligne_id, action, donnees_avant, modifie_par)
    values (tg_table_name, old.id, 'delete', to_jsonb(old), auth.uid());
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_apprenants on public.apprenants;
create trigger trg_audit_apprenants
  after insert or update or delete on public.apprenants
  for each row execute procedure public.log_audit();

drop trigger if exists trg_audit_evaluations on public.evaluations;
create trigger trg_audit_evaluations
  after insert or update or delete on public.evaluations
  for each row execute procedure public.log_audit();

drop trigger if exists trg_audit_presences on public.presences;
create trigger trg_audit_presences
  after insert or update or delete on public.presences
  for each row execute procedure public.log_audit();

drop trigger if exists trg_audit_groupes on public.groupes;
create trigger trg_audit_groupes
  after insert or update or delete on public.groupes
  for each row execute procedure public.log_audit();

-- ----------------------------------------------------------------------------
-- 8. Mettre à jour la vue des totaux (ajout groupe structuré + formateur)
-- ----------------------------------------------------------------------------
create or replace view public.vue_totaux_apprenants as
select
  a.id as apprenant_id,
  a.nom_complet,
  coalesce(g.nom, a.groupe) as groupe,
  a.formateur,
  count(distinct p.date) filter (where p.statut = 'present') as total_jours_presence,
  coalesce(sum(p.heures) filter (where p.statut = 'present'), 0) as total_heures
from public.apprenants a
left join public.groupes g on g.id = a.groupe_id
left join public.presences p on p.apprenant_id = a.id
group by a.id, a.nom_complet, g.nom, a.groupe, a.formateur;

-- ----------------------------------------------------------------------------
-- 9. SÉCURITÉ (RLS) sur les nouvelles tables
-- ----------------------------------------------------------------------------
alter table public.groupes enable row level security;
alter table public.parametres enable row level security;
alter table public.notes_suivi enable row level security;
alter table public.documents enable row level security;
alter table public.attestations_generees enable row level security;
alter table public.audit_log enable row level security;

-- GROUPES : lecture pour tous, écriture editor/admin, suppression admin.
drop policy if exists groupes_select on public.groupes;
create policy groupes_select on public.groupes for select to authenticated using (true);

drop policy if exists groupes_insert on public.groupes;
create policy groupes_insert on public.groupes for insert to authenticated with check (public.is_editor_or_admin());

drop policy if exists groupes_update on public.groupes;
create policy groupes_update on public.groupes for update to authenticated
  using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());

drop policy if exists groupes_delete on public.groupes;
create policy groupes_delete on public.groupes for delete to authenticated using (public.is_admin());

-- PARAMÈTRES : lecture pour tous, modification réservée à l'admin.
drop policy if exists parametres_select on public.parametres;
create policy parametres_select on public.parametres for select to authenticated using (true);

drop policy if exists parametres_update on public.parametres;
create policy parametres_update on public.parametres for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- JOURNAL DE SUIVI : lecture pour tous les connectés ; écriture editor/admin ;
-- modification/suppression par l'auteur ou un admin.
drop policy if exists notes_suivi_select on public.notes_suivi;
create policy notes_suivi_select on public.notes_suivi for select to authenticated using (true);

drop policy if exists notes_suivi_insert on public.notes_suivi;
create policy notes_suivi_insert on public.notes_suivi for insert to authenticated with check (public.is_editor_or_admin());

drop policy if exists notes_suivi_update on public.notes_suivi;
create policy notes_suivi_update on public.notes_suivi for update to authenticated
  using (auteur = auth.uid() or public.is_admin())
  with check (auteur = auth.uid() or public.is_admin());

drop policy if exists notes_suivi_delete on public.notes_suivi;
create policy notes_suivi_delete on public.notes_suivi for delete to authenticated
  using (auteur = auth.uid() or public.is_admin());

-- DOCUMENTS (métadonnées des pièces jointes) : lecture pour tous, écriture
-- editor/admin, suppression editor/admin (facultatif, jamais obligatoire).
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated using (true);

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated with check (public.is_editor_or_admin());

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated using (public.is_editor_or_admin());

-- ATTESTATIONS : générées et consultées uniquement par un administrateur,
-- toujours à la demande (jamais automatique, jamais de signature apprenant).
drop policy if exists attestations_select on public.attestations_generees;
create policy attestations_select on public.attestations_generees for select to authenticated using (public.is_admin());

drop policy if exists attestations_insert on public.attestations_generees;
create policy attestations_insert on public.attestations_generees for insert to authenticated with check (public.is_admin());

-- HISTORIQUE : réservé exclusivement au "propriétaire" du site.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated using (public.is_owner_user());

-- ----------------------------------------------------------------------------
-- 10. Activer le temps réel sur les nouvelles tables utiles en direct
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.groupes;
alter publication supabase_realtime add table public.notes_suivi;
alter publication supabase_realtime add table public.documents;

-- ============================================================================
-- 11. BOOTSTRAP : faire de Clara la "propriétaire" (accès à l'historique)
-- À exécuter une seule fois.
-- ============================================================================
-- update public.profiles set is_owner = true where email = 'c.galanis@arcs-france.fr';
