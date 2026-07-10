import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const navItems = [
  { to: "/", label: "Tableau de bord", roles: ["admin", "editor", "viewer"] },
  { to: "/apprenants", label: "Apprenants", roles: ["admin", "editor", "viewer"] },
  { to: "/groupes", label: "Groupes", roles: ["admin", "editor", "viewer"] },
  { to: "/evaluations", label: "Suivi pédagogique", roles: ["admin", "editor", "viewer"] },
  { to: "/presences", label: "Présences", roles: ["admin", "editor", "viewer"] },
  { to: "/calendrier", label: "Calendrier", roles: ["admin", "editor", "viewer"] },
  { to: "/journal", label: "Journal de suivi", roles: ["admin", "editor", "viewer"] },
  { to: "/statistiques", label: "Statistiques", roles: ["admin", "editor", "viewer"] },
  { to: "/utilisateurs", label: "Équipe", roles: ["admin"] },
  { to: "/historique", label: "Historique", roles: ["admin", "editor", "viewer"], ownerOnly: true },
];

const roleLabels: Record<string, string> = {
  admin: "Administrateur",
  editor: "Éditeur",
  viewer: "Lecteur",
};

export default function Layout() {
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleItems = navItems.filter((item) => {
    if (!profile) return false;
    if (!item.roles.includes(profile.role)) return false;
    if (item.ownerOnly && !profile.is_owner) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              className="rounded-md p-2 hover:bg-slate-100 sm:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
            >
              <span className="block h-0.5 w-5 bg-slate-700" />
              <span className="mt-1 block h-0.5 w-5 bg-slate-700" />
              <span className="mt-1 block h-0.5 w-5 bg-slate-700" />
            </button>
            <span className="font-semibold text-slate-900">Pôle Pédagogique</span>
          </div>

          <div className="flex items-center gap-3">
            {profile && (
              <span className="hidden text-sm text-slate-500 sm:inline">
                {profile.prenom} {profile.nom} ·{" "}
                <span className="badge bg-brand-50 text-brand-700">
                  {roleLabels[profile.role]}
                </span>
              </span>
            )}
            <button onClick={signOut} className="btn-secondary text-sm">
              Déconnexion
            </button>
          </div>
        </div>

        <nav
          className={`${
            menuOpen ? "block" : "hidden"
          } border-t border-slate-100 sm:block`}
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-2 sm:flex-row sm:flex-wrap sm:gap-x-3 sm:gap-y-0 sm:py-0">
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium sm:py-3 ${
                    isActive
                      ? "text-brand-600 sm:border-b-2 sm:border-brand-500"
                      : "text-slate-600 hover:text-brand-600"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
