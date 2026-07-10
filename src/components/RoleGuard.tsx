import { ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import type { Role } from "../types";

// Cache visuellement les actions non permises (ex. boutons "modifier") pour
// les viewers. La vraie barrière de sécurité reste les policies RLS côté
// base de données (voir supabase/migrations/0001_init.sql) : même si
// quelqu'un contournait l'interface, la base refuserait l'écriture.
export default function RoleGuard({
  allow,
  children,
  fallback = null,
}: {
  allow: Role[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { profile } = useAuth();
  if (!profile || !allow.includes(profile.role)) return <>{fallback}</>;
  return <>{children}</>;
}
