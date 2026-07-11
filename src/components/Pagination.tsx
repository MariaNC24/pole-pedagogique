// Pagination simple et réutilisable : numéros de page + flèches précédent/suivant.
// Conçue pour rester légère même avec des milliers de lignes (aucune limite
// technique côté affichage : on ne rend que la page courante).
export default function Pagination({
  page,
  totalItems,
  pageSize,
  onChange,
}: {
  page: number;
  totalItems: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const spread = 2;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - spread && p <= page + spread)) {
      pages.push(p);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 border-t border-slate-100 px-3 py-3">
      <button
        className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Page précédente"
      >
        {"<"}
      </button>
      {pages.map((p, i) => {
        const prev = pages[i - 1];
        const gap = prev !== undefined && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-1">
            {gap && <span className="px-1 text-slate-300">…</span>}
            <button
              className={`min-w-[2rem] rounded-md px-2 py-1 text-sm ${
                p === page
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          </span>
        );
      })}
      <button
        className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Page suivante"
      >
        {">"}
      </button>
    </div>
  );
}
