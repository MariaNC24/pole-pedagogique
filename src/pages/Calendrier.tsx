import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import type { Evaluation, Presence } from "../types";

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

const PRESENCE_LABELS: Record<string, string> = {
  present: "Présent",
  absent: "Absent",
  retard: "Retard",
  absence_justifiee: "Absence justifiée",
};

const PRESENCE_COLORS: Record<string, string> = {
  present: "text-green-700",
  absent: "text-red-600",
  retard: "text-amber-600",
  absence_justifiee: "text-slate-500",
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
  const [presences, setPresences] = useState<(Presence & { nom_complet: string })[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const monthStart = cursor;
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  useEffect(() => {
    async function load() {
      const [{ data: evals }, { data: pres }] = await Promise.all([
        supabase
          .from("evaluations")
          .select("*, apprenants(nom_complet)")
          .gte("date_prevue", toISO(monthStart))
          .lte("date_prevue", toISO(monthEnd)),
        supabase
          .from("presences")
          .select("*, apprenants(nom_complet)")
          .gte("date", toISO(monthStart))
          .lte("date", toISO(monthEnd)),
      ]);
      setEvaluations(
        ((evals as any[]) ?? []).map((e) => ({ ...e, nom_complet: e.apprenants?.nom_complet ?? "—" }))
      );
      setPresences(
        ((pres as any[]) ?? []).map((p) => ({ ...p, nom_complet: p.apprenants?.nom_complet ?? "—" }))
      );
      setSelectedDate(null);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const evalsByDay = useMemo(() => {
    const map: Record<string, (Evaluation & { nom_complet: string })[]> = {};
    evaluations.forEach((e) => {
      if (!e.date_prevue) return;
      map[e.date_prevue] = map[e.date_prevue] ?? [];
      map[e.date_prevue].push(e);
    });
    return map;
  }, [evaluations]);

  const presencesByDay = useMemo(() => {
    const map: Record<string, (Presence & { nom_complet: string })[]> = {};
    presences.forEach((p) => {
      map[p.date] = map[p.date] ?? [];
      map[p.date].push(p);
    });
    return map;
  }, [presences]);

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
  const selectedEvals = selectedDate ? evalsByDay[selectedDate] ?? [] : [];
  const selectedPresences = selectedDate ? presencesByDay[selectedDate] ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Calendrier</h1>
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
            const evs = date ? evalsByDay[iso] ?? [] : [];
            const pres = date ? presencesByDay[iso] ?? [] : [];
            const nbPresents = pres.filter((p) => p.statut === "present").length;
            return (
              <button
                key={i}
                type="button"
                disabled={!date}
                onClick={() => date && setSelectedDate(iso)}
                className={`min-h-[90px] rounded-lg border p-1 text-left ${
                  date
                    ? iso === selectedDate
                      ? "border-brand-500 bg-brand-50 ring-1 ring-brand-300"
                      : iso === todayISO
                      ? "border-brand-300 bg-brand-50"
                      : "border-slate-100 bg-white hover:border-brand-200"
                    : "border-transparent"
                }`}
              >
                {date && (
                  <>
                    <p className="mb-1 text-right text-xs text-slate-400">{date.getDate()}</p>
                    <div className="space-y-1">
                      {evs.slice(0, 2).map((e) => (
                        <span
                          key={e.id}
                          className={`block truncate rounded px-1 py-0.5 ${
                            STATUT_COLORS[e.statut ?? ""] ?? "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {e.nom_complet}
                        </span>
                      ))}
                      {evs.length > 2 && (
                        <p className="text-[10px] text-slate-400">+{evs.length - 2} éval.</p>
                      )}
                      {pres.length > 0 && (
                        <span className="mt-1 block truncate rounded bg-brand-100 px-1 py-0.5 text-brand-700">
                          📋 Séance · {nbPresents}/{pres.length} présent(s)
                        </span>
                      )}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {Object.entries(STATUT_COLORS).map(([label, cls]) => (
          <span key={label} className={`badge ${cls}`}>
            {label}
          </span>
        ))}
        <span className="badge bg-brand-100 text-brand-700">📋 Séance de cours</span>
      </div>

      {selectedDate && (
        <div className="card">
          <h2 className="mb-3 font-medium text-slate-800">
            {new Date(selectedDate).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h2>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-600">Évaluations prévues</h3>
              {selectedEvals.length === 0 ? (
                <p className="text-sm text-slate-400">Aucune évaluation ce jour-là.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {selectedEvals.map((e) => (
                    <li key={e.id} className="flex items-center justify-between">
                      <Link to={`/apprenants/${e.apprenant_id}`} className="text-brand-600 hover:underline">
                        {e.nom_complet}
                      </Link>
                      <span className={`badge ${STATUT_COLORS[e.statut ?? ""] ?? "bg-slate-100 text-slate-600"}`}>
                        {e.statut}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-600">
                Présence de la séance ({selectedPresences.length} apprenant(s))
              </h3>
              {selectedPresences.length === 0 ? (
                <p className="text-sm text-slate-400">Aucune présence enregistrée ce jour-là.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {selectedPresences.map((p) => (
                    <li key={p.id} className="flex items-center justify-between">
                      <Link to={`/apprenants/${p.apprenant_id}`} className="text-brand-600 hover:underline">
                        {p.nom_complet}
                      </Link>
                      <span className={PRESENCE_COLORS[p.statut]}>{PRESENCE_LABELS[p.statut]}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/presences"
                className="mt-3 inline-block text-xs text-brand-600 hover:underline"
              >
                Modifier la feuille de présence →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
