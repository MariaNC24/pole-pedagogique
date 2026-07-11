import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import type { Profile, Role } from "../types";

interface Invitation {
  id: string;
  email: string;
  nom: string | null;
  prenom: string | null;
  role: Role;
  invited_at: string;
  accepted: boolean;
}

const roleLabels: Record<Role, string> = {
  admin: "Administrateur",
  editor: "Éditeur",
  viewer: "Lecteur",
  pole_administratif: "Pôle administratif",
};

// supabase-js ne remonte pas automatiquement le message d'erreur détaillé
// renvoyé par une Edge Function en cas de code HTTP non-2xx (juste un message
// générique "Edge Function returned a non-2xx status code"). On va lire
// nous-mêmes le corps de la réponse pour afficher la vraie raison.
async function messageErreurFonction(error: any, data: any, fallback: string): Promise<string> {
  if (data?.error) return data.error;
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch {
      // corps illisible, on retombe sur le message générique ci-dessous
    }
  }
  return error?.message || fallback;
}

export default function Utilisateurs() {
  const { profile: monProfile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  async function load() {
    setLoading(true);
    const [{ data: p }, { data: inv }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at"),
      supabase.from("invitations").select("*").eq("accepted", false).order("invited_at", { ascending: false }),
    ]);
    setProfiles((p as Profile[]) ?? []);
    setInvitations((inv as Invitation[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setMessage(null);

    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: { email, nom, prenom, role },
    });

    setInviting(false);

    if (error || (data as any)?.error) {
      const text = await messageErreurFonction(error, data, "Erreur lors de l'invitation.");
      setMessage({ type: "error", text });
      return;
    }

    setMessage({ type: "success", text: `Invitation envoyée à ${email}.` });
    setNom("");
    setPrenom("");
    setEmail("");
    setRole("viewer");
    load();
  }

  async function updateRole(id: string, newRole: Role) {
    await supabase.from("profiles").update({ role: newRole }).eq("id", id);
    load();
  }

  async function toggleActif(p: Profile) {
    await supabase.from("profiles").update({ actif: !p.actif }).eq("id", p.id);
    load();
  }

  async function supprimerAcces(p: Profile) {
    if (
      !confirm(
        `Supprimer définitivement l'accès de ${p.prenom} ${p.nom} (${p.email}) ? Cette personne ne pourra plus se connecter. Cette action est irréversible.`
      )
    )
      return;
    setDeletingId(p.id);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { userId: p.id },
    });
    setDeletingId(null);
    if (error || (data as any)?.error) {
      const text = await messageErreurFonction(error, data, "Erreur lors de la suppression.");
      alert(text);
      return;
    }
    load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-slate-900">
          Équipe — gestion des accès
        </h1>

        <form onSubmit={handleInvite} className="card mb-6 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Prénom</label>
            <input className="input" required value={prenom} onChange={(e) => setPrenom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Nom</label>
            <input className="input" required value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Adresse e-mail</label>
            <input
              type="email"
              className="input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Rôle</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="viewer">Lecteur (consultation uniquement)</option>
              <option value="editor">Éditeur (peut saisir/modifier)</option>
              <option value="pole_administratif">
                Pôle administratif (consulte tout, modifie seulement les dossiers admin.)
              </option>
              <option value="admin">Administrateur (accès complet)</option>
            </select>
          </div>

          {message && (
            <p
              className={`sm:col-span-2 text-sm ${
                message.type === "success" ? "text-green-600" : "text-red-600"
              }`}
            >
              {message.text}
            </p>
          )}

          <div className="sm:col-span-2">
            <button type="submit" disabled={inviting} className="btn-primary">
              {inviting ? "Envoi..." : "Envoyer l'invitation"}
            </button>
            <p className="mt-2 text-xs text-slate-400">
              La personne recevra un e-mail pour définir son mot de passe : c'est cette étape qui
              valide son compte.
            </p>
          </div>
        </form>
      </div>

      {invitations.length > 0 && (
        <div>
          <h2 className="mb-3 font-medium text-slate-800">Invitations en attente</h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Nom</th>
                  <th className="px-4 py-2">E-mail</th>
                  <th className="px-4 py-2">Rôle</th>
                  <th className="px-4 py-2">Envoyée le</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((i) => (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      {i.prenom} {i.nom}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{i.email}</td>
                    <td className="px-4 py-2">
                      <span className="badge bg-amber-50 text-amber-700">{roleLabels[i.role]}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {new Date(i.invited_at).toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 font-medium text-slate-800">Membres de l'équipe</h2>
        <div className="card overflow-x-auto p-0">
          {loading ? (
            <p className="p-4 text-sm text-slate-400">Chargement...</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Nom</th>
                  <th className="px-4 py-2">E-mail</th>
                  <th className="px-4 py-2">Rôle</th>
                  <th className="px-4 py-2">Statut</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {p.prenom} {p.nom}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{p.email}</td>
                    <td className="px-4 py-2">
                      <select
                        className="input"
                        value={p.role}
                        onChange={(e) => updateRole(p.id, e.target.value as Role)}
                      >
                        <option value="viewer">Lecteur</option>
                        <option value="editor">Éditeur</option>
                        <option value="pole_administratif">Pôle administratif</option>
                        <option value="admin">Administrateur</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`badge ${
                          p.actif ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {p.actif ? "Actif" : "Désactivé"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button className="mr-3 text-slate-500 hover:underline" onClick={() => toggleActif(p)}>
                        {p.actif ? "Désactiver" : "Réactiver"}
                      </button>
                      {monProfile?.id !== p.id && (
                        <button
                          className="text-red-500 hover:underline disabled:opacity-50"
                          disabled={deletingId === p.id}
                          onClick={() => supprimerAcces(p)}
                        >
                          {deletingId === p.id ? "Suppression..." : "Supprimer l'accès"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
