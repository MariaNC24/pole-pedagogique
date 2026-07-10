import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Apprenant, Groupe } from "../types";

const JOURS_AVANT_PURGE = 15;

function joursRestants(deletedAt: string) {
  const deleted = new Date(deletedAt).getTime();
  const limite = deleted + JOURS_AVANT_PURGE * 24 * 60 * 60 * 1000;
  const restant = Math.ceil((limite - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, restant);
}

export default function Corbeille() {
  const [apprenants, setApprenants] = useState<Apprenant[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [loading, setLoading] = useState(true);

  async function purgerEtCharger() {
    setLoading(true);

    const limite = new Date(Date.now() - JOURS_AVANT_PURGE * 24 * 60 * 60 * 1000).toISOString();

    // Purge automatique des éléments supprimés depuis plus de 15 jours,
    // faite à chaque ouverture de cette page (pas besoin de tâche planifiée).
    await Promise.all([
      supabase.from("apprenants").delete().not("deleted_at", "is", null).lt("deleted_at", limite),
      supabase.from("groupes").delete().not("deleted_at", "is", null).lt("deleted_at", limite),
    ]);

    const [{ data: apps }, { data: gr }] = await Promise.all([
      supabase.from("apprenants").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
      supabase.from("groupes").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    ]);
    setApprenants((apps as Apprenant[]) ?? []);
    setGroupes((gr as Groupe[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    purgerEtCharger();
  }, []);

  async function restaurerApprenant(a: Apprenant) {
    await supabase.from("apprenants").update({ deleted_at: null }).eq("id", a.id);
    purgerEtCharger();
  }

  async function supprimerDefinitivementApprenant(a: Apprenant) {
    if (!confirm(`Supprimer définitivement "${a.nom_complet}" ? Impossible à annuler.`)) return;
    await supabase.from("apprenants").delete().eq("id", a.id);
    purgerEtCharger();
  }

  async function restaurerGroupe(g: Groupe) {
    await supabase.from("groupes").update({ deleted_at: null }).eq("id", g.id);
    purgerEtCharger();
  }

  async function supprimerDefinitivementGroupe(g: Groupe) {
    if (!confirm(`Supprimer définitivement le groupe "${g.nom}" ? Impossible à annuler.`)) return;
    await supabase.from("groupes").delete().eq("id", g.id);
    purgerEtCharger();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Corbeille</h1>
        <p className="text-sm text-slate-500">
          Les éléments supprimés restent ici 15 jours avant d'être effacés définitivement.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : (
        <>
          <div>
            <h2 className="mb-3 font-medium text-slate-800">Apprenants</h2>
            {apprenants.length === 0 ? (
              <p className="text-sm text-slate-400">Corbeille vide.</p>
            ) : (
              <div className="card overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Nom</th>
                      <th className="px-4 py-2">Supprimé le</th>
                      <th className="px-4 py-2">Suppression définitive dans</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {apprenants.map((a) => (
                      <tr key={a.id} className="border-t border-slate-100">
                        <td className="px-4 py-2 font-medium text-slate-800">{a.nom_complet}</td>
                        <td className="px-4 py-2 text-slate-600">
                          {a.deleted_at ? new Date(a.deleted_at).toLocaleDateString("fr-FR") : "—"}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {a.deleted_at ? `${joursRestants(a.deleted_at)} jour(s)` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            className="mr-3 text-brand-600 hover:underline"
                            onClick={() => restaurerApprenant(a)}
                          >
                            Restaurer
                          </button>
                          <button
                            className="text-red-500 hover:underline"
                            onClick={() => supprimerDefinitivementApprenant(a)}
                          >
                            Supprimer définitivement
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-3 font-medium text-slate-800">Groupes</h2>
            {groupes.length === 0 ? (
              <p className="text-sm text-slate-400">Corbeille vide.</p>
            ) : (
              <div className="card overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Nom</th>
                      <th className="px-4 py-2">Supprimé le</th>
                      <th className="px-4 py-2">Suppression définitive dans</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {groupes.map((g) => (
                      <tr key={g.id} className="border-t border-slate-100">
                        <td className="px-4 py-2 font-medium text-slate-800">{g.nom}</td>
                        <td className="px-4 py-2 text-slate-600">
                          {g.deleted_at ? new Date(g.deleted_at).toLocaleDateString("fr-FR") : "—"}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {g.deleted_at ? `${joursRestants(g.deleted_at)} jour(s)` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            className="mr-3 text-brand-600 hover:underline"
                            onClick={() => restaurerGroupe(g)}
                          >
                            Restaurer
                          </button>
                          <button
                            className="text-red-500 hover:underline"
                            onClick={() => supprimerDefinitivementGroupe(g)}
                          >
                            Supprimer définitivement
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
