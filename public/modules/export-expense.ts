// export-expense.js — Note de frais HTML (aperçu + impression)
import { getMonthlyExpenseReceiptIssues, showMileagePreviewModal } from './export-helpers.js';

interface ExpenseRow {
  date: string;
  description?: string;
  departurePlace?: string;
  arrivalPlace?: string;
  km?: number;
  mileageAmount: number;
  tollAmount: number;
  hotelAmount: number;
  purchaseAmount: number;
  amount: number;
  effectiveRate?: number;
  justificationUrl?: string;
  hotelJustificationUrl?: string;
  achatJustificationUrl?: string;
}

export function createExportExpense({
  getCurrentCoach,
  getCurrentMonth,
  getTimeData,
  escapeHtml,
  getCoachDisplayName,
  getProfileLabel,
  isVolunteerProfile,
  isAdminProfile,
  getMileageScaleDescription,
  getMonthlyMileageBreakdown,
  logAuditEvent,
  buildMonthlyAuditPayload,
}) {
  function exportExpenseHTML() {
    const currentCoach = getCurrentCoach();
    const currentMonth = getCurrentMonth();
    const timeData = getTimeData();

    if (!currentCoach || !currentMonth) { alert('Veuillez sélectionner un profil et un mois.'); return; }
    const [year, month] = currentMonth.split('-');
    const today = new Date().toLocaleDateString('fr-FR');
    const mileageBreakdown = getMonthlyMileageBreakdown(currentCoach, currentMonth);
    const receiptIssues = getMonthlyExpenseReceiptIssues(currentCoach.id, year, month, getTimeData);

    if (receiptIssues.length) {
      const details = receiptIssues.map((i) => `- ${i.date} : justificatif manquant pour ${i.missing.join(', ')}`).join('\n');
      alert(`Impossible d'exporter la note de frais.\nAjoutez les justificatifs obligatoires pour :\n${details}`);
      return;
    }

    const rows = [];
    let total = 0;
    Object.keys(timeData)
      .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
      .sort()
      .forEach((key) => {
        const date = key.split('-').slice(-3).join('-');
        const data = timeData[key];
        const hasExpense = (data.km || 0) > 0 || (data.peage || 0) > 0 || (data.hotel || 0) > 0 || (data.achat || 0) > 0;
        if (!hasExpense) return;
        const mileage = mileageBreakdown.byKey?.[key] || { amount: 0, effectiveRate: 0 };
        const amount = mileage.amount + (data.peage || 0) + (data.hotel || 0) + (data.achat || 0);
        total += amount;
        rows.push({ date, ...data, mileageAmount: mileage.amount, tollAmount: data.peage || 0, hotelAmount: data.hotel || 0, purchaseAmount: data.achat || 0, amount, effectiveRate: mileage.effectiveRate });
      });

    if (total === 0) { alert('Aucune dépense saisie pour ce mois.'); return; }

    const logoUrl = new URL('logo-jcc.png', window.location.href).href;
    const coachDisplayName = getCoachDisplayName(currentCoach) || currentCoach.name;
    const profileLabel = getProfileLabel(currentCoach, { capitalized: true });
    const signatureLabel = isVolunteerProfile(currentCoach) || isAdminProfile(currentCoach) ? 'Signature du bénévole / administrateur' : 'Signature du salarié';
    const totalMileageAmount = rows.reduce((s, r) => s + (r.mileageAmount || 0), 0);
    const totalTollAmount = rows.reduce((s, r) => s + (r.tollAmount || 0), 0);
    const totalHotelAmount = rows.reduce((s, r) => s + (r.hotelAmount || 0), 0);
    const totalPurchaseAmount = rows.reduce((s, r) => s + (r.purchaseAmount || 0), 0);
    const totalMileageKm = rows.reduce((s, r) => s + (Number(r.km) || 0), 0);
    const mileageScaleDescription = getMileageScaleDescription(currentCoach.fiscal_power);

    const esc = (v, fb = '') => escapeHtml(v || fb);
    const sanitizeUrl = (v) => {
      if (!v) return '';
      try { const u = new URL(String(v), window.location.href); if (!['http:', 'https:'].includes(u.protocol.toLowerCase())) return ''; return escapeHtml(u.href); } catch { return ''; }
    };
    const buildJustifLinks = (row) => {
      const links = [];
      const t = sanitizeUrl(row.justificationUrl); const h = sanitizeUrl(row.hotelJustificationUrl); const a = sanitizeUrl(row.achatJustificationUrl);
      if (t) links.push(`<a href="${t}" target="_blank" rel="noopener noreferrer">Péage</a>`);
      if (h) links.push(`<a href="${h}" target="_blank" rel="noopener noreferrer">Hôtel</a>`);
      if (a) links.push(`<a href="${a}" target="_blank" rel="noopener noreferrer">Achat</a>`);
      return links.length ? `<div class="justif-links">${links.join('')}</div>` : '<span class="meta-line">Aucun justificatif</span>';
    };

    const safeCoachName = esc(currentCoach.name);
    const safeCoachDisplayName = esc(coachDisplayName, 'Non renseigné');
    const safeAddress = esc(currentCoach.address, 'Non renseignée');
    const safeProfileLabel = esc(profileLabel);
    const safeVehicle = esc(currentCoach.vehicle, 'Non renseigné');
    const safeFiscalPower = esc(currentCoach.fiscal_power, 'Non renseignée');
    const safeMileageScaleDescription = esc(mileageScaleDescription);
    const safeSignatureLabel = esc(signatureLabel);

    const renderHtml = ({ embeddedPreview = false } = {}) => {
      const tableRows = rows.map((row) => `
        <tr>
          <td>${esc(row.date)}</td>
          <td><div class="expense-cell"><strong>${esc(row.description, 'Déplacement judo')}</strong><span class="route-line">${esc(row.departurePlace, '-')} → ${esc(row.arrivalPlace, '-')}</span>${buildJustifLinks(row)}</div></td>
          <td class="number">${Number(row.km) || 0}</td>
          <td class="amount">${(row.mileageAmount || 0).toFixed(2).replace('.', ',')} €</td>
          <td class="amount">${(row.tollAmount || 0).toFixed(2).replace('.', ',')} €</td>
          <td class="amount">${(row.hotelAmount || 0).toFixed(2).replace('.', ',')} €</td>
          <td class="amount">${(row.purchaseAmount || 0).toFixed(2).replace('.', ',')} €</td>
          <td class="amount">${(row.amount || 0).toFixed(2).replace('.', ',')} €</td>
        </tr>`);
      return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Note de frais - ${safeCoachName} - ${month}/${year}</title><style>*{box-sizing:border-box}@media print{@page{size:A4 portrait;margin:15mm}*{box-shadow:none!important;text-shadow:none!important;filter:none!important}html,body{width:194mm;margin:0;padding:0;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}.page-shell{box-shadow:none;border:none;margin:0;width:194mm;max-width:194mm;min-height:0!important;display:flex;border-radius:0}.page-inner{padding:0;min-height:0!important;display:flex;flex-direction:column}.header,.header-brand{display:flex!important;flex-direction:row!important;align-items:flex-start!important;justify-content:space-between!important}.document-badge{text-align:right!important;min-width:180px!important}.info-grid,.summary-grid,.signature{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}.summary-card.total{grid-column:1/-1!important}.info-row{grid-template-columns:120px 1fr!important}}body{margin:0;padding:10px;background:#fff;color:#243447;font-family:Inter,Arial,sans-serif}.page-shell{width:${embeddedPreview ? '100%' : '194mm'};max-width:${embeddedPreview ? '100%' : '194mm'};min-height:${embeddedPreview ? '0' : '245mm'};margin:0 auto;background:#fff;border:none;border-radius:${embeddedPreview ? '0' : '12px'};box-shadow:none;display:flex;overflow:hidden}.page-inner{padding:8px 12px 12px;min-height:${embeddedPreview ? '0' : '245mm'};display:flex;flex-direction:column}.print-button{margin:0 0 10px;padding:8px 14px;background:linear-gradient(135deg,#0f3460,#145da0);color:white;border:none;border-radius:999px;cursor:pointer;font-size:.82rem;font-weight:700}.close-button{margin-left:8px;background:linear-gradient(135deg,#c0392b,#922b21)}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:2px solid #d8e2ef;padding-bottom:10px;margin-bottom:10px}.header-brand{display:flex;align-items:flex-start;gap:12px}.header-logo{width:160px;height:160px;flex:0 0 auto;display:flex;align-items:flex-start;justify-content:center}.header-logo img{max-width:144px;max-height:144px}.header-text{text-align:center}.header-text h1{margin:0 0 4px;font-size:1.1rem;color:#0f3460}.header-text p{margin:1px 0;color:#526274;font-size:.72rem}.document-badge{text-align:right;min-width:180px}.document-badge .label{display:inline-block;padding:5px 10px;border-radius:999px;background:#eaf2ff;color:#145da0;font-weight:700;font-size:.68rem;letter-spacing:.03em;text-transform:uppercase}.document-badge h2{margin:6px 0 2px;font-size:1rem;color:#0f3460}.document-badge p{margin:0;color:#66788a;font-size:.75rem}.info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}.info-card,.summary-card,.note{border:1px solid #d8e2ef;border-radius:16px;background:#f9fbfe}.info-card{padding:10px 12px}.info-card h3,.summary-section h3,.details-section h3{margin:0 0 8px;color:#0f3460;font-size:.86rem}.info-list{display:grid;gap:5px}.info-row{display:grid;grid-template-columns:120px 1fr;gap:6px;font-size:.74rem}.info-row .label{color:#66788a;font-weight:600}.info-row .value{color:#243447;font-weight:600}.summary-section{margin-bottom:10px}.summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.summary-card{padding:9px 10px;background:linear-gradient(180deg,#fbfdff 0%,#f1f6fc 100%)}.summary-card .label{display:block;color:#66788a;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px}.summary-card .value{font-size:.94rem;font-weight:800;color:#0f3460}.summary-card.total{grid-column:1/-1;background:linear-gradient(135deg,#0f3460,#145da0);border-color:transparent}.summary-card.total .label,.summary-card.total .value{color:#fff}.details-section{margin-top:4px}.table-wrap{width:100%;border:1px solid #d8e2ef;border-radius:12px;overflow:hidden}table{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed;background:#fff}th,td{border-bottom:1px solid #e4ebf3;padding:5px 6px;font-size:.66rem;text-align:left;overflow-wrap:anywhere;word-break:break-word;vertical-align:top;line-height:1.2}thead th{background:#0f3460;color:#fff;font-weight:700}tbody tr:nth-child(even){background:#f9fbfe}.amount,.number{text-align:right;font-variant-numeric:tabular-nums}.expense-cell{display:grid;gap:3px}.expense-cell strong{font-size:.68rem;color:#243447}.route-line,.meta-line{color:#66788a;font-size:.62rem}.justif-links{display:flex;flex-wrap:wrap;gap:4px}.justif-links a{display:inline-flex;align-items:center;padding:2px 5px;border-radius:999px;background:#eaf2ff;color:#145da0;text-decoration:none;font-weight:700;font-size:.6rem}.total-row td{font-weight:800;background:#edf4ff;color:#0f3460;border-bottom:none}.note{margin-top:8px;padding:8px 10px;background:#fffaf0;border-left:5px solid #f59e0b;font-size:.68rem;line-height:1.35}.signature{margin-top:auto;padding-top:20px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;page-break-inside:avoid}.signature>div{min-height:46px;border-top:2px solid #243447;padding-top:6px;text-align:center;font-weight:600;font-size:.7rem}th:nth-child(1),td:nth-child(1){width:10%}th:nth-child(2),td:nth-child(2){width:33%}th:nth-child(3),td:nth-child(3){width:7%}th:nth-child(4),td:nth-child(4){width:10%}th:nth-child(5),td:nth-child(5){width:9%}th:nth-child(6),td:nth-child(6){width:9%}th:nth-child(7),td:nth-child(7){width:9%}th:nth-child(8),td:nth-child(8){width:13%}</style></head><body><div class="page-shell"><div class="page-inner"><div class="header"><div class="header-brand"><div class="header-logo"><img src="${logoUrl}" alt="Judo Club Cattenom Rodemack"/></div><div class="header-text"><h1>Judo Club Cattenom Rodemack</h1><p>Maison des arts martiaux</p><p>57570 Cattenom</p><p>judoclubcattenom@gmail.com</p></div></div><div class="document-badge"><span class="label">Document de remboursement</span><h2>Note de frais</h2><p>Période ${month}/${year}</p></div></div><div class="info-grid"><section class="info-card"><h3>Informations du demandeur</h3><div class="info-list"><div class="info-row"><span class="label">Nom et prénom</span><span class="value">${safeCoachDisplayName}</span></div><div class="info-row"><span class="label">Adresse</span><span class="value">${safeAddress}</span></div><div class="info-row"><span class="label">Poste</span><span class="value">${safeProfileLabel}</span></div><div class="info-row"><span class="label">Date d'édition</span><span class="value">${today}</span></div></div></section><section class="info-card"><h3>Informations véhicule</h3><div class="info-list"><div class="info-row"><span class="label">Véhicule</span><span class="value">${safeVehicle}</span></div><div class="info-row"><span class="label">Puissance fiscale</span><span class="value">${safeFiscalPower} CV</span></div><div class="info-row"><span class="label">Barème appliqué</span><span class="value">${safeMileageScaleDescription}</span></div><div class="info-row"><span class="label">Mois concerné</span><span class="value">${month}/${year}</span></div></div></section></div><section class="summary-section"><h3>Synthèse des remboursements</h3><div class="summary-grid"><div class="summary-card"><span class="label">Kilométrage</span><span class="value">${totalMileageAmount.toFixed(2).replace('.', ',')} €</span></div><div class="summary-card"><span class="label">Péages</span><span class="value">${totalTollAmount.toFixed(2).replace('.', ',')} €</span></div><div class="summary-card"><span class="label">Hôtel</span><span class="value">${totalHotelAmount.toFixed(2).replace('.', ',')} €</span></div><div class="summary-card"><span class="label">Achats</span><span class="value">${totalPurchaseAmount.toFixed(2).replace('.', ',')} €</span></div><div class="summary-card total"><span class="label">Total à rembourser</span><span class="value">${total.toFixed(2).replace('.', ',')} €</span></div></div></section><section class="details-section"><h3>Détail des dépenses</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Dépense / trajet</th><th>Km</th><th>Km €</th><th>Péage</th><th>Hôtel</th><th>Achat</th><th>Total</th></tr></thead><tbody>${tableRows.join('')}<tr class="total-row"><td colspan="7" class="amount">TOTAL TTC</td><td class="amount">${total.toFixed(2).replace('.', ',')} €</td></tr></tbody></table></div></section><div class="note"><strong>ℹ️ Note :</strong> Le remboursement kilométrique est calculé selon le barème légal. Les péages, frais d'hôtel et achats sont remboursés sur montant réel. Un justificatif est obligatoire pour chaque péage, hôtel ou achat.</div><div class="signature"><div><strong>${safeSignatureLabel}</strong><br><br><br>${safeCoachDisplayName}</div><div><strong>Signature de l'employeur</strong><br><br><br>Président du Judo Club</div></div></div></div></body></html>`;
    };

    showMileagePreviewModal(renderHtml({ embeddedPreview: true }), 'Aperçu note de frais');
    logAuditEvent('export.expense_html', 'export', buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { total_amount: total } }));
  }

  function openMileagePreviewModal() {
    exportExpenseHTML();
  }

  return { exportExpenseHTML, openMileagePreviewModal };
}
