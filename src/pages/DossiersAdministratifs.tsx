import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import Pagination from "../components/Pagination";
import type { Apprenant, DocumentAdministratif, DocumentRequis } from "../types";

const BUCKET = "documents-administratifs";
const PAGE_SIZE = 10;

const STATUT_LABELS: Record<DocumentAdministratif["statut"], string> = {
  manquant: "Manquant",
  recu: "Reçu",
  a_mettre_a_jour: "À mettre à jour",
};

const STATUT_COLORS: Record<DocumentAdministratif["statut"], string> = {
  manquant: "bg-red-50 text-red-700",
  recu: "bg-green-50 text-green-700",
  a_mettre_a_jour: "bg-amber-50 text-amber-700",
};

export default function DossiersAdministratifs() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "pole_administratif";
  const [onglet, setOnglet] = useState<"dossiers" | "requis">("dossiers");

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900">Dossiers administratifs</h1>
        <p className="text-sm text-slate-500">
          Suivi des documents par apprenant. Visible par toute l'équipe ; seuls les
          administrateurs et le pôle administratif peuvent modifier.
        </p>
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <button
          className={`px-3 py-2 text-sm font-medium ${
            onglet === "dossiers"
              ? "border-b-2 border-brand-500 text-brand-600"
              : "text-slate-500 hover:text-brand-600"
          }`}
          onClick={() => setOnglet("dossiers")}
        >
          Dossiers apprenants
        </button>
        <button
          className={`px-3 py-2 text-sm font-medium ${
            onglet === "requis"
              ? "border-b-2 border-brand-500 text-brand-600"
              : "text-slate-500 hover:text-brand-600"
          }`}
          onClick={() => setOnglet("requis")}
        >
          Documents requis
        </button>
      </div>

      {onglet === "dossiers" ? <DossiersApprenants canEdit={canEdit} /> : <DocumentsRequisTab canEdit={canEdit} />}
    </div>
  );
}

// ============================================================================
// Sous-onglet 1 : Dossiers par apprenant (recherche + pagination + alertes)
// ============================================================================
function DossiersApprenants({ canEdit }: { canEdit: boolean }) {
  const { profile } = useAuth();
  const [apprenants, setApprenants] = useState<Apprenant[]>([]);
  const [documents, setDocuments] = useState<DocumentAdministratif[]>([]);
  const [documentsRequis, setDocumentsRequis] = useState<DocumentRequis[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [customName, setCustomName] = useState<Record<string, string>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: apps }, { data: docs }, { data: req }] = await Promise.all([
      supabase.from("apprenants").select("*").is("deleted_at", null).eq("actif", true).order("nom_complet"),
      supabase.from("documents_administratifs").select("*"),
      supabase.from("documents_requis").select("*").order("ordre"),
    ]);
    setApprenants((apps as Apprenant[]) ?? []);
    setDocuments((docs as DocumentAdministratif[]) ?? []);
    setDocumentsRequis((req as DocumentRequis[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("documents-administratifs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "documents_administratifs" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "documents_requis" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const docsByApprenant = useMemo(() => {
    const map: Record<string, DocumentAdministratif[]> = {};
    documents.forEach((d) => {
      map[d.apprenant_id] = map[d.apprenant_id] ?? [];
      map[d.apprenant_id].push(d);
    });
    return map;
  }, [documents]);

  function statutRequis(apprenantId: string, docRequisId: string): DocumentAdministratif | null {
    return (docsByApprenant[apprenantId] ?? []).find((d) => d.document_requis_id === docRequisId) ?? null;
  }

  function manquants(apprenantId: string): DocumentRequis[] {
    return documentsRequis.filter((dr) => statutRequis(apprenantId, dr.id)?.statut !== "recu");
  }

  function customs(apprenantId: string): DocumentAdministratif[] {
    return (docsByApprenant[apprenantId] ?? []).filter((d) => !d.document_requis_id);
  }

  const filtered = useMemo(
    () => apprenants.filter((a) => a.nom_complet.toLowerCase().includes(search.toLowerCase())),
    [apprenants, search]
  );

  useEffect(() => setPage(1), [search]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function ensureRowAndUpdate(
    apprenantId: string,
    docRequis: DocumentRequis,
    patch: Partial<DocumentAdministratif>
  ) {
    const existing = statutRequis(apprenantId, docRequis.id);
    if (existing) {
      await supabase
        .from("documents_administratifs")
        .update({ ...patch, updated_by: profile?.id })
        .eq("id", existing.id);
    } else {
      await supabase.from("documents_administratifs").insert({
        apprenant_id: apprenantId,
        document_requis_id: docRequis.id,
        nom_document: docRequis.nom,
        statut: "manquant",
        ...patch,
        updated_by: profile?.id,
      });
    }
    load();
  }

  async function addCustom(apprenantId: string) {
    const nom = (customName[apprenantId] ?? "").trim();
    if (!nom) return;
    await supabase.from("documents_administratifs").insert({
      apprenant_id: apprenantId,
      document_requis_id: null,
      nom_document: nom,
      updated_by: profile?.id,
    });
    setCustomName((s) => ({ ...s, [apprenantId]: "" }));
    load();
  }

  async function deleteCustom(doc: DocumentAdministratif) {
    if (!confirm(`Retirer "${doc.nom_document}" ?`)) return;
    if (doc.chemin_storage) await supabase.storage.from(BUCKET).remove([doc.chemin_storage]);
    await supabase.from("documents_administratifs").delete().eq("id", doc.id);
    load();
  }

  async function uploadFichier(
    apprenantId: string,
    doc: DocumentAdministratif | null,
    docRequis: DocumentRequis | null,
    e: ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = doc?.id ?? docRequis?.id ?? "custom";
    setUploadingId(key);

    if (doc?.chemin_storage) {
      await supabase.storage.from(BUCKET).remove([doc.chemin_storage]);
    }

    const path = `${apprenantId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file);
    if (!error) {
      const patch = {
        chemin_storage: path,
        nom_fichier: file.name,
        taille_octets: file.size,
        type_mime: file.type,
        fichier_ajoute_at: new Date().toISOString(),
        statut: "recu" as const,
      };
      if (doc) {
        await supabase
          .from("documents_administratifs")
          .update({ ...patch, updated_by: profile?.id })
          .eq("id", doc.id);
      } else if (docRequis) {
        await supabase.from("documents_administratifs").insert({
          apprenant_id: apprenantId,
          document_requis_id: docRequis.id,
          nom_document: docRequis.nom,
          ...patch,
          updated_by: profile?.id,
        });
      }
      load();
    }
    setUploadingId(null);
    e.target.value = "";
  }

  async function retirerFichier(doc: DocumentAdministratif) {
    if (!doc.chemin_storage) return;
    if (!confirm("Retirer le fichier PDF de ce document ?")) return;
    await supabase.storage.from(BUCKET).remove([doc.chemin_storage]);
    await supabase
      .from("documents_administratifs")
      .update({ chemin_storage: null, nom_fichier: null, taille_octets: null, type_mime: null, fichier_ajoute_at: null })
      .eq("id", doc.id);
    load();
  }

  async function voirFichier(doc: DocumentAdministratif) {
    if (!doc.chemin_storage) return;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(doc.chemin_storage, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input
          className="input max-w-xs"
          placeholder="Rechercher un apprenant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-slate-400">{filtered.length} apprenant(s)</span>
      </div>

      {documentsRequis.length === 0 && (
        <p className="mb-3 text-sm text-amber-600">
          Aucun document requis n'est encore défini — allez dans « Documents requis » pour créer
          la liste demandée à tous les apprenants.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun apprenant.</p>
      ) : (
        <div className="space-y-2">
          {pageItems.map((a) => {
            const nbManquants = manquants(a.id);
            const isOpen = openId === a.id;
            const total = documentsRequis.length;
            const recus = total - nbManquants.length;
            return (
              <div key={a.id} className="card p-0">
                <button
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                  onClick={() => setOpenId(isOpen ? null : a.id)}
                >
                  <span className="font-medium text-slate-800">
                    {a.nom_complet}
                    {a.date_naissance && (
                      <span className="ml-2 font-normal text-slate-400">
                        (né(e) le {new Date(a.date_naissance).toLocaleDateString("fr-FR")})
                      </span>
                    )}
                    {a.numero_dossier && (
                      <span className="ml-2 font-normal text-slate-400">· Dossier n°{a.numero_dossier}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {total === 0 ? (
                      <span className="badge bg-slate-100 text-slate-500">Aucun document requis défini</span>
                    ) : nbManquants.length > 0 ? (
                      <span className="badge bg-red-50 text-red-700">
                        {recus}/{total} documents — {nbManquants.length} manquant(s)
                      </span>
                    ) : (
                      <span className="badge bg-green-50 text-green-700">Dossier complet ({total}/{total})</span>
                    )}
                    <span className="text-slate-400">{isOpen ? "▲" : "▼"}</span>
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    {nbManquants.length > 0 && (
                      <p className="mb-3 text-xs text-red-600">
                        Manquant(s) : {nbManquants.map((d) => d.nom).join(", ")}
                      </p>
                    )}

                    {documentsRequis.length > 0 && (
                      <ul className="mb-3 divide-y divide-slate-100 text-sm">
                        {documentsRequis.map((dr) => {
                          const doc = statutRequis(a.id, dr.id);
                          return (
                            <li key={dr.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                              <span className="text-slate-700">{dr.nom}</span>
                              <div className="flex flex-wrap items-center gap-2">
                                {doc?.chemin_storage ? (
                                  <>
                                    <button className="text-xs text-brand-600 hover:underline" onClick={() => voirFichier(doc)}>
                                      📄 {doc.nom_fichier}
                                    </button>
                                    {canEdit && (
                                      <button className="text-xs text-slate-400 hover:underline" onClick={() => retirerFichier(doc)}>
                                        retirer le fichier
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  canEdit && (
                                    <label className="cursor-pointer text-xs text-brand-600 hover:underline">
                                      {uploadingId === (doc?.id ?? dr.id) ? "Envoi..." : "+ Ajouter le PDF"}
                                      <input
                                        type="file"
                                        accept="application/pdf"
                                        className="hidden"
                                        disabled={uploadingId === (doc?.id ?? dr.id)}
                                        onChange={(e) => uploadFichier(a.id, doc, dr, e)}
                                      />
                                    </label>
                                  )
                                )}

                                {canEdit ? (
                                  <select
                                    className={`input w-40 py-1 text-xs ${STATUT_COLORS[doc?.statut ?? "manquant"]}`}
                                    value={doc?.statut ?? "manquant"}
                                    onChange={(e) =>
                                      ensureRowAndUpdate(a.id, dr, {
                                        statut: e.target.value as DocumentAdministratif["statut"],
                                      })
                                    }
                                  >
                                    {Object.entries(STATUT_LABELS).map(([v, l]) => (
                                      <option key={v} value={v}>
                                        {l}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className={`badge ${STATUT_COLORS[doc?.statut ?? "manquant"]}`}>
                                    {STATUT_LABELS[doc?.statut ?? "manquant"]}
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {customs(a.id).length > 0 && (
                      <>
                        <p className="mb-1 text-xs font-medium uppercase text-slate-400">
                          Documents ajoutés pour cet apprenant
                        </p>
                        <ul className="mb-3 divide-y divide-slate-100 text-sm">
                          {customs(a.id).map((d) => (
                            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                              <span className="text-slate-700">{d.nom_document}</span>
                              <div className="flex flex-wrap items-center gap-2">
                                {d.chemin_storage ? (
                                  <>
                                    <button className="text-xs text-brand-600 hover:underline" onClick={() => voirFichier(d)}>
                                      📄 {d.nom_fichier}
                                    </button>
                                    {canEdit && (
                                      <button className="text-xs text-slate-400 hover:underline" onClick={() => retirerFichier(d)}>
                                        retirer le fichier
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  canEdit && (
                                    <label className="cursor-pointer text-xs text-brand-600 hover:underline">
                                      {uploadingId === d.id ? "Envoi..." : "+ Ajouter le PDF"}
                                      <input
                                        type="file"
                                        accept="application/pdf"
                                        className="hidden"
                                        disabled={uploadingId === d.id}
                                        onChange={(e) => uploadFichier(a.id, d, null, e)}
                                      />
                                    </label>
                                  )
                                )}
                                {canEdit && (
                                  <button className="text-xs text-red-500 hover:underline" onClick={() => deleteCustom(d)}>
                                    Retirer
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {canEdit && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="input max-w-xs"
                          placeholder="Nom du document (spécifique à cet apprenant)"
                          value={customName[a.id] ?? ""}
                          onChange={(e) => setCustomName((s) => ({ ...s, [a.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && addCustom(a.id)}
                        />
                        <button className="btn-secondary text-xs" onClick={() => addCustom(a.id)}>
                          + Ajouter un document personnalisé
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="card mt-2 p-0">
        <Pagination page={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  );
}

// ============================================================================
// Sous-onglet 2 : Documents requis (liste fixe gérée par les admins)
// ============================================================================
function DocumentsRequisTab({ canEdit }: { canEdit: boolean }) {
  const { profile } = useAuth();
  const [liste, setListe] = useState<DocumentRequis[]>([]);
  const [nom, setNom] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("documents_requis").select("*").order("ordre");
    setListe((data as DocumentRequis[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("documents-requis-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "documents_requis" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function addDoc(e: FormEvent) {
    e.preventDefault();
    const value = nom.trim();
    if (!value) return;
    const ordre = liste.length > 0 ? Math.max(...liste.map((d) => d.ordre)) + 1 : 1;
    await supabase.from("documents_requis").insert({ nom: value, ordre, created_by: profile?.id });
    setNom("");
    load();
  }

  async function removeDoc(d: DocumentRequis) {
    if (
      !confirm(
        `Retirer "${d.nom}" de la liste des documents requis ? Les documents déjà envoyés pour ce nom seront conservés en tant que documents personnalisés (rien n'est perdu).`
      )
    )
      return;
    await supabase.from("documents_requis").delete().eq("id", d.id);
    load();
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Cette liste est demandée à <strong>tous</strong> les apprenants (ex. contrat signé, pièce
        d'identité...). Vous choisissez librement les intitulés. Réservé aux administrateurs et
        au pôle administratif.
      </p>

      {canEdit && (
        <form onSubmit={addDoc} className="card mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-sm font-medium">Nom du document</label>
            <input
              className="input"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex. Contrat signé, pièce d'identité..."
            />
          </div>
          <button type="submit" className="btn-primary">
            + Ajouter à la liste
          </button>
        </form>
      )}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <p className="p-4 text-sm text-slate-400">Chargement...</p>
        ) : liste.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">
            Aucun document requis pour l'instant. Ajoutez-en un ci-dessus.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {liste.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-slate-700">{d.nom}</span>
                {canEdit && (
                  <button className="text-xs text-red-500 hover:underline" onClick={() => removeDoc(d)}>
                    Retirer de la liste
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
