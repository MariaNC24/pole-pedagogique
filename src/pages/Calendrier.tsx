import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import type { Evaluation } from "../types";

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const STATUT_COLORS: Record<string, string> = {
  "À faire": "bg-slate-100 text-slate-700",
  "En cours": "bg-amber-100 text-amber-700",
  "Fait": "bg-green-100 text-green-700",
  "Reporté": "bg-red-100 text-red-700",
};

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function Calendrier() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [evaluations, setEvaluations] = useState<(Evaluation & { nom_complet: string })[]>([]);

  const monthStart = cursor;
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("evaluations")
        .select("*, apprenants(nom_complet)")
        .gte("date_prevue", toISO(monthStart))
        .lte("date_prevue", toISO(monthEnd));
      setEvaluations(
        ((data as any[]) ?? []).map((e) => ({ ...e, nom_complet: e.apprenants?.nom_complet ?? "—" }))
      );
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const byDay = useMemo(() => {
    const map: Record<string, (Evaluation & { nom_complet: string })[]> = {};
    evaluations.forEach((e) => {
      if (!e.date_prevue) return;
      map[e.date_prevue] = map[e.date_prevue] ?? [];
      map[e.date_prevue].push(e);
    });
    return map;
  }, [evaluations]);

  const cells = useMemo(() => {
    const firstWeekday = (monthStart.getDay() + 6) % 7; // lundi = 0
    const daysInMonth = monthEnd.getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor, monthStart, monthEnd]);

  const todayISO = toISO(new Date());

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Calendrier des évaluations</h1>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            ←
          </button>
          <span className="min-w-[140px] text-center text-sm font-medium">
            {MOIS[cursor.getMonth()]} {cursor.getFullYear()}
          </span>
          <button
            className="btn-secondary"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            →
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto p-2">
        <div className="grid min-w-[700px] grid-cols-7 gap-1 text-xs">
          {JOURS.map((j) => (
            <div key={j} className="px-2 py-1 text-center font-medium text-slate-500">
              {j}
            </div>
          ))}
          {cells.map((date, i) => {
            const iso = date ? toISO(date) : "";
            const evs = date ? byDay[iso] ?? [] : [];
            return (
              <div
                key={i}
                className={`min-h-[90px] rounded-lg border p-1 ${
                  date
                    ? iso === todayISO
                      ? "border-brand-300 bg-brand-50"
                      : "border-slate-100 bg-white"
                    : "border-transparent"
                }`}
              >
                {date && (
                  <>
                    <p className="mb-1 text-right text-xs text-slate-400">{date.getDate()}</p>
                    <div className="space-y-1">
                      {evs.slice(0, 3).map((e) => (
                        <Link
                          key={e.id}
                          to={`/apprenants/${e.apprenant_id}`}
                          className={`block truncate rounded px-1 py-0.5 ${
                            STATUT_COLORS[e.statut ?? ""] ?? "bg-slate-100 text-slate-600"
                          }`}
                          title={`${e.nom_complet} — ${e.type_evaluation ?? ""}`}
                        >
                          {e.nom_complet}
                        </Link>
                      ))}
                      {evs.length > 3 && (
                        <p className="text-[10px] text-slate-400">+{evs.length - 3} autres</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        {Object.entries(STATUT_COLORS).map(([label, cls]) => (
          <span key={label} className={`badge ${cls}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
