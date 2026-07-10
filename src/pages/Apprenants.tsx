import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import RoleGuard from "../components/RoleGuard";
import type { Apprenant, Groupe } from "../types";

const emptyForm = {
  id: "",
  nom_complet: "",
  groupe_id: "",
  formateur: "",
  certification_visee: "",
  date_entree: "",
  actif: true,
};

export default function Apprenants() {
  const { profile } = useAuth();
  const [apprenants, setApprenants] = useState<Apprenant[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactifs, setShowInactifs] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data }, { data: gr }] = await Promise.all([
      supabase.from("apprenants").select("*").order("nom_complet", { ascending: true }),
      supabase.from("groupes").select("*").eq("actif", true).order("nom"),
    ]);
    setApprenants((data as Apprenant[]) ?? []);
    setGroupes((gr as Groupe[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("apprenants-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "apprenants" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const groupeNom = useMemo(() => {
    const map: Record<string, string> = {};
    groupes.forEach((g) => (map[g.id] = g.nom));
    return map;
  }, [groupes]);

  const filtered = useMemo(() => {
    return apprenants.filter((a) => {
      if (!showInactifs && !a.actif) return false;
      if (search && !a.nom_complet.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [apprenants, search, showInactifs]);

  function openNew() {
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(a: Apprenant) {
    setForm({
      id: a.id,
      nom_complet: a.nom_complet,
      groupe_id: a.groupe_id ?? "",
      formateur: a.formateur ?? "",
      certification_visee: a.certification_visee ?? "",
      date_entree: a.date_entree ?? "",
      actif: a.actif,
    });
    setFormOpen(true);
  }

  function selectGroupe(groupeId: string) {
    const g = groupes.find((gr) => gr.id === groupeId);
    setForm((f) => ({
      ...f,
      groupe_id: groupeId,
      // Pré-remplit le formateur par défaut du groupe, mais reste modifiable
      // ou totalement supprimable pour cet apprenant précis.
      formateur: f.formateur || g?.formateur_defaut || "",
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      nom_complet: form.nom_complet,
      groupe_id: form.groupe_id || null,
      formateur: form.formateur || null,
      certification_visee: form.certification_visee || null,
      date_entree: form.date_entree || null,
    };
    if (form.id) {
      await supabase.from("apprenants").update({ ...payload, actif: form.actif }).eq("id", form.id);
    } else {
      await supabase.from("apprenants").insert({ ...payload, created_by: profile?.id });
    }
    setSaving(false);
    setFormOpen(false);
    load();
  }

  async function toggleActif(a: Apprenant) {
    await supabase.from("apprenants").update({ actif: !a.actif }).eq("id", a.id);
    load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Apprenants</h1>
        <RoleGuard allow={["admin", "editor"]}>
          <button className="btn-primary" onClick={openNew}>
            + Ajouter un apprenant
          </button>
        </RoleGuard>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Rechercher un nom..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showInactifs}
            onChange={(e) => setShowInactifs(e.target.checked)}
          />
          Afficher les inactifs
        </label>
      </div>

      {formOpen && (
        <form onSubmit={handleSave} className="card mb-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Nom complet</label>
            <input
              className="input"
              required
              value={form.nom_complet}
              onChange={(e) => setForm({ ...form, nom_complet: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Groupe</label>
            <select
              className="input"
              value={form.groupe_id}
              onChange={(e) => selectGroupe(e.target.value)}
            >
              <option value="">Aucun groupe</option>
              {groupes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Formateur <span className="font-normal text-slate-400">(propre à cet apprenant, optionnel)</span>
            </label>
            <input
              className="input"
              value={form.formateur}
              onChange={(e) => setForm({ ...form, formateur: e.target.value })}
              placeholder="Laisser vide si non défini"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Certification visée</label>
            <input
              className="input"
              value={form.certification_visee}
              onChange={(e) => setForm({ ...form, certification_visee: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Date d'entrée</label>
            <input
              type="date"
              className="input"
              value={form.date_entree}
              onChange={(e) => setForm({ ...form, date_entree: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <p className="p-4 text-sm text-slate-400">Chargement...</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Aucun apprenant pour l'instant.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Groupe</th>
                <th className="px-4 py-2">Formateur</th>
                <th className="px-4 py-2">Certification visée</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    <Link to={`/apprenants/${a.id}`} className="hover:underline">
                      {a.nom_complet}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {(a.groupe_id && groupeNom[a.groupe_id]) || a.groupe || "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{a.formateur || "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{a.certification_visee || "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`badge ${
                        a.actif ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {a.actif ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link to={`/apprenants/${a.id}`} className="mr-3 text-brand-600 hover:underline">
                      Fiche
                    </Link>
                    <RoleGuard allow={["admin", "editor"]}>
                      <button
                        className="mr-3 text-brand-600 hover:underline"
                        onClick={() => openEdit(a)}
                      >
                        Modifier
                      </button>
                    </RoleGuard>
                    <RoleGuard allow={["admin"]}>
                      <button
                        className="text-slate-500 hover:underline"
                        onClick={() => toggleActif(a)}
                      >
                        {a.actif ? "Désactiver" : "Réactiver"}
                      </button>
                    </RoleGuard>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
