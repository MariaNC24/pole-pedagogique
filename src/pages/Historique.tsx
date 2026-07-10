import { Fragment, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import type { AuditLogEntry } from "../types";

const TABLES = ["apprenants", "evaluations", "presences", "groupes"];
const ACTION_LABELS: Record<string, string> = {
  insert: "Création",
  update: "Modification",
  delete: "Suppression",
};

interface Entry extends AuditLogEntry {
  profiles?: { nom: string | null; prenom: string | null; email: string } | null;
}

export default function Historique() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [table, setTable] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from("audit_log")
        .select("*, profiles(nom, prenom, email)")
        .order("modifie_at", { ascending: false })
        .limit(200);
      if (table) query = query.eq("table_cible", table);
      const { data } = await query;
      setEntries((data as Entry[]) ?? []);
      setLoading(false);
    }
    load();
  }, [table]);

  if (!profile?.is_owner) {
    return (
      <p className="text-sm text-slate-500">
        Cette page est réservée. Contactez le propriétaire du site si vous pensez devoir y avoir
        accès.
      </p>
    );
  }

  function resume(e: Entry) {
    const nom = e.donnees_apres?.["nom_complet"] ?? e.donnees_avant?.["nom_complet"];
    return typeof nom === "string" ? nom : e.ligne_id;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Historique des modifications</h1>
          <p className="text-sm text-slate-500">Visible uniquement par vous.</p>
        </div>
        <select className="input max-w-xs" value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="">Toutes les tables</option>
          {TABLES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <p className="p-4 text-sm text-slate-400">Chargement...</p>
        ) : entries.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Aucune modification enregistrée.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Table</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Élément</th>
                <th className="px-4 py-2">Par</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <Fragment key={e.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-500">
                      {new Date(e.modifie_at).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-4 py-2">{e.table_cible}</td>
                    <td className="px-4 py-2">
                      <span className="badge bg-slate-100 text-slate-700">
                        {ACTION_LABELS[e.action] ?? e.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{resume(e)}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {e.profiles ? `${e.profiles.prenom ?? ""} ${e.profiles.nom ?? ""}`.trim() : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        className="text-brand-600 hover:underline"
                        onClick={() => setOpenId(openId === e.id ? null : e.id)}
                      >
                        {openId === e.id ? "Masquer" : "Détails"}
                      </button>
                    </td>
                  </tr>
                  {openId === e.id && (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={6} className="px-4 py-3">
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-600">
                          {JSON.stringify(
                            { avant: e.donnees_avant, apres: e.donnees_apres },
                            null,
                            2
                          )}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
