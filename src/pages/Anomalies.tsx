import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import RoleGuard from "../components/RoleGuard";
import Pagination from "../components/Pagination";
import type { Apprenant, SuiviAnomalie } from "../types";

const PAGE_SIZE = 10;

const STATUTS: { value: SuiviAnomalie["statut_appel"]; label: string }[] = [
  { value: "NRP", label: "NRP (n'a pas répondu)" },
  { value: "Répondu", label: "Répondu" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Anomalies() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin";

  const [apprenants, setApprenants] = useState<Apprenant[]>([]);
  const [lignes, setLignes] = useState<SuiviAnomalie[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [newApprenantId, setNewApprenantId] = useState("");
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);

  async function loadAll() {
    setLoading(true);
    const [{ data: apps }, { data: an }] = await Promise.all([
      supabase.from("apprenants").select("*").is("deleted_at", null).eq("actif", true).order("nom_complet"),
      supabase.from("suivi_anomalies").select("*").order("date_appel", { ascending: false }),
    ]);
    setApprenants((apps as Apprenant[]) ?? []);
    setLignes((an as SuiviAnomalie[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel("anomalies-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "suivi_anomalies" }, () => loadAll())
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

  const filtered = useMemo(() => {
    return lignes.filter((l) => {
      if (filterStatut && l.statut_appel !== filterStatut) return false;
      if (search) {
        const nom = apprenantNom[l.apprenant_id] ?? "";
        if (!nom.toLowerCase().includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [lignes, filterStatut, search, apprenantNom]);

  useEffect(() => setPage(1), [search, filterStatut]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const nbNrp = lignes.filter((l) => l.statut_appel === "NRP").length;

  async function addRow() {
    if (!newApprenantId) return;
    await supabase.from("suivi_anomalies").insert({
      apprenant_id: newApprenantId,
      date_appel: todayISO(),
      statut_appel: "NRP",
      created_by: profile?.id,
      updated_by: profile?.id,
    });
    setNewApprenantId("");
  }

  async function saveField(id: string, patch: Partial<SuiviAnomalie>) {
    setSavingIds((s) => ({ ...s, [id]: true }));
    setLignes((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await supabase
      .from("suivi_anomalies")
      .update({ ...patch, updated_by: profile?.id })
      .eq("id", id);
    setSavingIds((s) => ({ ...s, [id]: false }));
    setSavedIds((s) => ({ ...s, [id]: true }));
    setTimeout(() => setSavedIds((s) => ({ ...s, [id]: false })), 1500);
  }

  async function deleteRow(id: string) {
    if (!confirm("Supprimer cette ligne de suivi ?")) return;
    await supabase.from("suivi_anomalies").delete().eq("id", id);
    setLignes((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Suivi anomalies</h1>
          <p className="text-sm text-slate-500">
            Journal des appels aux apprenants qui ne reviennent pas en cours ou ne répondent pas
            (1er cours ou autre) — {nbNrp} en NRP actuellement. Réservé aux administrateurs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input max-w-xs"
            placeholder="Rechercher un apprenant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input max-w-xs"
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
          >
            <option value="">Tous les résultats</option>
            {STATUTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <RoleGuard
        allow={["admin"]}
        fallback={
          <p className="mb-4 text-xs text-slate-400">
            Lecture seule — cet onglet ne peut être modifié que par un administrateur.
          </p>
        }
      >
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
            + Nouvel appel
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
          <p className="p-4 text-sm text-slate-400">Aucune anomalie pour l'instant.</p>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Apprenant</th>
                <th className="px-3 py-2">Date de l'appel</th>
                <th className="px-3 py-2">Résultat</th>
                <th className="px-3 py-2">Décision prise</th>
                <th className="px-3 py-2">Commentaire</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 font-medium text-slate-800">
                    <Link to={`/apprenants/${l.apprenant_id}`} className="hover:underline">
                      {apprenantNom[l.apprenant_id] ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      className="input"
                      disabled={!canEdit}
                      defaultValue={l.date_appel}
                      onBlur={(e) => saveField(l.id, { date_appel: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={`input ${
                        l.statut_appel === "NRP" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                      }`}
                      disabled={!canEdit}
                      value={l.statut_appel}
                      onChange={(e) =>
                        saveField(l.id, { statut_appel: e.target.value as SuiviAnomalie["statut_appel"] })
                      }
                    >
                      {STATUTS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input"
                      disabled={!canEdit}
                      defaultValue={l.decision ?? ""}
                      placeholder="ex. recontacter, sortie de formation..."
                      onBlur={(e) => saveField(l.id, { decision: e.target.value || null })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input"
                      disabled={!canEdit}
                      defaultValue={l.commentaire ?? ""}
                      onBlur={(e) => saveField(l.id, { commentaire: e.target.value || null })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {savingIds[l.id] && <span className="text-slate-400">Enreg...</span>}
                    {savedIds[l.id] && <span className="text-green-600">✓</span>}
                    {canEdit && (
                      <button
                        className="mt-1 block text-red-500 hover:underline"
                        onClick={() => deleteRow(l.id)}
                      >
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  );
}
