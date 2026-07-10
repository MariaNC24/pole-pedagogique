import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Apprenant, Evaluation, Groupe, TotauxApprenant } from "../types";

const CECRL_NIVEAUX: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
const CECRL_LABELS = ["", "A1", "A2", "B1", "B2", "C1", "C2"];

interface Ligne {
  cle: string;
  nbApprenants: number;
  tauxReussite: number | null;
  cecrlMoyen: string;
  assiduiteMoyenne: number;
}

function agregerParCle(
  apprenants: Apprenant[],
  evaluations: Evaluation[],
  totaux: Record<string, TotauxApprenant>,
  clefDe: (a: Apprenant) => string
): Ligne[] {
  const groupes: Record<string, Apprenant[]> = {};
  apprenants.forEach((a) => {
    const cle = clefDe(a) || "Non renseigné";
    groupes[cle] = groupes[cle] ?? [];
    groupes[cle].push(a);
  });

  return Object.entries(groupes)
    .map(([cle, apps]) => {
      const ids = new Set(apps.map((a) => a.id));
      const evalsGroupe = evaluations.filter((e) => ids.has(e.apprenant_id));
      const evalsAvecObjectif = evalsGroupe.filter(
        (e) => e.objectif_atteint === "Oui" || e.objectif_atteint === "Non"
      );
      const tauxReussite =
        evalsAvecObjectif.length > 0
          ? Math.round(
              (evalsGroupe.filter((e) => e.objectif_atteint === "Oui").length /
                evalsAvecObjectif.length) *
                100
            )
          : null;

      const niveaux = evalsGroupe
        .map((e) => (e.niveau_cecrl ? CECRL_NIVEAUX[e.niveau_cecrl.trim().toUpperCase()] : undefined))
        .filter((n): n is number => n !== undefined);
      const cecrlMoyen =
        niveaux.length > 0
          ? CECRL_LABELS[Math.round(niveaux.reduce((s, n) => s + n, 0) / niveaux.length)]
          : "—";

      const heures = apps.map((a) => Number(totaux[a.id]?.total_heures ?? 0));
      const assiduiteMoyenne =
        heures.length > 0 ? Math.round((heures.reduce((s, h) => s + h, 0) / heures.length) * 10) / 10 : 0;

      return { cle, nbApprenants: apps.length, tauxReussite, cecrlMoyen, assiduiteMoyenne };
    })
    .sort((a, b) => b.nbApprenants - a.nbApprenants);
}

export default function Statistiques() {
  const [apprenants, setApprenants] = useState<Apprenant[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [totaux, setTotaux] = useState<Record<string, TotauxApprenant>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: apps }, { data: gr }, { data: evals }, { data: tot }] = await Promise.all([
        supabase.from("apprenants").select("*").eq("actif", true),
        supabase.from("groupes").select("*"),
        supabase.from("evaluations").select("*"),
        supabase.from("vue_totaux_apprenants").select("*"),
      ]);
      setApprenants((apps as Apprenant[]) ?? []);
      setGroupes((gr as Groupe[]) ?? []);
      setEvaluations((evals as Evaluation[]) ?? []);
      const map: Record<string, TotauxApprenant> = {};
      ((tot as TotauxApprenant[]) ?? []).forEach((t) => (map[t.apprenant_id] = t));
      setTotaux(map);
      setLoading(false);
    }
    load();
  }, []);

  const groupeNom = useMemo(() => {
    const map: Record<string, string> = {};
    groupes.forEach((g) => (map[g.id] = g.nom));
    return map;
  }, [groupes]);

  const parGroupe = useMemo(
    () =>
      agregerParCle(apprenants, evaluations, totaux, (a) =>
        a.groupe_id ? groupeNom[a.groupe_id] ?? a.groupe ?? "" : a.groupe ?? ""
      ),
    [apprenants, evaluations, totaux, groupeNom]
  );

  const parFormateur = useMemo(
    () => agregerParCle(apprenants, evaluations, totaux, (a) => a.formateur ?? ""),
    [apprenants, evaluations, totaux]
  );

  function renderTable(titre: string, lignes: Ligne[], colonneNom: string) {
    return (
      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-2 font-medium text-slate-800">{titre}</h2>
        {lignes.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-slate-400">Pas encore de données.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">{colonneNom}</th>
                <th className="px-4 py-2">Apprenants</th>
                <th className="px-4 py-2">Taux de réussite</th>
                <th className="px-4 py-2">Niveau CECRL moyen</th>
                <th className="px-4 py-2">Heures moyennes</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.cle} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{l.cle}</td>
                  <td className="px-4 py-2">{l.nbApprenants}</td>
                  <td className="px-4 py-2">{l.tauxReussite !== null ? `${l.tauxReussite}%` : "—"}</td>
                  <td className="px-4 py-2">{l.cecrlMoyen}</td>
                  <td className="px-4 py-2">{l.assiduiteMoyenne} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Statistiques</h1>
      {loading ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : (
        <>
          {renderTable("Par groupe", parGroupe, "Groupe")}
          {renderTable("Par formateur", parFormateur, "Formateur")}
        </>
      )}
      <p className="text-xs text-slate-400">
        Taux de réussite = évaluations avec objectif atteint « Oui » parmi celles renseignées («
        Oui »/« Non »). Niveau CECRL moyen calculé sur les évaluations où le niveau est renseigné
        (A1 à C2).
      </p>
    </div>
  );
}
