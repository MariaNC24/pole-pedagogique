import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import RoleGuard from "../components/RoleGuard";
import type { Apprenant, DocumentAdministratif } from "../types";

const BUCKET = "documents-administratifs";
const NOUVEAU_DOCUMENT = "__nouveau__";

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

const DOCUMENTS_SUGGERES = [
  "Contrat / convention signé(e)",
  "Pièce d'identité",
  "Justificatif de financement",
  "Test de positionnement initial",
  "Attestation de fin de formation",
  "RIB",
];

export default function DossiersAdministratifs() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "pole_administratif";

  const [apprenants, setApprenants] = useState<Apprenant[]>([]);
  const [documents, setDocuments] = useState<DocumentAdministratif[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectValue, setSelectValue] = useState<Record<string, string>>({});
  const [customName, setCustomName] = useState<Record<string, string>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: apps }, { data: docs }] = await Promise.all([
      supabase.from("apprenants").select("*").is("deleted_at", null).eq("actif", true).order("nom_complet"),
      supabase.from("documents_administratifs").select("*").order("nom_document"),
    ]);
    setApprenants((apps as Apprenant[]) ?? []);
    setDocuments((docs as DocumentAdministratif[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("documents-administratifs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents_administratifs" },
        () => load()
      )
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

  // Liste déroulante des intitulés : ceux déjà utilisés dans le site + les
  // suggestions par défaut. L'équipe décide librement des noms via "+ Nouveau".
  const intitulesDisponibles = useMemo(() => {
    const utilises = new Set(documents.map((d) => d.nom_document));
    DOCUMENTS_SUGGERES.forEach((d) => utilises.add(d));
    return Array.from(utilises).sort((a, b) => a.localeCompare(b, "fr"));
  }, [documents]);

  const filtered = apprenants.filter((a) =>
    a.nom_complet.toLowerCase().includes(search.toLowerCase())
  );

  function manquants(apprenantId: string) {
    return (docsByApprenant[apprenantId] ?? []).filter((d) => d.statut !== "recu").length;
  }

  async function addDocument(apprenantId: string) {
    const value = selectValue[apprenantId];
    const nom = value === NOUVEAU_DOCUMENT ? (customName[apprenantId] ?? "").trim() : value;
    if (!nom) return;
    await supabase.from("documents_administratifs").insert({
      apprenant_id: apprenantId,
      nom_document: nom,
      updated_by: profile?.id,
    });
    setSelectValue((s) => ({ ...s, [apprenantId]: "" }));
    setCustomName((s) => ({ ...s, [apprenantId]: "" }));
    load();
  }

  async function updateStatut(doc: DocumentAdministratif, statut: DocumentAdministratif["statut"]) {
    await supabase
      .from("documents_administratifs")
      .update({ statut, updated_by: profile?.id })
      .eq("id", doc.id);
    load();
  }

  async function deleteDocument(doc: DocumentAdministratif) {
    if (!confirm(`Retirer "${doc.nom_document}" de la liste ?`)) return;
    if (doc.chemin_storage) {
      await supabase.storage.from(BUCKET).remove([doc.chemin_storage]);
    }
    await supabase.from("documents_administratifs").delete().eq("id", doc.id);
    load();
  }

  async function uploadFichier(doc: DocumentAdministratif, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(doc.id);

    if (doc.chemin_storage) {
      await supabase.storage.from(BUCKET).remove([doc.chemin_storage]);
    }

    const path = `${doc.apprenant_id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file);
    if (!error) {
      await supabase
        .from("documents_administratifs")
        .update({
          chemin_storage: path,
          nom_fichier: file.name,
          taille_octets: file.size,
          type_mime: file.type,
          fichier_ajoute_at: new Date().toISOString(),
          statut: "recu",
          updated_by: profile?.id,
        })
        .eq("id", doc.id);
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
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900">Dossiers administratifs</h1>
        <p className="text-sm text-slate-500">
          Suivi des documents par apprenant, avec le PDF correspondant si besoin. Visible par
          toute l'équipe ; seuls les administrateurs et le pôle administratif peuvent le modifier.
        </p>
      </div>

      <input
        className="input mb-4 max-w-xs"
        placeholder="Rechercher un apprenant..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun apprenant.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const docs = docsByApprenant[a.id] ?? [];
            const nbManquants = manquants(a.id);
            const isOpen = openId === a.id;
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
                  </span>
                  <span className="flex items-center gap-2">
                    {nbManquants > 0 ? (
                      <span className="badge bg-red-50 text-red-700">
                        {nbManquants} document(s) manquant(s)
                      </span>
                    ) : docs.length > 0 ? (
                      <span className="badge bg-green-50 text-green-700">Dossier complet</span>
                    ) : (
                      <span className="badge bg-slate-100 text-slate-500">Aucun document suivi</span>
                    )}
                    <span className="text-slate-400">{isOpen ? "▲" : "▼"}</span>
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    {docs.length === 0 ? (
                      <p className="mb-3 text-sm text-slate-400">Aucun document suivi pour l'instant.</p>
                    ) : (
                      <ul className="mb-3 divide-y divide-slate-100 text-sm">
                        {docs.map((d) => (
                          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <span className="text-slate-700">{d.nom_document}</span>
                            <div className="flex flex-wrap items-center gap-2">
                              {d.chemin_storage ? (
                                <>
                                  <button
                                    className="text-xs text-brand-600 hover:underline"
                                    onClick={() => voirFichier(d)}
                                  >
                                    📄 {d.nom_fichier}
                                  </button>
                                  {canEdit && (
                                    <button
                                      className="text-xs text-slate-400 hover:underline"
                                      onClick={() => retirerFichier(d)}
                                    >
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
                                      onChange={(e) => uploadFichier(d, e)}
                                    />
                                  </label>
                                )
                              )}

                              {canEdit ? (
                                <select
                                  className={`input w-40 py-1 text-xs ${STATUT_COLORS[d.statut]}`}
                                  value={d.statut}
                                  onChange={(e) =>
                                    updateStatut(d, e.target.value as DocumentAdministratif["statut"])
                                  }
                                >
                                  {Object.entries(STATUT_LABELS).map(([v, l]) => (
                                    <option key={v} value={v}>
                                      {l}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className={`badge ${STATUT_COLORS[d.statut]}`}>
                                  {STATUT_LABELS[d.statut]}
                                </span>
                              )}
                              {canEdit && (
                                <button
                                  className="text-xs text-red-500 hover:underline"
                                  onClick={() => deleteDocument(d)}
                                >
                                  Retirer
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    <RoleGuard allow={["admin", "pole_administratif"]}>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="input max-w-xs"
                          value={selectValue[a.id] ?? ""}
                          onChange={(e) => setSelectValue((s) => ({ ...s, [a.id]: e.target.value }))}
                        >
                          <option value="">Choisir un document à suivre...</option>
                          {intitulesDisponibles.map((nom) => (
                            <option key={nom} value={nom}>
                              {nom}
                            </option>
                          ))}
                          <option value={NOUVEAU_DOCUMENT}>+ Nouveau document...</option>
                        </select>
                        {selectValue[a.id] === NOUVEAU_DOCUMENT && (
                          <input
                            className="input max-w-xs"
                            placeholder="Nom du nouveau document"
                            value={customName[a.id] ?? ""}
                            onChange={(e) => setCustomName((s) => ({ ...s, [a.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && addDocument(a.id)}
                          />
                        )}
                        <button className="btn-secondary text-xs" onClick={() => addDocument(a.id)}>
                          + Ajouter
                        </button>
                      </div>
                    </RoleGuard>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
