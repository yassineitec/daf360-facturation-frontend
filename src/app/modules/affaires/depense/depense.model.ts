// Field-for-field match of the backend DTOs (AffaireDepenseService.getDepense() ->
// DepensePreviewDto/DepenseLigneDto). Deliberately NOT reusing WipTmHourDto: there is no
// sell-side rateAmount here (FORFAIT/LIVRABLE affaires have no AffaireRessource), and userId
// is nullable — a Timesheet email with no matching DAF360 user_ref still produces a row.

export interface DepenseLigne {
  userId: number | null;
  userFullName: string;
  userEmail: string;
  date: string;
  disciplineLabel: string | null;
  document: string | null;
  wbsId: string | null;
  wbsName: string | null;
  hours: number;
  costAmount: number;
}

export interface DepensePreview {
  totalHours: number;
  totalCost: number;
  collaboratorCount: number;
  lignes: DepenseLigne[];
}
