import { ChangeEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import RoleGuard from "../components/RoleGuard";
import type {
  Apprenant,
  DocumentApprenant,
  Evaluation,
  NoteSuivi,
  Presence,
  TotauxApprenant,
} from "../types";
import {
  exportAttestationPdf,
  exportBilanPedagogiquePdf,
  exportRelevePresenceExcel,
  exportRelevePresencePdf,
} from "../lib/exports";

const BUCKET = "documents-apprenants";

export default function ApprenantDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "editor";

  const [apprenant, setApprenant] = useState<Apprenant | null>(null);
  const [totaux, setTotaux] = useState<TotauxApprenant | null>(null);
  const [presences, setPresences] = useState<Presence[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [notes, setNotes] = useState<NoteSuivi[]>([]);
  const [documents, setDocuments] = useState<DocumentApprenant[]>([]);
  const [newNote, setNewNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!id) return;
    setLoading(true);
    const [
      { data: app },
      { data: tot },
      { data: pres },
      { data: evals },
      { data: n },
      { data: docs },
    ] = await Promise.all([
      supabase.from("apprenants").select("*").eq("id", id).single(),
      supabase.from("vue_totaux_apprenants").select("*").eq("apprenant_id", id).single(),
      supabase.from("presences").select("*").eq("apprenant_id", id).order("date", { ascending: false }),
      supabase.from("evaluations").select("*").eq("apprenant_id", id).order("date_prevue", { ascending: false }),
      supabase.from("notes_suivi").select("*").eq("apprenant_id", id).order("created_at", { ascending: false }),
      supabase.from("documents").select("*").eq("apprenant_id", id).order("uploaded_at", { ascending: false }),
    ]);
    setApprenant((app as Apprenant) ?? null);
    setTotaux((tot as TotauxApprenant) ?? null);
    setPresences((pres as Presence[]) ?? []);
    setEvaluations((evals as Evaluation[]) ?? []);
    setNotes((n as NoteSuivi[]) ?? []);
    setDocuments((docs as DocumentApprenant[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addNote() {
    if (!newNote.trim() || !id) return;
    await supabase.from("notes_suivi").insert({ apprenant_id: id, contenu: newNote, auteur: profile?.id });
    setNewNote("");
    load();
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    const path = `${id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file);
    if (!error) {
      await supabase.from("documents").insert({
        apprenant_id: id,
        nom_fichier: file.name,
        chemin_storage: path,
        taille_octets: file.size,
        type_mime: file.type,
        uploaded_by: profile?.id,
      });
      load();
    }
    setUploading(false);
    e.target.value = "";
  }

  async function downloadDocument(doc: DocumentApprenant) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(doc.chemin_storage, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  async function deleteDocument(doc: DocumentApprenant) {
    if (!confirm(`Supprimer le document "${doc.nom_fichier}" ?`)) return;
    await supabase.storage.from(BUCKET).remove([doc.chemin_storage]);
    await supabase.from("documents").delete().eq("id", doc.id);
    load();
  }

  async function genererAttestation() {
    if (!apprenant || !totaux) return;
    exportAttestationPdf(apprenant, totaux);
    await supabase.from("attestations_generees").insert({
      apprenant_id: apprenant.id,
      total_jours: totaux.total_jours_presence,
      total_heures: totaux.total_heures,
      genere_par: profile?.id,
    });
  }

  if (loading) return <p className="text-sm text-slate-400">Chargement...</p>;
  if (!apprenant) return <p className="text-sm text-slate-400">Apprenant introuvable.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/apprenants" className="text-sm text-brand-600 hover:underline">
          ← Retour aux apprenants
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{apprenant.nom_complet}</h1>
        <p className="text-sm text-slate-500">
          {totaux?.groupe || "Aucun groupe"} {apprenant.formateur ? `· Formateur : ${apprenant.formateur}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-2xl font-semibold text-brand-600">{totaux?.total_jours_presence ?? 0}</p>
          <p className="text-sm text-slate-500">Jours de présence</p>
        </div>
        <div className="card">
          <p className="text-2xl font-semibold text-brand-600">
            {Number(totaux?.total_heures ?? 0).toFixed(2)} h
          </p>
          <p className="text-sm text-slate-500">Total heures</p>
        </div>
        <div className="card">
          <p className="text-2xl font-semibold text-brand-600">{evaluations.length}</p>
          <p className="text-sm text-slate-500">Évaluations enregistrées</p>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium text-slate-800">Documents et attestations</h2>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => exportRelevePresenceExcel(
              presences.map((p) => ({ ...p, nom_complet: apprenant.nom_complet })),
              `releve-presence-${apprenant.nom_complet}`
            )}
          >
            Relevé de présence (Excel)
          </button>
          <button className="btn-secondary" onClick={() => exportRelevePresencePdf(apprenant, presences)}>
            Relevé de présence (PDF)
          </button>
          <button className="btn-secondary" onClick={() => exportBilanPedagogiquePdf(apprenant, evaluations)}>
            Bilan pédagogique (PDF)
          </button>
          <RoleGuard allow={["admin"]}>
            <button className="btn-primary" onClick={genererAttestation}>
              Générer l'attestation de présence/heures
            </button>
          </RoleGuard>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          L'attestation est générée uniquement à la demande d'un administrateur — jamais
          automatiquement, et sans signature de l'apprenant.
        </p>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-slate-800">Pièces jointes (optionnel)</h2>
          <RoleGuard allow={["admin", "editor"]}>
            <label className="btn-secondary cursor-pointer">
              {uploading ? "Envoi..." : "+ Ajouter un document"}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </RoleGuard>
        </div>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun document ajouté.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between py-2">
                <button className="text-brand-600 hover:underline" onClick={() => downloadDocument(doc)}>
                  {doc.nom_fichier}
                </button>
                <RoleGuard allow={["admin", "editor"]}>
                  <button
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => deleteDocument(doc)}
                  >
                    Supprimer
                  </button>
                </RoleGuard>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium text-slate-800">Journal de suivi</h2>
        <RoleGuard allow={["admin", "editor"]}>
          <div className="mb-3 flex gap-2">
            <input
              className="input"
              placeholder="Ajouter une note de suivi..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
            />
            <button className="btn-primary" onClick={addNote}>
              Ajouter
            </button>
          </div>
        </RoleGuard>
        {notes.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune note pour l'instant.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-slate-50 p-3">
                <p className="text-slate-700">{n.contenu}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(n.created_at).toLocaleString("fr-FR")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
