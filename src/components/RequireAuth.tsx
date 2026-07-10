import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Chargement...
      </div>
    );
  }

  if (!session) return <Navigate to="/connexion" replace />;

  if (profile && !profile.actif) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-slate-500">
        Votre compte a été désactivé. Contactez un administrateur.
      </div>
    );
  }

  return <>{children}</>;
}
