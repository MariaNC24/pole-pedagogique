export type Role = "admin" | "editor" | "viewer" | "pole_administratif";

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
  deleted_at: string | null;
  created_at: string;
}

export const MODES_FINANCEMENT = [
  "CPF",
  "HORS CPF",
  "OPCO",
  "ENTREPRISE",
  "FRANCE TRAVAIL",
  "AUTRES",
] as const;
export type ModeFinancement = (typeof MODES_FINANCEMENT)[number];

export interface Apprenant {
  id: string;
  nom_complet: string;
  groupe: string | null;
  groupe_id: string | null;
  formateur: string | null;
  certification_visee: string | null;
  date_entree: string | null;
  date_sortie: string | null;
  date_session_edof: string | null;
  mode_financement: ModeFinancement | null;
  niveau_cecrl_initial: string | null;
  niveau_cecrl_vise: string | null;
  telephone: string | null;
  email: string | null;
  date_naissance: string | null;
  heures_totales_prevues: number | null;
  numero_dossier: string | null;
  date_expiration_titre_sejour: string | null;
  test_mi_parcours_fait: boolean;
  test_fin_parcours_fait: boolean;
  actif: boolean;
  deleted_at: string | null;
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
  heures_totales_prevues: number | null;
  heures_restantes: number | null;
  pourcentage_avancement: number | null;
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

export interface DocumentAdministratif {
  id: string;
  apprenant_id: string;
  nom_document: string;
  document_requis_id: string | null;
  statut: "manquant" | "recu" | "a_mettre_a_jour";
  commentaire: string | null;
  chemin_storage: string | null;
  nom_fichier: string | null;
  taille_octets: number | null;
  type_mime: string | null;
  fichier_ajoute_at: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface DocumentRequis {
  id: string;
  nom: string;
  ordre: number;
  created_by: string | null;
  created_at: string;
}

export interface SuiviExamen {
  apprenant_id: string;
  date_souhaitee: string | null;
  commentaire: string | null;
  statut: "attente" | "obtenu";
  niveau_obtenu: string | null;
  date_obtention: string | null;
  updated_by: string | null;
  updated_at: string;
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
