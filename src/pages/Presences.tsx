import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import RoleGuard from "../components/RoleGuard";
import type { Apprenant, Presence, TotauxApprenant } from "../types";

const STATUTS: { value: Presence["statut"]; label: string }[] = [
  { value: "present", label: "Présent" },
  { value: "absent", label: "Absent" },
  { value: "retard", label: "Retard" },
  { value: "absence_justifiee", label: "Absence justifiée" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function computeHeures(debut: string, fin: string): number | null {
  if (!debut || !fin) return null;
  const [h1, m1] = debut.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  const minutes = h2 * 60 + m2 - (h1 * 60 + m1);
  if (minutes <= 0) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

export default function Presences() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "editor";

  const [date, setDate] = useState(todayISO());
  const [apprenants, setApprenants] = useState<Apprenant[]>([]);
  const [presences, setPresences] = useState<Record<string, Presence>>({});
  const [totaux, setTotaux] = useState<TotauxApprenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [searchTotaux, setSearchTotaux] = useState("");

  async function loadApprenantsEtPresences() {
    setLoading(true);
    const [{ data: apps }, { data: pres }] = await Promise.all([
      supabase.from("apprenants").select("*").eq("actif", true).order("nom_complet"),
      supabase.from("presences").select("*").eq("date", date),
    ]);
    setApprenants((apps as Apprenant[]) ?? []);
    const map: Record<string, Presence> = {};
    ((pres as Presence[]) ?? []).forEach((p) => (map[p.apprenant_id] = p));
    setPresences(map);
    setLoading(false);
  }

  async function loadTotaux() {
    const { data } = await supabase
      .from("vue_totaux_apprenants")
      .select("*")
      .order("nom_complet");
    setTotaux((data as TotauxApprenant[]) ?? []);
  }

  useEffect(() => {
    loadApprenantsEtPresences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    loadTotaux();
    const channel = supabase
      .channel("presences-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "presences" }, () => {
        loadTotaux();
        loadApprenantsEtPresences();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upsertPresence(apprenantId: string, patch: Partial<Presence>) {
    const current: Presence =
      presences[apprenantId] ??
      ({
        id: "",
        apprenant_id: apprenantId,
        date,
        statut: "present",
        heure_debut: null,
        heure_fin: null,
        heures: 0,
        commentaire: null,
        created_at: "",
        created_by: null,
      } as Presence);

    const updated = { ...current, ...patch };

    // Calcul automatique des heures si les deux horaires sont renseignés
    if (
      (patch.heure_debut !== undefined || patch.heure_fin !== undefined) &&
      updated.heure_debut &&
      updated.heure_fin
    ) {
      const calc = computeHeures(updated.heure_debut, updated.heure_fin);
      if (calc !== null) updated.heures = calc;
    }

    setPresences((prev) => ({ ...prev, [apprenantId]: updated }));

    const { data } = await supabase
      .from("presences")
      .upsert(
        {
          apprenant_id: apprenantId,
          date,
          statut: updated.statut,
          heure_debut: updated.heure_debut || null,
          heure_fin: updated.heure_fin || null,
          heures: updated.heures ?? 0,
          commentaire: updated.commentaire || null,
          created_by: profile?.id,
        },
        { onConflict: "apprenant_id,date" }
      )
      .select()
      .single();

    if (data) {
      setPresences((prev) => ({ ...prev, [apprenantId]: data as Presence }));
      setSavedIds((s) => ({ ...s, [apprenantId]: true }));
      setTimeout(() => setSavedIds((s) => ({ ...s, [apprenantId]: false })), 1500);
    }
  }

  const totauxFiltres = useMemo(
    () =>
      totaux.filter((t) =>
        t.nom_complet.toLowerCase().includes(searchTotaux.toLowerCase())
      ),
    [totaux, searchTotaux]
  );

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-900">Feuille de présence</h1>
          <input
            type="date"
            className="input max-w-xs"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="card overflow-x-auto p-0">
          {loading ? (
            <p className="p-4 text-sm text-slate-400">Chargement...</p>
          ) : apprenants.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">Aucun apprenant actif.</p>
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Apprenant</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Heure début</th>
                  <th className="px-3 py-2">Heure fin</th>
                  <th className="px-3 py-2">Heures</th>
                  <th className="px-3 py-2">Commentaire</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {apprenants.map((a) => {
                  const p = presences[a.id];
                  return (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">{a.nom_complet}</td>
                      <td className="px-3 py-2">
                        <select
                          className="input"
                          disabled={!canEdit}
                          value={p?.statut ?? "present"}
                          onChange={(e) =>
                            upsertPresence(a.id, { statut: e.target.value as Presence["statut"] })
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
                          type="time"
                          className="input"
                          disabled={!canEdit}
                          defaultValue={p?.heure_debut ?? ""}
                          onBlur={(e) => upsertPresence(a.id, { heure_debut: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          className="input"
                          disabled={!canEdit}
                          defaultValue={p?.heure_fin ?? ""}
                          onBlur={(e) => upsertPresence(a.id, { heure_fin: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          className="input w-20"
                          disabled={!canEdit}
                          value={p?.heures ?? 0}
                          onChange={(e) =>
                            upsertPresence(a.id, { heures: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input"
                          disabled={!canEdit}
                          defaultValue={p?.commentaire ?? ""}
                          onBlur={(e) => upsertPresence(a.id, { commentaire: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {savedIds[a.id] && <span className="text-green-600">✓</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <RoleGuard allow={["viewer"]}>
          <p className="mt-2 text-xs text-slate-400">
            Lecture seule — contactez un administrateur pour modifier la présence.
          </p>
        </RoleGuard>
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Total jours et heures par apprenant
          </h2>
          <input
            className="input max-w-xs"
            placeholder="Rechercher un nom..."
            value={searchTotaux}
            onChange={(e) => setSearchTotaux(e.target.value)}
          />
        </div>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Apprenant</th>
                <th className="px-4 py-2">Groupe / Mois</th>
                <th className="px-4 py-2">Jours de présence</th>
                <th className="px-4 py-2">Total heures</th>
              </tr>
            </thead>
            <tbody>
              {totauxFiltres.map((t) => (
                <tr key={t.apprenant_id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{t.nom_complet}</td>
                  <td className="px-4 py-2 text-slate-600">{t.groupe || "—"}</td>
                  <td className="px-4 py-2">{t.total_jours_presence}</td>
                  <td className="px-4 py-2">{Number(t.total_heures).toFixed(2)} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Calculé automatiquement à partir de la feuille de présence (mis à jour en direct).
        </p>
      </div>
    </div>
  );
}
