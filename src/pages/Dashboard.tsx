import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import RoleGuard from "../components/RoleGuard";
import type { Apprenant, Evaluation, Parametres, Presence } from "../types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

interface AlerteAbsence {
  apprenant: Apprenant;
  nbAbsences: number;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    apprenantsActifs: 0,
    evaluationsAFaire: 0,
    evaluationsEnCours: 0,
    presencesAujourdhui: 0,
  });
  const [alertesAbsences, setAlertesAbsences] = useState<AlerteAbsence[]>([]);
  const [evaluationsRetard, setEvaluationsRetard] = useState<(Evaluation & { nom_complet: string })[]>([]);
  const [seuil, setSeuil] = useState(3);
  const [savingSeuil, setSavingSeuil] = useState(false);

  async function loadStats() {
    const [{ count: apprenantsActifs }, { count: aFaire }, { count: enCours }, { count: presencesJour }] =
      await Promise.all([
        supabase.from("apprenants").select("*", { count: "exact", head: true }).eq("actif", true),
        supabase.from("evaluations").select("*", { count: "exact", head: true }).eq("statut", "À faire"),
        supabase.from("evaluations").select("*", { count: "exact", head: true }).eq("statut", "En cours"),
        supabase
          .from("presences")
          .select("*", { count: "exact", head: true })
          .eq("date", todayISO())
          .eq("statut", "present"),
      ]);
    setStats({
      apprenantsActifs: apprenantsActifs ?? 0,
      evaluationsAFaire: aFaire ?? 0,
      evaluationsEnCours: enCours ?? 0,
      presencesAujourdhui: presencesJour ?? 0,
    });
  }

  async function loadAlertes() {
    const { data: param } = await supabase.from("parametres").select("*").eq("id", 1).single();
    const seuilActuel = (param as Parametres)?.seuil_absences ?? 3;
    setSeuil(seuilActuel);

    const [{ data: apps }, { data: absences }, { data: evals }] = await Promise.all([
      supabase.from("apprenants").select("*").eq("actif", true),
      supabase.from("presences").select("apprenant_id").eq("statut", "absent"),
      supabase
        .from("evaluations")
        .select("*, apprenants(nom_complet)")
        .lt("date_prevue", todayISO())
        .neq("statut", "Fait"),
    ]);

    const apprenantsMap: Record<string, Apprenant> = {};
    ((apps as Apprenant[]) ?? []).forEach((a) => (apprenantsMap[a.id] = a));

    const counts: Record<string, number> = {};
    ((absences as { apprenant_id: string }[]) ?? []).forEach((p) => {
      counts[p.apprenant_id] = (counts[p.apprenant_id] ?? 0) + 1;
    });

    const alertes: AlerteAbsence[] = Object.entries(counts)
      .filter(([, n]) => n >= seuilActuel)
      .map(([apprenantId, n]) => ({ apprenant: apprenantsMap[apprenantId], nbAbsences: n }))
      .filter((a) => a.apprenant);
    setAlertesAbsences(alertes);

    setEvaluationsRetard(
      ((evals as any[]) ?? []).map((e) => ({ ...e, nom_complet: e.apprenants?.nom_complet ?? "—" }))
    );
  }

  useEffect(() => {
    loadStats();
    loadAlertes();
  }, []);

  async function updateSeuil(value: number) {
    setSeuil(value);
    setSavingSeuil(true);
    await supabase.from("parametres").update({ seuil_absences: value, updated_by: profile?.id }).eq("id", 1);
    setSavingSeuil(false);
    loadAlertes();
  }

  const cards = [
    { label: "Apprenants actifs", value: stats.apprenantsActifs, to: "/apprenants" },
    { label: "Évaluations à faire", value: stats.evaluationsAFaire, to: "/evaluations" },
    { label: "Évaluations en cours", value: stats.evaluationsEnCours, to: "/evaluations" },
    { label: "Présents aujourd'hui", value: stats.presencesAujourdhui, to: "/presences" },
  ];

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-slate-900">
        Bonjour {profile?.prenom ?? ""} 👋
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Vue d'ensemble du suivi des apprenants du pôle pédagogique.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="card transition hover:shadow-md">
            <p className="text-2xl font-semibold text-brand-600">{c.value}</p>
            <p className="mt-1 text-sm text-slate-500">{c.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium text-slate-800">
              ⚠️ Alertes d'assiduité ({seuil}+ absences)
            </h2>
            <RoleGuard allow={["admin"]}>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                Seuil
                <input
                  type="number"
                  min={1}
                  className="input w-16 py-1"
                  value={seuil}
                  disabled={savingSeuil}
                  onChange={(e) => updateSeuil(Number(e.target.value))}
                />
              </div>
            </RoleGuard>
          </div>
          {alertesAbsences.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune alerte pour l'instant.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {alertesAbsences.map((a) => (
                <li key={a.apprenant.id} className="flex justify-between">
                  <Link to={`/apprenants/${a.apprenant.id}`} className="text-brand-600 hover:underline">
                    {a.apprenant.nom_complet}
                  </Link>
                  <span className="text-red-600">{a.nbAbsences} absence(s)</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-medium text-slate-800">📅 Évaluations en retard</h2>
          {evaluationsRetard.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune évaluation en retard.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {evaluationsRetard.map((e) => (
                <li key={e.id} className="flex justify-between">
                  <span>{e.nom_complet}</span>
                  <span className="text-amber-600">prévue le {e.date_prevue}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
