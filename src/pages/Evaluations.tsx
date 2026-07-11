import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import RoleGuard from "../components/RoleGuard";
import type { Apprenant, Evaluation } from "../types";

const STATUTS = ["À faire", "En cours", "Fait", "Reporté"];
const OBJECTIFS = ["", "Oui", "Non", "Partiel"];

export default function Evaluations() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "editor";

  const [apprenants, setApprenants] = useState<Apprenant[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterApprenant, setFilterApprenant] = useState("");
  const [search, setSearch] = useState("");
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [newApprenantId, setNewApprenantId] = useState("");

  async function loadAll() {
    setLoading(true);
    const [{ data: apps }, { data: evals }] = await Promise.all([
      supabase.from("apprenants").select("*").is("deleted_at", null).eq("actif", true).order("nom_complet"),
      supabase.from("evaluations").select("*").order("date_prevue", { ascending: false }),
    ]);
    setApprenants((apps as Apprenant[]) ?? []);
    setEvaluations((evals as Evaluation[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // Suivi en temps réel : dès qu'un collègue modifie une ligne, tout le
    // monde voit la mise à jour sans recharger la page.
    const channel = supabase
      .channel("evaluations-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "evaluations" }, (payload) => {
        setEvaluations((prev) => {
          if (payload.eventType === "DELETE") {
            return prev.filter((e) => e.id !== (payload.old as Evaluation).id);
          }
          const row = payload.new as Evaluation;
          const exists = prev.some((e) => e.id === row.id);
          return exists ? prev.map((e) => (e.id === row.id ? row : e)) : [row, ...prev];
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const apprenantNom = useMemo(() => {
    const map: Record<string, string> = {};
    apprenants.forEach((a) => (map[a.id] = a.nom_complet));
    return map;
  }, [apprenants]);

  const apprenantsRecherches = useMemo(
    () => apprenants.filter((a) => a.nom_complet.toLowerCase().includes(search.toLowerCase())),
    [apprenants, search]
  );

  const filtered = useMemo(
    () =>
      filterApprenant
        ? evaluations.filter((e) => e.apprenant_id === filterApprenant)
        : evaluations,
    [evaluations, filterApprenant]
  );

  async function saveField(id: string, field: keyof Evaluation, value: string) {
    setSavingIds((s) => ({ ...s, [id]: true }));
    setEvaluations((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
    await supabase
      .from("evaluations")
      .update({ [field]: value || null, updated_by: profile?.id })
      .eq("id", id);
    setSavingIds((s) => ({ ...s, [id]: false }));
    setSavedIds((s) => ({ ...s, [id]: true }));
    setTimeout(() => setSavedIds((s) => ({ ...s, [id]: false })), 1500);
  }

  async function addRow() {
    if (!newApprenantId) return;
    const { data } = await supabase
      .from("evaluations")
      .insert({ apprenant_id: newApprenantId, statut: "À faire", updated_by: profile?.id })
      .select()
      .single();
    if (data) setEvaluations((prev) => [data as Evaluation, ...prev]);
    setNewApprenantId("");
  }

  async function deleteRow(id: string) {
    if (!confirm("Supprimer cette ligne de suivi ?")) return;
    await supabase.from("evaluations").delete().eq("id", id);
    setEvaluations((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Suivi pédagogique — Évaluations</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input max-w-xs"
            placeholder="Rechercher un apprenant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input max-w-xs"
            value={filterApprenant}
            onChange={(e) => setFilterApprenant(e.target.value)}
          >
            <option value="">Tous les apprenants</option>
            {apprenantsRecherches.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom_complet}
              </option>
            ))}
          </select>
        </div>
      </div>

      <RoleGuard allow={["admin", "editor"]}>
        <div className="card mb-4 flex flex-wrap items-center gap-3">
          <select
            className="input max-w-xs"
            value={newApprenantId}
            onChange={(e) => setNewApprenantId(e.target.value)}
          >
            <option value="">Sélectionner un apprenant...</option>
            {apprenantsRecherches.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom_complet}
              </option>
            ))}
          </select>
          <button className="btn-primary" onClick={addRow} disabled={!newApprenantId}>
            + Nouvelle évaluation
          </button>
          <span className="text-xs text-slate-400">
            Les modifications sont enregistrées automatiquement.
          </span>
        </div>
      </RoleGuard>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <p className="p-4 text-sm text-slate-400">Chargement...</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Aucune évaluation pour l'instant.</p>
        ) : (
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Apprenant</th>
                <th className="px-3 py-2">Date prévue</th>
                <th className="px-3 py-2">Date réalisée</th>
                <th className="px-3 py-2">Type d'évaluation</th>
                <th className="px-3 py-2">Compétence évaluée</th>
                <th className="px-3 py-2">Résultat / Score</th>
                <th className="px-3 py-2">Niveau CECRL</th>
                <th className="px-3 py-2">Objectif atteint</th>
                <th className="px-3 py-2">Action pédagogique</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev) => (
                <tr key={ev.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {apprenantNom[ev.apprenant_id] ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      className="input"
                      disabled={!canEdit}
                      defaultValue={ev.date_prevue ?? ""}
                      onBlur={(e) => saveField(ev.id, "date_prevue", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      className="input"
                      disabled={!canEdit}
                      defaultValue={ev.date_realisee ?? ""}
                      onBlur={(e) => saveField(ev.id, "date_realisee", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input"
                      disabled={!canEdit}
                      defaultValue={ev.type_evaluation ?? ""}
                      onBlur={(e) => saveField(ev.id, "type_evaluation", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input"
                      disabled={!canEdit}
                      defaultValue={ev.competence_evaluee ?? ""}
                      onBlur={(e) => saveField(ev.id, "competence_evaluee", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input"
                      disabled={!canEdit}
                      defaultValue={ev.resultat_score ?? ""}
                      onBlur={(e) => saveField(ev.id, "resultat_score", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input"
                      disabled={!canEdit}
                      defaultValue={ev.niveau_cecrl ?? ""}
                      onBlur={(e) => saveField(ev.id, "niveau_cecrl", e.target.value)}
                      placeholder="A1, A2, B1..."
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="input"
                      disabled={!canEdit}
                      value={ev.objectif_atteint ?? ""}
                      onChange={(e) => saveField(ev.id, "objectif_atteint", e.target.value)}
                    >
                      {OBJECTIFS.map((o) => (
                        <option key={o} value={o}>
                          {o || "—"}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input"
                      disabled={!canEdit}
                      defaultValue={ev.action_pedagogique ?? ""}
                      onBlur={(e) => saveField(ev.id, "action_pedagogique", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="input"
                      disabled={!canEdit}
                      value={ev.statut ?? "À faire"}
                      onChange={(e) => saveField(ev.id, "statut", e.target.value)}
                    >
                      {STATUTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {savingIds[ev.id] && <span className="text-slate-400">Enreg...</span>}
                    {savedIds[ev.id] && <span className="text-green-600">✓ Enregistré</span>}
                    <RoleGuard allow={["admin"]}>
                      <button
                        className="mt-1 block text-red-500 hover:underline"
                        onClick={() => deleteRow(ev.id)}
                      >
                        Supprimer
                      </button>
                    </RoleGuard>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
