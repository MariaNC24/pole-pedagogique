import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import RoleGuard from "../components/RoleGuard";
import type { Apprenant, NoteSuivi } from "../types";

interface NoteAvecAuteur extends NoteSuivi {
  profiles?: { nom: string | null; prenom: string | null } | null;
}

export default function Journal() {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<NoteAvecAuteur[]>([]);
  const [apprenants, setApprenants] = useState<Apprenant[]>([]);
  const [filterApprenant, setFilterApprenant] = useState("");
  const [search, setSearch] = useState("");
  const [newApprenantId, setNewApprenantId] = useState("");
  const [newContenu, setNewContenu] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: apps }, { data: n }] = await Promise.all([
      supabase.from("apprenants").select("*").is("deleted_at", null).eq("actif", true).order("nom_complet"),
      supabase
        .from("notes_suivi")
        .select("*, profiles(nom, prenom)")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setApprenants((apps as Apprenant[]) ?? []);
    setNotes((n as NoteAvecAuteur[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("notes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "notes_suivi" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const apprenantNom = useMemo(() => {
    const map: Record<string, string> = {};
    apprenants.forEach((a) => (map[a.id] = a.nom_complet));
    return map;
  }, [apprenants]);

  const apprenantsRecherches = useMemo(
    () => apprenants.filter((a) => a.nom_complet.toLowerCase().includes(search.toLowerCase())),
    [apprenants, search]
  );

  const filtered = filterApprenant ? notes.filter((n) => n.apprenant_id === filterApprenant) : notes;

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!newApprenantId || !newContenu.trim()) return;
    await supabase
      .from("notes_suivi")
      .insert({ apprenant_id: newApprenantId, contenu: newContenu, auteur: profile?.id });
    setNewContenu("");
    load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Journal de suivi</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input max-w-xs"
            placeholder="Rechercher un apprenant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input max-w-xs"
            value={filterApprenant}
            onChange={(e) => setFilterApprenant(e.target.value)}
          >
            <option value="">Tous les apprenants</option>
            {apprenantsRecherches.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom_complet}
              </option>
            ))}
          </select>
        </div>
      </div>

      <RoleGuard allow={["admin", "editor"]}>
        <form onSubmit={addNote} className="card mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px]">
            <label className="mb-1 block text-sm font-medium">Apprenant</label>
            <select
              className="input"
              value={newApprenantId}
              onChange={(e) => setNewApprenantId(e.target.value)}
              required
            >
              <option value="">Sélectionner...</option>
              {apprenantsRecherches.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom_complet}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-sm font-medium">Note</label>
            <input
              className="input"
              value={newContenu}
              onChange={(e) => setNewContenu(e.target.value)}
              placeholder="Observation, point d'attention, suivi individuel..."
              required
            />
          </div>
          <button type="submit" className="btn-primary">
            Ajouter
          </button>
        </form>
      </RoleGuard>

      {loading ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune note pour l'instant.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => (
            <li key={n.id} className="card">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                <Link to={`/apprenants/${n.apprenant_id}`} className="font-medium text-brand-600 hover:underline">
                  {apprenantNom[n.apprenant_id] ?? "—"}
                </Link>
                <span>
                  {n.profiles ? `${n.profiles.prenom ?? ""} ${n.profiles.nom ?? ""}`.trim() : ""} ·{" "}
                  {new Date(n.created_at).toLocaleString("fr-FR")}
                </span>
              </div>
              <p className="text-sm text-slate-700">{n.contenu}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
