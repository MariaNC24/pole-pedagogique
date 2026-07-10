export type Role = "admin" | "editor" | "viewer";

export interface Profile {
  id: string;
  nom: string | null;
  prenom: string | null;
  email: string;
  role: Role;
  actif: boolean;
  is_owner: boolean;
  created_at: string;
}

export interface Groupe {
  id: string;
  nom: string;
  date_debut: string | null;
  date_fin: string | null;
  formateur_defaut: string | null;
  actif: boolean;
  created_at: string;
}

export interface Apprenant {
  id: string;
  nom_complet: string;
  groupe: string | null;
  groupe_id: string | null;
  formateur: string | null;
  certification_visee: string | null;
  date_entree: string | null;
  date_sortie: string | null;
  actif: boolean;
  created_at: string;
}

export interface Evaluation {
  id: string;
  apprenant_id: string;
  date_prevue: string | null;
  date_realisee: string | null;
  type_evaluation: string | null;
  competence_evaluee: string | null;
  resultat_score: string | null;
  niveau_cecrl: string | null;
  objectif_atteint: string | null;
  action_pedagogique: string | null;
  statut: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface Presence {
  id: string;
  apprenant_id: string;
  date: string;
  statut: "present" | "absent" | "retard" | "absence_justifiee";
  heure_debut: string | null;
  heure_fin: string | null;
  heures: number | null;
  commentaire: string | null;
  created_at: string;
  created_by: string | null;
}

export interface TotauxApprenant {
  apprenant_id: string;
  nom_complet: string;
  groupe: string | null;
  formateur: string | null;
  total_jours_presence: number;
  total_heures: number;
}

export interface Parametres {
  id: number;
  seuil_absences: number;
  updated_at: string;
  updated_by: string | null;
}

export interface NoteSuivi {
  id: string;
  apprenant_id: string;
  contenu: string;
  auteur: string | null;
  created_at: string;
}

export interface DocumentApprenant {
  id: string;
  apprenant_id: string;
  nom_fichier: string;
  chemin_storage: string;
  taille_octets: number | null;
  type_mime: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface AuditLogEntry {
  id: string;
  table_cible: string;
  ligne_id: string | null;
  action: "insert" | "update" | "delete";
  donnees_avant: Record<string, unknown> | null;
  donnees_apres: Record<string, unknown> | null;
  modifie_par: string | null;
  modifie_at: string;
}
