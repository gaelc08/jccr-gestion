// export-ui.ts — Export & Import UI module

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

import type { Coach, User } from '../../src/types/index.js';

interface SupabaseClient {
  auth: unknown;
}

interface DayData {
  hours?: number;
  km?: number;
  peage?: number;
  hotel?: number;
  achat?: number;
  competition?: boolean;
  description?: string;
  departurePlace?: string;
  arrivalPlace?: string;
  justificationUrl?: string;
  hotelJustificationUrl?: string;
  achatJustificationUrl?: string;
}

interface ReceiptIssue {
  date: string;
  missing: string[];
}

interface ExpenseRow {
  date: string;
  km?: number;
  peage?: number;
  hotel?: number;
  achat?: number;
  description?: string;
  departurePlace?: string;
  arrivalPlace?: string;
  justificationUrl?: string;
  hotelJustificationUrl?: string;
  achatJustificationUrl?: string;
  mileageAmount: number;
  tollAmount: number;
  hotelAmount: number;
  purchaseAmount: number;
  amount: number;
  effectiveRate: number;
}

interface TimesheetRow {
  date: string;
  hours: number;
  competition: boolean;
  trainingAmount: number;
  competitionAllowance: number;
  lineTotal: number;
  description: string;
}

interface MileageBreakdown {
  byKey?: Record<string, { amount: number; effectiveRate: number }>;
  total?: number;
}

interface SummaryRow {
  coach: Coach;
  totalHours: number;
  totalCompetitions: number;
  totalKm: number;
  totalMileageAmount: number;
  salary: number;
}

interface BackupData {
  coaches: unknown[];
  time_data: unknown[];
}

interface ExcelWorkbook {
  creator: string;
  created: Date;
  addWorksheet(name: string, opts?: Record<string, unknown>): ExcelWorksheet;
  addImage(opts: Record<string, unknown>): unknown;
  xlsx: { writeBuffer(): Promise<ArrayBuffer> };
}

interface ExcelWorksheet {
  columns: Array<{ width: number }>;
  getRow(n: number): ExcelRow;
  getCell(ref: string): ExcelCell;
  addImage(id: unknown, range: Record<string, unknown>): void;
  mergeCells(range: string): void;
  pageSetup?: unknown;
  views?: unknown;
  properties?: unknown;
}

interface ExcelRow {
  values: unknown[];
  eachCell(fn: (cell: ExcelCell, col: number) => void): void;
  getCell(col: number): ExcelCell;
}

interface ExcelCell {
  value: unknown;
  font?: Record<string, unknown>;
  fill?: Record<string, unknown>;
  border?: Record<string, unknown>;
  alignment?: Record<string, unknown>;
  numFmt?: string;
}

export interface ExportUIOptions {
  getCurrentCoach: () => Coach | null;
  getCurrentMonth: () => string | null;
  getTimeData: () => Record<string, DayData>;
  getSelectedDay: () => string | null;
  getCurrentUser: () => User | null;
  getCurrentAccessToken: () => string | null;
  getCoaches: () => Coach[];
  supabase: SupabaseClient;
  supabaseUrl: string;
  supabaseKey: string;
  logAuditEvent: (action: string, entity: string, payload: Record<string, unknown>) => Promise<void>;
  buildMonthlyAuditPayload: (opts: Record<string, unknown>) => Record<string, unknown>;
  downloadBlob: (blob: Blob, filename: string) => void;
  loadExcelJs: () => Promise<{ Workbook: new () => ExcelWorkbook }>;
  blobToDataUrl: (blob: Blob) => Promise<string>;
  escapeHtml: (v: unknown, fb?: string) => string;
  normalizeMonth: (v: string) => string;
  getCoachDisplayName: (coach: Coach) => string;
  getProfileLabel: (coach: Coach, opts?: Record<string, unknown>) => string;
  getProfileType: (coach: Coach) => string;
  isVolunteerProfile: (coach: Coach) => boolean;
  isAdminProfile: (coach: Coach) => boolean;
  getMileageScaleDescription: (fp: unknown) => string;
  getMonthlyMileageBreakdown: (coach: Coach, month: string) => MileageBreakdown;
  getMileageYearBreakdown: unknown;
  parseFiscalPower: unknown;
  getMileageScaleBand: unknown;
  calculateAnnualMileageAmount: unknown;
  getMileageYearBreakdownFn: unknown;
}

// ─────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────

export function createExportUI({
  getCurrentCoach, getCurrentMonth, getTimeData, getSelectedDay,
  getCurrentUser, getCurrentAccessToken, getCoaches,
  supabase, supabaseUrl, supabaseKey, logAuditEvent, buildMonthlyAuditPayload,
  downloadBlob, loadExcelJs, blobToDataUrl,
  escapeHtml, normalizeMonth, getCoachDisplayName, getProfileLabel, getProfileType,
  isVolunteerProfile, isAdminProfile, getMileageScaleDescription, getMonthlyMileageBreakdown,
}: ExportUIOptions) {

  // ─── Internal helpers ───────────────────────────────────────────

  function __formatMonthLabel(monthValue: string): string {
    const normalized = normalizeMonth(monthValue);
    const [year, month] = String(normalized ?? '').split('-');
    if (!year || !month) return normalized;
    return `${month}/${year}`;
  }

  function __closeMileagePreviewModal(): void {
    document.getElementById('mileagePreviewModal')?.classList.remove('active');
  }

  function __getMonthlyExpenseReceiptIssues(coachId: unknown, year: string, month: string): ReceiptIssue[] {
    const timeData = getTimeData();
    const issues: ReceiptIssue[] = [];
    Object.keys(timeData)
      .filter((key) => key.startsWith(`${coachId}-${year}-${month}`))
      .sort()
      .forEach((key) => {
        const date = key.split('-').slice(-3).join('-');
        const data = timeData[key] ?? {};
        const missing: string[] = [];
        if ((data.peage ?? 0) > 0 && !data.justificationUrl)      missing.push('péage');
        if ((data.hotel ?? 0) > 0 && !data.hotelJustificationUrl) missing.push('hôtel');
        if ((data.achat ?? 0) > 0 && !data.achatJustificationUrl) missing.push('achat');
        if (missing.length) issues.push({ date, missing });
      });
    return issues;
  }

  function __showMileagePreviewModal(html: string, modalTitle = 'Aperçu'): void {
    let modal = document.getElementById('mileagePreviewModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mileagePreviewModal';
      modal.className = 'modal export-preview-modal';
      modal.innerHTML = `
        <div class="modal-content export-preview-content">
          <h2 id="previewModalTitle"></h2>
          <div class="export-preview-toolbar">
            <button id="previewPrintBtn" class="btn-primary">🖨️ Imprimer / PDF</button>
            <button id="previewCloseBtn" class="btn-danger">Fermer</button>
          </div>
          <iframe id="mileagePreviewFrame" class="export-preview-frame" title="Aperçu"></iframe>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) __closeMileagePreviewModal(); });
      modal.querySelector('#previewCloseBtn')?.addEventListener('click', __closeMileagePreviewModal);
    }

    const titleEl = modal.querySelector('#previewModalTitle') as HTMLElement | null;
    if (titleEl) titleEl.textContent = modalTitle;

    const iframe    = modal.querySelector('#mileagePreviewFrame') as HTMLIFrameElement | null;
    const printBtn  = modal.querySelector('#previewPrintBtn')    as HTMLButtonElement | null;

    if (printBtn) printBtn.disabled = true;
    if (iframe) {
      iframe.onload = () => {
        if (printBtn) {
          printBtn.disabled = false;
          printBtn.onclick = () => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
            } catch {
              alert("Impossible d'imprimer.");
            }
          };
        }
      };
      iframe.srcdoc = html;
    }
    modal.classList.add('active');
  }

  // ─── exportDeclarationXLS ───────────────────────────────────────

  async function exportDeclarationXLS(): Promise<void> {
    const currentCoach = getCurrentCoach();
    const currentMonth = getCurrentMonth();
    const timeData     = getTimeData();
    const currentUser  = getCurrentUser();

    if (!currentCoach || !currentMonth) { alert('Veuillez sélectionner un profil et un mois.'); return; }
    if (isVolunteerProfile(currentCoach) || isAdminProfile(currentCoach)) {
      alert("L'export de déclaration salaire n'est pas disponible pour un profil bénévole ou administrateur.");
      return;
    }

    const [year, month] = currentMonth.split('-');
    const rows = Object.keys(timeData)
      .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
      .sort()
      .map((key) => {
        const date = key.split('-').slice(-3).join('-');
        const data = timeData[key];
        const hours = Number(data.hours) || 0;
        const hourlyRate = Number((currentCoach as Record<string, number>).hourly_rate) || 0;
        const trainingAmount = hours * hourlyRate;
        const competitionAllowance = data.competition
          ? (Number((currentCoach as Record<string, number>).daily_allowance) || 0)
          : 0;
        return {
          date,
          description: data.description || (data.competition ? 'Jour de compétition' : 'Entraînement'),
          hours, hourlyRate, trainingAmount,
          competition: !!data.competition,
          competitionAllowance,
          declaredTotal: trainingAmount + competitionAllowance,
        };
      });

    if (!rows.length) { alert('Aucune donnée à déclarer pour ce mois.'); return; }

    const totalHours               = rows.reduce((s, r) => s + r.hours,              0);
    const competitionDays          = rows.reduce((s, r) => s + (r.competition ? 1 : 0), 0);
    const totalTrainingAmount      = rows.reduce((s, r) => s + r.trainingAmount,      0);
    const totalCompetitionAllowance = rows.reduce((s, r) => s + r.competitionAllowance, 0);
    const grandTotal               = rows.reduce((s, r) => s + r.declaredTotal,      0);
    const coachDisplayName         = getCoachDisplayName(currentCoach) || (currentCoach as Record<string, unknown>).name as string;
    const exportDate               = new Date().toLocaleDateString('fr-FR');

    const ExcelJS = await loadExcelJs();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Judo Club Cattenom Rodemack';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Déclaration salaire', {
      properties: { defaultRowHeight: 22 },
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 } },
      views: [{ showGridLines: false }],
    });
    worksheet.columns = [{ width: 14 }, { width: 28 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }];

    const navyFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3460' } };
    const lightFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FF' } };
    const totalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F1FB' } };
    const border = { top: { style: 'thin', color: { argb: 'FFC7D2E0' } }, left: { style: 'thin', color: { argb: 'FFC7D2E0' } }, bottom: { style: 'thin', color: { argb: 'FFC7D2E0' } }, right: { style: 'thin', color: { argb: 'FFC7D2E0' } } };

    try {
      const logoResponse = await fetch(new URL('logo-jcc.png', window.location.href));
      if (logoResponse.ok) {
        const logoBase64 = await blobToDataUrl(await logoResponse.blob());
        const imageId = workbook.addImage({ base64: logoBase64, extension: 'png' });
        worksheet.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 58, height: 58 } });
      }
    } catch (e) { console.warn('Logo load error:', e); }

    worksheet.mergeCells('C1:H1');
    worksheet.getCell('C1').value = 'Déclaration salaire';
    worksheet.getCell('C1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F3460' } };
    worksheet.mergeCells('C2:H2');
    worksheet.getCell('C2').value = `Judo Club Cattenom Rodemack — période ${month}/${year}`;
    worksheet.getCell('C2').font = { name: 'Calibri', size: 11, color: { argb: 'FF526274' } };

    const coach = currentCoach as Record<string, unknown>;
    const metaRows: unknown[][] = [
      ['Intervenant', coachDisplayName || 'Non renseigné', 'Mois déclaré', `${month}/${year}`],
      ['Adresse', coach.address || 'Non renseignée', 'Taux horaire', Number(coach.hourly_rate) || 0],
      ['Indemnité forfaitaire compétition', Number(coach.daily_allowance) || 0, "Date d'édition", exportDate],
    ];
    metaRows.forEach((values, index) => {
      const rowNumber = 5 + index;
      const row = worksheet.getRow(rowNumber);
      row.values = values;
      [1, 3].forEach((col) => { const cell = row.getCell(col); cell.fill = lightFill; cell.font = { bold: true, color: { argb: 'FF0F3460' } }; cell.border = border; });
      [2, 4].forEach((col) => { const cell = row.getCell(col); cell.border = border; if (rowNumber === 6 && col === 4) cell.numFmt = '#,##0.00 €'; if (rowNumber === 7 && col === 2) cell.numFmt = '#,##0.00 €'; });
    });

    worksheet.mergeCells('A9:H9');
    const st = worksheet.getCell('A9'); st.value = 'Synthèse à déclarer'; st.font = { bold: true, size: 12, color: { argb: 'FF0F3460' } };
    const sh = worksheet.getRow(10);
    sh.values = ['Heures prestées', 'Jours de compétition', 'Montant heures', 'Indemnités forfaitaires', 'Total déclaration'];
    sh.eachCell((cell, col) => { if (col <= 5) { cell.fill = navyFill; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.border = border; cell.alignment = { horizontal: 'center' }; } });
    const sv = worksheet.getRow(11);
    sv.values = [totalHours, competitionDays, totalTrainingAmount, totalCompetitionAllowance, grandTotal];
    sv.eachCell((cell, col) => { if (col <= 5) { cell.border = border; cell.alignment = { horizontal: col <= 2 ? 'center' : 'right' }; if (col >= 3) cell.numFmt = '#,##0.00 €'; if (col === 1) cell.numFmt = '0.0'; } });

    worksheet.mergeCells('A13:H13');
    const dt = worksheet.getCell('A13'); dt.value = 'Détail de la déclaration'; dt.font = { bold: true, size: 12, color: { argb: 'FF0F3460' } };
    const dh = worksheet.getRow(14);
    dh.values = ['Date', 'Libellé', 'Heures prestées', 'Taux horaire', 'Montant heures', 'Jour compétition', 'Indemnité forfaitaire', 'Total déclaré'];
    dh.eachCell((cell) => { cell.fill = navyFill; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.border = border; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });

    let drn = 15;
    rows.forEach((rowData, index) => {
      const row = worksheet.getRow(drn);
      row.values = [rowData.date, rowData.description, rowData.hours, rowData.hourlyRate, rowData.trainingAmount, rowData.competition ? 'Oui' : 'Non', rowData.competitionAllowance, rowData.declaredTotal];
      row.eachCell((cell, col) => {
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: [3,4,5,7,8].includes(col) ? 'right' : (col === 6 ? 'center' : 'left'), wrapText: col === 2 };
        if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };
        if (col === 3) cell.numFmt = '0.0';
        if ([4,5,7,8].includes(col)) cell.numFmt = '#,##0.00 €';
      });
      drn++;
    });
    const tr = worksheet.getRow(drn);
    tr.values = ['TOTAL', '', totalHours, '', totalTrainingAmount, competitionDays, totalCompetitionAllowance, grandTotal];
    tr.eachCell((cell, col) => {
      cell.border = border; cell.fill = totalFill; cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: [3,5,6,7,8].includes(col) ? 'right' : 'left' };
      if (col === 3) cell.numFmt = '0.0';
      if ([5,7,8].includes(col)) cell.numFmt = '#,##0.00 €';
    });

    worksheet.mergeCells(`A${drn + 2}:H${drn + 3}`);
    const nc = worksheet.getCell(`A${drn + 2}`);
    nc.value = 'Ce fichier correspond à la déclaration salaire du mois.';
    nc.alignment = { wrapText: true, vertical: 'top' }; nc.border = border;
    nc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = String((currentCoach as Record<string, unknown>).name || 'intervenant').replace(/[^a-z0-9_\-]/gi, '_');
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `declaration_salaire_${safeName}_${currentMonth}.xlsx`);
    await logAuditEvent('export.declaration_xlsx', 'export', buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { coach_name: coachDisplayName ?? null, total_hours: totalHours, competition_days: competitionDays, total_amount: grandTotal } }));
  }

  // ─── exportExpenseHTML ──────────────────────────────────────────

  function exportExpenseHTML(): void {
    const currentCoach = getCurrentCoach();
    const currentMonth = getCurrentMonth();
    const timeData     = getTimeData();

    if (!currentCoach || !currentMonth) { alert('Veuillez sélectionner un profil et un mois.'); return; }
    const [year, month] = currentMonth.split('-');
    const today = new Date().toLocaleDateString('fr-FR');
    const mileageBreakdown = getMonthlyMileageBreakdown(currentCoach, currentMonth);
    const receiptIssues    = __getMonthlyExpenseReceiptIssues(currentCoach.id, year, month);

    if (receiptIssues.length) {
      const details = receiptIssues.map((i) => `- ${i.date} : justificatif manquant pour ${i.missing.join(', ')}`).join('\n');
      alert(`Impossible d'exporter la note de frais.\nAjoutez les justificatifs obligatoires pour :\n${details}`);
      return;
    }

    const rows: ExpenseRow[] = [];
    let total = 0;
    Object.keys(timeData)
      .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
      .sort()
      .forEach((key) => {
        const date = key.split('-').slice(-3).join('-');
        const data = timeData[key];
        const hasExpense = (data.km ?? 0) > 0 || (data.peage ?? 0) > 0 || (data.hotel ?? 0) > 0 || (data.achat ?? 0) > 0;
        if (!hasExpense) return;
        const mileage = mileageBreakdown.byKey?.[key] ?? { amount: 0, effectiveRate: 0 };
        const amount  = mileage.amount + (data.peage ?? 0) + (data.hotel ?? 0) + (data.achat ?? 0);
        total += amount;
        rows.push({ date, ...data, mileageAmount: mileage.amount, tollAmount: data.peage ?? 0, hotelAmount: data.hotel ?? 0, purchaseAmount: data.achat ?? 0, amount, effectiveRate: mileage.effectiveRate });
      });

    if (total === 0) { alert('Aucune dépense saisie pour ce mois.'); return; }

    const logoUrl           = new URL('logo-jcc.png', window.location.href).href;
    const coachDisplayName  = getCoachDisplayName(currentCoach) || (currentCoach as Record<string, unknown>).name as string;
    const profileLabel      = getProfileLabel(currentCoach, { capitalized: true });
    const signatureLabel    = isVolunteerProfile(currentCoach) || isAdminProfile(currentCoach) ? 'Signature du bénévole / administrateur' : 'Signature du salarié';
    const totalMileageAmount  = rows.reduce((s, r) => s + (r.mileageAmount  || 0), 0);
    const totalTollAmount     = rows.reduce((s, r) => s + (r.tollAmount     || 0), 0);
    const totalHotelAmount    = rows.reduce((s, r) => s + (r.hotelAmount    || 0), 0);
    const totalPurchaseAmount = rows.reduce((s, r) => s + (r.purchaseAmount || 0), 0);
    const totalMileageKm      = rows.reduce((s, r) => s + (Number(r.km)    || 0), 0);
    const mileageScaleDescription = getMileageScaleDescription((currentCoach as Record<string, unknown>).fiscal_power);

    const esc = (v: unknown, fb = '') => escapeHtml(v || fb);
    const sanitizeUrl = (v: unknown): string => {
      if (!v) return '';
      try { const u = new URL(String(v), window.location.href); if (!['http:','https:'].includes(u.protocol.toLowerCase())) return ''; return escapeHtml(u.href); }
      catch { return ''; }
    };
    const buildJustifLinks = (row: ExpenseRow): string => {
      const links: string[] = [];
      const t = sanitizeUrl(row.justificationUrl); const h = sanitizeUrl(row.hotelJustificationUrl); const a = sanitizeUrl(row.achatJustificationUrl);
      if (t) links.push(`<a href="${t}" target="_blank" rel="noopener noreferrer">Péage</a>`);
      if (h) links.push(`<a href="${h}" target="_blank" rel="noopener noreferrer">Hôtel</a>`);
      if (a) links.push(`<a href="${a}" target="_blank" rel="noopener noreferrer">Achat</a>`);
      return links.length ? `<div class="justif-links">${links.join('')}</div>` : '<span class="meta-line">Aucun justificatif</span>';
    };

    const safeCoachName           = esc((currentCoach as Record<string, unknown>).name);
    const safeCoachDisplayName    = esc(coachDisplayName, 'Non renseigné');
    const safeAddress             = esc((currentCoach as Record<string, unknown>).address, 'Non renseignée');
    const safeProfileLabel        = esc(profileLabel);
    const safeVehicle             = esc((currentCoach as Record<string, unknown>).vehicle, 'Non renseigné');
    const safeFiscalPower         = esc((currentCoach as Record<string, unknown>).fiscal_power, 'Non renseignée');
    const safeMileageScaleDescription = esc(mileageScaleDescription);
    const safeSignatureLabel      = esc(signatureLabel);

    const tableRows = rows.map((row) => `
      <tr>
        <td>${esc(row.date)}</td>
        <td><div class="expense-cell"><strong>${esc(row.description,'Déplacement judo')}</strong><span class="route-line">${esc(row.departurePlace,'-')} → ${esc(row.arrivalPlace,'-')}</span>${buildJustifLinks(row)}</div></td>
        <td class="number">${Number(row.km)||0}</td>
        <td class="amount">${(row.mileageAmount||0).toFixed(2).replace('.',',')} €</td>
        <td class="amount">${(row.tollAmount||0).toFixed(2).replace('.',',')} €</td>
        <td class="amount">${(row.hotelAmount||0).toFixed(2).replace('.',',')} €</td>
        <td class="amount">${(row.purchaseAmount||0).toFixed(2).replace('.',',')} €</td>
        <td class="amount">${(row.amount||0).toFixed(2).replace('.',',')} €</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Note de frais - ${safeCoachName} - ${month}/${year}</title></head><body>${tableRows}</body></html>`;
    __showMileagePreviewModal(html, 'Aperçu note de frais');
    void logAuditEvent('export.expense_html', 'export', buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { total_amount: total } }));
  }

  // ─── exportTimesheetHTML ────────────────────────────────────────

  async function exportTimesheetHTML(): Promise<void> {
    const currentCoach = getCurrentCoach();
    const currentMonth = getCurrentMonth();
    const timeData     = getTimeData();

    if (!currentCoach || !currentMonth) { alert('Veuillez sélectionner un profil et un mois.'); return; }
    const [year, month] = currentMonth.split('-');
    const today = new Date().toLocaleDateString('fr-FR');
    const logoUrl        = new URL('logo-jcc.png', window.location.href).href;
    const coachDisplayName = getCoachDisplayName(currentCoach) || (currentCoach as Record<string, unknown>).name as string;
    const profileLabel   = getProfileLabel(currentCoach, { capitalized: true });
    const signatureLabel = isVolunteerProfile(currentCoach) || isAdminProfile(currentCoach)
      ? 'Signature du bénévole / administrateur' : 'Signature du salarié';
    const hourlyRate     = Number((currentCoach as Record<string, number>).hourly_rate)    || 0;
    const dailyAllowance = Number((currentCoach as Record<string, number>).daily_allowance) || 0;
    const esc = (v: unknown, fb = '') => escapeHtml(v || fb);

    let totalHours = 0, competitionDays = 0, totalCompetitionAllowance = 0, totalTrainingAmount = 0, totalAmount = 0;
    const rows: TimesheetRow[] = [];
    Object.keys(timeData)
      .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
      .sort()
      .forEach((key) => {
        const date = key.split('-').slice(-3).join('-');
        const data = timeData[key];
        const hours = Number(data.hours) || 0;
        const competition = !!data.competition;
        if (hours > 0 || competition) {
          const trainingAmount      = hours * hourlyRate;
          const competitionAllowance = competition ? dailyAllowance : 0;
          const lineTotal           = trainingAmount + competitionAllowance;
          totalHours += hours; totalTrainingAmount += trainingAmount;
          if (competition) competitionDays++;
          totalCompetitionAllowance += competitionAllowance;
          totalAmount += lineTotal;
          rows.push({ date, hours, competition, trainingAmount, competitionAllowance, lineTotal, description: data.description || '' });
        }
      });

    if (!rows.length) { alert("Aucune heure d'entraînement ni compétition saisie pour ce mois."); return; }

    const tableRows = rows.map((r) => `
      <tr>
        <td>${esc(r.date)}</td>
        <td class="number">${r.hours}</td>
        <td class="amount">${hourlyRate.toFixed(2).replace('.', ',')} €</td>
        <td class="amount">${r.trainingAmount.toFixed(2).replace('.', ',')} €</td>
        <td class="amount">${r.competitionAllowance.toFixed(2).replace('.', ',')} €</td>
        <td class="amount">${r.lineTotal.toFixed(2).replace('.', ',')} €</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Relevé heures - ${esc((currentCoach as Record<string,unknown>).name)} - ${month}/${year}</title></head><body>${tableRows}</body></html>`;
    __showMileagePreviewModal(html, 'Aperçu pointage mensuel');
    await logAuditEvent('export.timesheet_html', 'export', buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { total_hours: totalHours, competition_days: competitionDays } }));
  }

  // ─── exportMonthlyExpenses ──────────────────────────────────────

  async function exportMonthlyExpenses(format = 'csv', month: string | null = null): Promise<void> {
    const currentAccessToken = getCurrentAccessToken();
    const resolvedMonth = month ?? getCurrentMonth();
    if (!resolvedMonth) { alert('Veuillez sélectionner un mois.'); return; }
    const btn = document.getElementById('exportMonthlyExpensesBtn') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Export en cours…'; }
    try {
      const res = await globalThis.fetch(`${supabaseUrl}/functions/v1/export-monthly-expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json', apikey: supabaseKey },
        body: JSON.stringify({ month: resolvedMonth, format }),
      });
      if (!res.ok) { const t = await res.text(); alert('Erreur export : ' + t); return; }
      const blob = await res.blob();
      const ext = format === 'xlsx' ? 'xlsx' : 'csv';
      downloadBlob(blob, `export_frais_${resolvedMonth}.${ext}`);
    } catch (e) { alert("Erreur lors de l'export : " + (e as Error).message); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '📊 Export mensuel frais'; } }
  }

  // ─── exportBackupJSON ───────────────────────────────────────────

  async function exportBackupJSON(): Promise<void> {
    const currentAccessToken = getCurrentAccessToken();
    const currentUser = getCurrentUser();
    if (!currentUser) { alert('Non connecté.'); return; }
    try {
      const [coachesRes, timeDataRes] = await Promise.all([
        globalThis.fetch(`${supabaseUrl}/rest/v1/users?select=*`,     { headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}` } }),
        globalThis.fetch(`${supabaseUrl}/rest/v1/time_data?select=*`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}` } }),
      ]);
      const coachesData   = await coachesRes.json();
      const timeDataData  = await timeDataRes.json();
      const backup        = { exportedAt: new Date().toISOString(), coaches: coachesData, time_data: timeDataData };
      downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `backup_jcc_${new Date().toISOString().slice(0, 10)}.json`);
      await logAuditEvent('export.backup_json', 'export', { entityId: null, targetUserId: null, targetEmail: null, metadata: { exported_by: (currentUser as User).email } });
    } catch (e) { alert("Erreur lors de la sauvegarde : " + (e as Error).message); }
  }

  // ─── importCoachData ────────────────────────────────────────────

  async function importCoachData(data: BackupData): Promise<void> {
    const currentAccessToken = getCurrentAccessToken();
    if (!data?.coaches || !data?.time_data) { alert('Format de fichier JSON invalide.'); return; }
    if (!confirm(`Importer ${data.coaches.length} profil(s) et ${data.time_data.length} entrée(s) ?`)) return;
    try {
      for (const coach of data.coaches) {
        await globalThis.fetch(`${supabaseUrl}/rest/v1/users`, { method: 'POST', headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' }, body: JSON.stringify(coach) });
      }
      for (const row of data.time_data) {
        await globalThis.fetch(`${supabaseUrl}/rest/v1/time_data`, { method: 'POST', headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' }, body: JSON.stringify(row) });
      }
      alert('Import terminé avec succès.');
    } catch (e) { alert("Erreur lors de l'import : " + (e as Error).message); }
  }

  // ─── openMileagePreviewModal / openMonthlySummaryPreviewModal ───

  async function openMileagePreviewModal(): Promise<void> {
    exportExpenseHTML();
  }

  async function openMonthlySummaryPreviewModal(): Promise<void> {
    const currentMonth = getCurrentMonth();
    const timeData     = getTimeData();
    const coaches      = getCoaches ? getCoaches() : [];
    if (!currentMonth) { alert('Veuillez sélectionner un mois.'); return; }

    const [year, month] = currentMonth.split('-');
    const monthLabel = new Date(Number(year), Number(month) - 1, 1)
      .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    const rows: SummaryRow[] = coaches.map((coach) => {
      const keys = Object.keys(timeData).filter((k) => k.startsWith(`${coach.id}-${year}-${month}`));
      const totalHours       = keys.reduce((s, k) => s + (timeData[k].hours ?? 0), 0);
      const totalCompetitions = keys.filter((k) => timeData[k].competition).length;
      const totalKm          = keys.reduce((s, k) => s + (Number(timeData[k].km) || 0), 0);
      const mileage          = getMonthlyMileageBreakdown(coach, currentMonth);
      const totalMileageAmount = mileage?.total ?? 0;
      const salary           = isVolunteerProfile(coach) || isAdminProfile(coach)
        ? 0
        : totalHours * ((coach as Record<string, number>).hourly_rate ?? 0);
      return { coach, totalHours, totalCompetitions, totalKm, totalMileageAmount, salary };
    }).filter((r) => r.totalHours > 0 || r.totalKm > 0);

    if (rows.length === 0) { alert(`Aucune donnée saisie pour ${monthLabel}.`); return; }

    const fmt = (n: unknown) => Number(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalSalary  = rows.reduce((s, r) => s + r.salary, 0);
    const totalMileage = rows.reduce((s, r) => s + r.totalMileageAmount, 0);

    const tableRows = rows.map((r) => `
      <tr>
        <td>${escapeHtml(getCoachDisplayName(r.coach))}</td>
        <td>${escapeHtml(getProfileLabel(r.coach) || (isVolunteerProfile(r.coach) ? 'Bénévole' : 'Entraîneur'))}</td>
        <td style="text-align:center">${r.totalHours}</td>
        <td style="text-align:center">${r.totalCompetitions}</td>
        <td style="text-align:center">${r.totalKm}</td>
        <td style="text-align:right">${fmt(r.totalMileageAmount)} €</td>
        <td style="text-align:right">${isVolunteerProfile(r.coach) || isAdminProfile(r.coach) ? '—' : fmt(r.salary) + ' €'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Synthèse ${escapeHtml(monthLabel)}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;font-size:13px}h2{color:#1a1a2e}table{border-collapse:collapse;width:100%;margin-top:16px}th{background:#1a1a2e;color:#fff;padding:8px 12px;text-align:left}td{padding:7px 12px;border-bottom:1px solid #e0e0e0}tr:nth-child(even) td{background:#f7f7f7}tfoot td{font-weight:bold;border-top:2px solid #1a1a2e}</style></head><body>
      <h2>📊 Synthèse du mois — ${escapeHtml(monthLabel)}</h2>
      <table><thead><tr><th>Profil</th><th>Type</th><th>Heures</th><th>Compétitions</th><th>Km</th><th>Indemnités km</th><th>Salaire brut</th></tr></thead>
      <tbody>${tableRows}</tbody>
      <tfoot><tr><td colspan="5">Total</td><td style="text-align:right">${fmt(totalMileage)} €</td><td style="text-align:right">${fmt(totalSalary)} €</td></tr></tfoot></table></body></html>`;

    __showMileagePreviewModal(html, 'Aperçu synthèse du mois');
  }

  // ─── Public API ─────────────────────────────────────────────────

  return {
    exportDeclarationXLS,
    exportExpenseHTML,
    exportTimesheetHTML,
    exportMonthlyExpenses,
    exportBackupJSON,
    importCoachData,
    openMileagePreviewModal,
    openMonthlySummaryPreviewModal,
  };
}
