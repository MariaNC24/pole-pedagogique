import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import type { Apprenant, SuiviExamen, TotauxApprenant } from "../types";

function joursRestants(dateStr: string): number {
  const cible = new Date(dateStr);
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  cible.setHours(0, 0, 0, 0);
  return Math.round((cible.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
}

export default function Examen() {
  const { profile } = useAuth();
  const canEditExamen = profile?.role === "admin" || profile?.role === "pole_administratif";
  const canEditApprenants = profile?.role === "admin" || profile?.role === "editor";

  const [apprenants, setApprenants] = useState<Apprenant[]>([]);
  const [totaux, setTotaux] = useState<TotauxApprenant[]>([]);
  const [suivis, setSuivis] = useState<SuiviExamen[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formResultat, setFormResultat] = useState<Record<string, { niveau: string; date: string }>>({});

  async function load() {
    setLoading(true);
    const [{ data: apps }, { data: tot }, { data: sv }] = await Promise.all([
      supabase.from("apprenants").select("*").is("deleted_at", null).eq("actif", true).order("nom_complet"),
      supabase.from("vue_totaux_apprenants").select("*"),
      supabase.from("suivi_examen").select("*"),
    ]);
    setApprenants((apps as Apprenant[]) ?? []);
    setTotaux((tot as TotauxApprenant[]) ?? []);
    setSuivis((sv as SuiviExamen[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("examen-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "suivi_examen" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "apprenants" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totauxParApprenant = useMemo(() => {
    const map: Record<string, TotauxApprenant> = {};
    totaux.forEach((t) => (map[t.apprenant_id] = t));
    return map;
  }, [totaux]);

  const suiviParApprenant = useMemo(() => {
    const map: Record<string, SuiviExamen> = {};
    suivis.forEach((s) => (map[s.apprenant_id] = s));
    return map;
  }, [suivis]);

  const apprenantsFiltres = useMemo(
    () => apprenants.filter((a) => a.nom_complet.toLowerCase().includes(search.toLowerCase())),
    [apprenants, search]
  );

  const alertesMiParcours = apprenantsFiltres.filter((a) => {
    const pct = totauxParApprenant[a.id]?.pourcentage_avancement;
    return pct != null && pct >= 50 && !a.test_mi_parcours_fait;
  });

  const alertesFinParcours = apprenantsFiltres.filter((a) => {
    const pct = totauxParApprenant[a.id]?.pourcentage_avancement;
    return pct != null && pct >= 95 && !a.test_fin_parcours_fait;
  });

  const attenteExamen = apprenantsFiltres.filter((a) => {
    const pct = totauxParApprenant[a.id]?.pourcentage_avancement;
    const suivi = suiviParApprenant[a.id];
    return pct != null && pct >= 100 && (!suivi || suivi.statut === "attente");
  });

  const certificationsObtenues = apprenantsFiltres.filter((a) => suiviParApprenant[a.id]?.statut === "obtenu");

  const alertesTitreSejour = apprenantsFiltres
    .filter((a) => a.date_expiration_titre_sejour)
    .map((a) => ({ a, jours: joursRestants(a.date_expiration_titre_sejour as string) }))
    .filter((x) => x.jours <= 60)
    .sort((x, y) => x.jours - y.jours);

  async function marquerFait(a: Apprenant, champ: "test_mi_parcours_fait" | "test_fin_parcours_fait") {
    await supabase.from("apprenants").update({ [champ]: true }).eq("id", a.id);
    load();
  }

  async function updateSuivi(apprenantId: string, patch: Partial<SuiviExamen>) {
    const existing = suiviParApprenant[apprenantId];
    if (existing) {
      await supabase
        .from("suivi_examen")
        .update({ ...patch, updated_by: profile?.id })
        .eq("apprenant_id", apprenantId);
    } else {
      await supabase.from("suivi_examen").insert({
        apprenant_id: apprenantId,
        statut: "attente",
        ...patch,
        updated_by: profile?.id,
      });
    }
    load();
  }

  async function enregistrerResultat(apprenantId: string) {
    const f = formResultat[apprenantId];
    if (!f?.niveau) return;
    await updateSuivi(apprenantId, {
      statut: "obtenu",
      niveau_obtenu: f.niveau,
      date_obtention: f.date || new Date().toISOString().slice(0, 10),
    });
    setFormResultat((s) => ({ ...s, [apprenantId]: { niveau: "", date: "" } }));
  }

  return (
    <div className="space-y-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Examen</h1>
          <p className="text-sm text-slate-500">
            Suivi des tests mi-parcours / fin de parcours, des demandes d'examen et des titres de
            séjour. Éditable par les administrateurs et le pôle administratif.
          </p>
        </div>
        <input
          className="input max-w-xs"
          placeholder="Rechercher un apprenant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : (
        <>
          <section className="card">
            <h2 className="mb-3 font-medium text-slate-800">🟡 Test de mi-parcours à faire (≥ 50%)</h2>
            {alertesMiParcours.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune alerte.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {alertesMiParcours.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/apprenants/${a.id}`} className="text-brand-600 hover:underline">
                      {a.nom_complet}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="badge bg-amber-50 text-amber-700">
                        {totauxParApprenant[a.id]?.pourcentage_avancement}% réalisé
                      </span>
                      {canEditApprenants && (
                        <button
                          className="text-xs text-slate-500 hover:underline"
                          onClick={() => marquerFait(a, "test_mi_parcours_fait")}
                        >
                          Marquer comme fait
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 font-medium text-slate-800">🟠 Test de fin de parcours à faire (≥ 95%)</h2>
            {alertesFinParcours.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune alerte.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {alertesFinParcours.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/apprenants/${a.id}`} className="text-brand-600 hover:underline">
                      {a.nom_complet}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="badge bg-orange-50 text-orange-700">
                        {totauxParApprenant[a.id]?.pourcentage_avancement}% réalisé
                      </span>
                      {canEditApprenants && (
                        <button
                          className="text-xs text-slate-500 hover:underline"
                          onClick={() => marquerFait(a, "test_fin_parcours_fait")}
                        >
                          Marquer comme fait
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 font-medium text-slate-800">📝 Attente date d'examen (100% réalisé)</h2>
            {attenteExamen.length === 0 ? (
              <p className="text-sm text-slate-400">Aucun apprenant en attente d'examen.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Apprenant</th>
                      <th className="px-3 py-2">Date/jour souhaité(e)</th>
                      <th className="px-3 py-2">Commentaire</th>
                      <th className="px-3 py-2">Résultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attenteExamen.map((a) => {
                      const suivi = suiviParApprenant[a.id];
                      const f = formResultat[a.id] ?? { niveau: "", date: "" };
                      return (
                        <tr key={a.id} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2 font-medium text-slate-800">
                            <Link to={`/apprenants/${a.id}`} className="hover:underline">
                              {a.nom_complet}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              className="input"
                              disabled={!canEditExamen}
                              defaultValue={suivi?.date_souhaitee ?? ""}
                              onBlur={(e) => updateSuivi(a.id, { date_souhaitee: e.target.value || null })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="input"
                              disabled={!canEditExamen}
                              defaultValue={suivi?.commentaire ?? ""}
                              onBlur={(e) => updateSuivi(a.id, { commentaire: e.target.value || null })}
                              placeholder="Notes, RDV pris..."
                            />
                          </td>
                          <td className="px-3 py-2">
                            {canEditExamen ? (
                              <div className="flex flex-wrap items-center gap-1">
                                <input
                                  className="input w-20"
                                  placeholder="Niveau"
                                  value={f.niveau}
                                  onChange={(e) =>
                                    setFormResultat((s) => ({ ...s, [a.id]: { ...f, niveau: e.target.value } }))
                                  }
                                />
                                <input
                                  type="date"
                                  className="input"
                                  value={f.date}
                                  onChange={(e) =>
                                    setFormResultat((s) => ({ ...s, [a.id]: { ...f, date: e.target.value } }))
                                  }
                                />
                                <button
                                  className="btn-secondary text-xs"
                                  onClick={() => enregistrerResultat(a.id)}
                                  disabled={!f.niveau}
                                >
                                  Certif. obtenue
                                </button>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 font-medium text-slate-800">✅ Certifications obtenues</h2>
            {certificationsObtenues.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune certification enregistrée pour l'instant.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Apprenant</th>
                      <th className="px-3 py-2">Niveau obtenu</th>
                      <th className="px-3 py-2">Date d'obtention</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificationsObtenues.map((a) => {
                      const s = suiviParApprenant[a.id];
                      return (
                        <tr key={a.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium text-slate-800">
                            <Link to={`/apprenants/${a.id}`} className="hover:underline">
                              {a.nom_complet}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            <span className="badge bg-green-50 text-green-700">{s?.niveau_obtenu}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {s?.date_obtention ? new Date(s.date_obtention).toLocaleDateString("fr-FR") : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 font-medium text-slate-800">🛂 Titres de séjour — expiration sous 2 mois</h2>
            {alertesTitreSejour.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune alerte.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {alertesTitreSejour.map(({ a, jours }) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/apprenants/${a.id}`} className="text-brand-600 hover:underline">
                      {a.nom_complet}
                    </Link>
                    <span className={`badge ${jours < 0 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                      {jours < 0
                        ? `Expiré depuis ${Math.abs(jours)} jour(s)`
                        : `Expire le ${new Date(a.date_expiration_titre_sejour as string).toLocaleDateString("fr-FR")} (dans ${jours} jour(s))`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
