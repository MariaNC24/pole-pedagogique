import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Apprenant, Presence, Evaluation, TotauxApprenant } from "../types";

function today() {
  return new Date().toLocaleDateString("fr-FR");
}

const STATUT_LABELS: Record<string, string> = {
  present: "Présent",
  absent: "Absent",
  retard: "Retard",
  absence_justifiee: "Absence justifiée",
};

// ---------------------------------------------------------------------------
// Relevé de présence (Excel) — un apprenant ou tout un groupe
// ---------------------------------------------------------------------------
export function exportRelevePresenceExcel(
  presences: (Presence & { nom_complet?: string })[],
  nomFichier: string
) {
  const rows = presences.map((p) => ({
    Apprenant: p.nom_complet ?? "",
    Date: p.date,
    Statut: STATUT_LABELS[p.statut] ?? p.statut,
    "Heure début": p.heure_debut ?? "",
    "Heure fin": p.heure_fin ?? "",
    Heures: p.heures ?? 0,
    Commentaire: p.commentaire ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Présences");
  XLSX.writeFile(wb, `${nomFichier}.xlsx`);
}

// ---------------------------------------------------------------------------
// Bilan pédagogique (PDF) — évaluations d'un apprenant
// ---------------------------------------------------------------------------
export function exportBilanPedagogiquePdf(apprenant: Apprenant, evaluations: Evaluation[]) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Bilan pédagogique", 14, 18);
  doc.setFontSize(10);
  doc.text(`Apprenant : ${apprenant.nom_complet}`, 14, 26);
  doc.text(`Groupe : ${apprenant.groupe ?? "—"}`, 14, 32);
  doc.text(`Certification visée : ${apprenant.certification_visee ?? "—"}`, 14, 38);
  doc.text(`Édité le ${today()}`, 14, 44);

  autoTable(doc, {
    startY: 50,
    head: [["Date prévue", "Réalisée", "Type", "Compétence", "Résultat", "CECRL", "Objectif", "Statut"]],
    body: evaluations.map((e) => [
      e.date_prevue ?? "",
      e.date_realisee ?? "",
      e.type_evaluation ?? "",
      e.competence_evaluee ?? "",
      e.resultat_score ?? "",
      e.niveau_cecrl ?? "",
      e.objectif_atteint ?? "",
      e.statut ?? "",
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [52, 87, 213] },
  });

  doc.save(`bilan-pedagogique-${apprenant.nom_complet.replace(/\s+/g, "-")}.pdf`);
}

// ---------------------------------------------------------------------------
// Relevé de présence (PDF) — un apprenant
// ---------------------------------------------------------------------------
export function exportRelevePresencePdf(apprenant: Apprenant, presences: Presence[]) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Relevé de présence", 14, 18);
  doc.setFontSize(10);
  doc.text(`Apprenant : ${apprenant.nom_complet}`, 14, 26);
  doc.text(`Édité le ${today()}`, 14, 32);

  autoTable(doc, {
    startY: 40,
    head: [["Date", "Statut", "Heure début", "Heure fin", "Heures", "Commentaire"]],
    body: presences.map((p) => [
      p.date,
      STATUT_LABELS[p.statut] ?? p.statut,
      p.heure_debut ?? "",
      p.heure_fin ?? "",
      String(p.heures ?? 0),
      p.commentaire ?? "",
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [52, 87, 213] },
  });

  doc.save(`releve-presence-${apprenant.nom_complet.replace(/\s+/g, "-")}.pdf`);
}

// ---------------------------------------------------------------------------
// Attestation de présence / heures — générée à la demande d'un administrateur,
// jamais automatiquement, jamais de signature de l'apprenant.
// ---------------------------------------------------------------------------
export function exportAttestationPdf(
  apprenant: Apprenant,
  totaux: TotauxApprenant,
  organisme = "ARCS France — Pôle Pédagogique"
) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Attestation de présence et d'heures", 105, 30, { align: "center" });

  doc.setFontSize(11);
  const lines = [
    `${organisme}`,
    "",
    `Nous soussignés attestons que :`,
    "",
    `${apprenant.nom_complet}`,
    `Groupe / parcours : ${totaux.groupe ?? "—"}`,
    `Certification visée : ${apprenant.certification_visee ?? "—"}`,
    "",
    `a suivi la formation pour un total de :`,
    `${totaux.total_jours_presence} jour(s) de présence`,
    `${Number(totaux.total_heures).toFixed(2)} heure(s)`,
    "",
    `Fait le ${today()}.`,
  ];

  let y = 50;
  lines.forEach((line) => {
    doc.text(line, 20, y);
    y += 8;
  });

  doc.save(`attestation-${apprenant.nom_complet.replace(/\s+/g, "-")}.pdf`);
}
