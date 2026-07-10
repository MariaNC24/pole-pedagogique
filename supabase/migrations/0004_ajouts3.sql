-- ============================================================================
-- Pôle Pédagogique — ajouts v4
-- Pièce jointe PDF par document administratif (bucket dédié).
-- À exécuter APRÈS 0001, 0002 et 0003 : SQL Editor > New query > coller > Run
-- ============================================================================

alter table public.documents_administratifs add column if not exists chemin_storage text;
alter table public.documents_administratifs add column if not exists nom_fichier text;
alter table public.documents_administratifs add column if not exists taille_octets bigint;
alter table public.documents_administratifs add column if not exists type_mime text;
alter table public.documents_administratifs add column if not exists fichier_ajoute_at timestamptz;

insert into storage.buckets (id, name, public)
values ('documents-administratifs', 'documents-administratifs', false)
on conflict (id) do nothing;

drop policy if exists documents_administratifs_storage_select on storage.objects;
create policy documents_administratifs_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents-administratifs');

drop policy if exists documents_administratifs_storage_insert on storage.objects;
create policy documents_administratifs_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents-administratifs' and public.is_admin_or_pole_administratif());

drop policy if exists documents_administratifs_storage_delete on storage.objects;
create policy documents_administratifs_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents-administratifs' and public.is_admin_or_pole_administratif());
