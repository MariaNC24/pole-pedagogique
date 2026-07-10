import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import RoleGuard from "../components/RoleGuard";
import type { Groupe } from "../types";

const emptyForm = {
  id: "",
  nom: "",
  date_debut: "",
  date_fin: "",
  formateur_defaut: "",
};

export default function Groupes() {
  const { profile } = useAuth();
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("groupes").select("*").is("deleted_at", null).order("nom");
    setGroupes((data as Groupe[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("groupes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "groupes" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function openNew() {
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(g: Groupe) {
    setForm({
      id: g.id,
      nom: g.nom,
      date_debut: g.date_debut ?? "",
      date_fin: g.date_fin ?? "",
      formateur_defaut: g.formateur_defaut ?? "",
    });
    setFormOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      nom: form.nom,
      date_debut: form.date_debut || null,
      date_fin: form.date_fin || null,
      formateur_defaut: form.formateur_defaut || null,
    };
    if (form.id) {
      await supabase.from("groupes").update(payload).eq("id", form.id);
    } else {
      await supabase.from("groupes").insert({ ...payload, created_by: profile?.id });
    }
    setSaving(false);
    setFormOpen(false);
    load();
  }

  async function toggleActif(g: Groupe) {
    await supabase.from("groupes").update({ actif: !g.actif }).eq("id", g.id);
    load();
  }

  async function envoyerCorbeille(g: Groupe) {
    if (!confirm(`Envoyer le groupe "${g.nom}" à la corbeille ? Récupérable pendant 15 jours.`)) return;
    await supabase.from("groupes").update({ deleted_at: new Date().toISOString() }).eq("id", g.id);
    load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Groupes</h1>
          <p className="text-sm text-slate-500">
            Le formateur indiqué ici n'est qu'une valeur par défaut : il peut être changé ou
            retiré librement pour chaque apprenant dans sa fiche.
          </p>
        </div>
        <RoleGuard allow={["admin", "editor"]}>
          <button className="btn-primary" onClick={openNew}>
            + Nouveau groupe
          </button>
        </RoleGuard>
      </div>

      {formOpen && (
        <form onSubmit={handleSave} className="card mb-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Nom du groupe</label>
            <input
              className="input"
              required
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              placeholder="ex. Groupe A - Mars 2026"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Date de début</label>
            <input
              type="date"
              className="input"
              value={form.date_debut}
              onChange={(e) => setForm({ ...form, date_debut: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Date de fin</label>
            <input
              type="date"
              className="input"
              value={form.date_fin}
              onChange={(e) => setForm({ ...form, date_fin: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">
              Formateur par défaut (optionnel)
            </label>
            <input
              className="input"
              value={form.formateur_defaut}
              onChange={(e) => setForm({ ...form, formateur_defaut: e.target.value })}
              placeholder="Laisser vide si les formateurs varient selon l'apprenant"
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
        ) : groupes.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Aucun groupe pour l'instant.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Période</th>
                <th className="px-4 py-2">Formateur par défaut</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {groupes.map((g) => (
                <tr key={g.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{g.nom}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {g.date_debut || "—"} → {g.date_fin || "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{g.formateur_defaut || "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`badge ${
                        g.actif ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {g.actif ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <RoleGuard allow={["admin", "editor"]}>
                      <button className="mr-3 text-brand-600 hover:underline" onClick={() => openEdit(g)}>
                        Modifier
                      </button>
                    </RoleGuard>
                    <RoleGuard allow={["admin"]}>
                      <button className="mr-3 text-slate-500 hover:underline" onClick={() => toggleActif(g)}>
                        {g.actif ? "Désactiver" : "Réactiver"}
                      </button>
                      <button className="text-red-500 hover:underline" onClick={() => envoyerCorbeille(g)}>
                        Supprimer
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
