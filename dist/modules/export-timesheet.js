// export-timesheet.js — Relevé d'heures & synthèse mensuelle HTML
import { showMileagePreviewModal } from './export-helpers.js';

export function createExportTimesheet({
  getCurrentCoach,
  getCurrentMonth,
  getTimeData,
  getCoaches,
  escapeHtml,
  getCoachDisplayName,
  getProfileLabel,
  isVolunteerProfile,
  isAdminProfile,
  getMonthlyMileageBreakdown,
  logAuditEvent,
  buildMonthlyAuditPayload,
}) {
  async function exportTimesheetHTML() {
    const currentCoach = getCurrentCoach();
    const currentMonth = getCurrentMonth();
    const timeData = getTimeData();

    if (!currentCoach || !currentMonth) { alert('Veuillez sélectionner un profil et un mois.'); return; }
    const [year, month] = currentMonth.split('-');
    const today = new Date().toLocaleDateString('fr-FR');
    const logoUrl = new URL('logo-jcc.png', window.location.href).href;
    const coachDisplayName = getCoachDisplayName(currentCoach) || currentCoach.name;
    const profileLabel = getProfileLabel(currentCoach, { capitalized: true });
    const signatureLabel = isVolunteerProfile(currentCoach) || isAdminProfile(currentCoach) ? 'Signature du bénévole / administrateur' : 'Signature du salarié';
    const hourlyRate = Number(currentCoach.hourly_rate) || 0;
    const dailyAllowance = Number(currentCoach.daily_allowance) || 0;
    const esc = (v, fb = '') => escapeHtml(v || fb);

    let totalHours = 0, competitionDays = 0, totalCompetitionAllowance = 0, totalTrainingAmount = 0, totalAmount = 0;
    const rows = [];
    Object.keys(timeData).filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`)).sort().forEach((key) => {
      const date = key.split('-').slice(-3).join('-');
      const data = timeData[key];
      const hours = Number(data.hours) || 0;
      const competition = !!data.competition;
      if (hours > 0 || competition) {
        const trainingAmount = hours * hourlyRate;
        const competitionAllowance = competition ? dailyAllowance : 0;
        const lineTotal = trainingAmount + competitionAllowance;
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

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Relevé d'heures - ${esc(currentCoach.name)} - ${month}/${year}</title><style>*{box-sizing:border-box}@media print{@page{size:A4 portrait;margin:8mm}*{box-shadow:none!important;text-shadow:none!important;filter:none!important}html,body{width:194mm;margin:0;padding:0;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}.page-shell{box-shadow:none;border:none;margin:0;width:194mm;max-width:194mm;min-height:0!important;display:flex;border-radius:0}.page-inner{padding:0;min-height:0!important;display:flex;flex-direction:column}.header,.header-brand{display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:space-between!important;gap:12px!important}.document-badge{text-align:right!important;min-width:180px!important}.info-grid,.summary-grid,.signature{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}.info-row{grid-template-columns:120px 1fr!important}.summary-card.total{grid-column:1/-1!important}}body{margin:0;padding:10px;background:#eef3f9;color:#243447;font-family:Inter,Arial,sans-serif}.page-shell{width:194mm;max-width:194mm;min-height:245mm;margin:0 auto;background:#fff;border:none;border-radius:0;box-shadow:none;display:flex;overflow:hidden}.page-inner{padding:14px 16px 16px;min-height:245mm;display:flex;flex-direction:column}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:2px solid #d8e2ef;padding-bottom:10px;margin-bottom:10px}.header-brand{display:flex;align-items:flex-start;gap:12px}.header-logo{width:160px;height:160px;flex:0 0 auto;display:flex;align-items:flex-start;justify-content:center}.header-logo img{max-width:144px;max-height:144px}.header-text{text-align:center}.header-text h1{margin:0 0 4px;font-size:1.1rem;color:#0f3460}.header-text p{margin:1px 0;color:#526274;font-size:.72rem}.document-badge{text-align:right;min-width:180px}.document-badge .label{display:inline-block;padding:5px 10px;border-radius:999px;background:#eaf2ff;color:#145da0;font-weight:700;font-size:.68rem;letter-spacing:.03em;text-transform:uppercase}.document-badge h2{margin:6px 0 2px;font-size:1rem;color:#0f3460}.document-badge p{margin:0;color:#66788a;font-size:.75rem}.info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}.info-card,.summary-card{border:1px solid #d8e2ef;border-radius:16px;background:#f9fbfe}.info-card{padding:10px 12px}.info-card h3,.summary-section h3,.details-section h3{margin:0 0 8px;color:#0f3460;font-size:.86rem}.info-list{display:grid;gap:5px}.info-row{display:grid;grid-template-columns:120px 1fr;gap:6px;font-size:.74rem}.info-row .label{color:#66788a;font-weight:600}.info-row .value{color:#243447;font-weight:600}.summary-section{margin-bottom:10px}.summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.summary-card{padding:9px 10px;background:linear-gradient(180deg,#fbfdff 0%,#f1f6fc 100%)}.summary-card .label{display:block;color:#66788a;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px}.summary-card .value{font-size:.94rem;font-weight:800;color:#0f3460}.summary-card.total{grid-column:1/-1;background:linear-gradient(135deg,#0f3460,#145da0);border-color:transparent}.summary-card.total .label,.summary-card.total .value{color:#fff}.details-section{margin-top:4px}.table-wrap{width:100%;border:1px solid #d8e2ef;border-radius:12px;overflow:hidden}table{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed;background:#fff}th,td{border-bottom:1px solid #e4ebf3;padding:6px 8px;font-size:.7rem;text-align:left;vertical-align:top;line-height:1.3}thead th{background:#0f3460;color:#fff;font-weight:700}tbody tr:nth-child(even){background:#f9fbfe}.amount,.number{text-align:right;font-variant-numeric:tabular-nums}.total-row td{font-weight:800;background:#edf4ff;color:#0f3460;border-bottom:none}.signature{margin-top:auto;padding-top:20px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;page-break-inside:avoid}.signature>div{min-height:46px;border-top:2px solid #243447;padding-top:6px;text-align:center;font-weight:600;font-size:.7rem}th:nth-child(1),td:nth-child(1){width:16%}th:nth-child(2),td:nth-child(2){width:14%}th:nth-child(3),td:nth-child(3){width:14%}th:nth-child(4),td:nth-child(4){width:18%}th:nth-child(5),td:nth-child(5){width:18%}th:nth-child(6),td:nth-child(6){width:20%}</style></head><body><div class="page-shell"><div class="page-inner"><div class="header"><div class="header-brand"><div class="header-logo"><img src="${logoUrl}" alt="Judo Club Cattenom Rodemack"/></div><div class="header-text"><h1>Judo Club Cattenom Rodemack</h1><p>Maison des arts martiaux</p><p>57570 Cattenom</p><p>judoclubcattenom@gmail.com</p></div></div><div class="document-badge"><span class="label">Relevé d'heures mensuel</span><h2>${month}/${year}</h2><p>Édité le ${today}</p></div></div><div class="info-grid"><div class="info-card"><h3>Informations ${esc(profileLabel)}</h3><div class="info-list"><div class="info-row"><span class="label">Nom complet</span><span class="value">${esc(coachDisplayName)}</span></div><div class="info-row"><span class="label">Email</span><span class="value">${esc(currentCoach.email, '-')}</span></div><div class="info-row"><span class="label">Statut</span><span class="value">${esc(profileLabel)}</span></div></div></div><div class="info-card"><h3>Paramètres du mois</h3><div class="info-list"><div class="info-row"><span class="label">Mois / Année</span><span class="value">${month}/${year}</span></div><div class="info-row"><span class="label">Taux horaire</span><span class="value">${hourlyRate.toFixed(2)} €</span></div><div class="info-row"><span class="label">Indemnité compétition</span><span class="value">${dailyAllowance.toFixed(2)} €</span></div></div></div></div><div class="summary-section"><h3>Récapitulatif</h3><div class="summary-grid"><div class="summary-card"><span class="label">Total Heures</span><span class="value">${totalHours}</span></div><div class="summary-card"><span class="label">Jours compétition</span><span class="value">${competitionDays}</span></div><div class="summary-card"><span class="label">Indemnités compétition</span><span class="value">${totalCompetitionAllowance.toFixed(2)} €</span></div><div class="summary-card total"><span class="label">Total à payer</span><span class="value">${totalAmount.toFixed(2)} €</span></div></div></div><div class="details-section"><h3>Détail des heures et compétitions</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th class="number">Durée (h)</th><th class="amount">Taux</th><th class="amount">Montant heures</th><th class="amount">Indemnité compétition</th><th class="amount">Total ligne</th></tr></thead><tbody>${tableRows}<tr class="total-row"><td>Total</td><td class="number">${totalHours}</td><td class="amount">-</td><td class="amount">${totalTrainingAmount.toFixed(2)} €</td><td class="amount">${totalCompetitionAllowance.toFixed(2)} €</td><td class="amount">${totalAmount.toFixed(2)} €</td></tr></tbody></table></div></div><div class="signature"><div>${esc(signatureLabel)}</div><div>Pour le club (Trésorier / Président)</div></div></div></div></body></html>`;

    showMileagePreviewModal(html, 'Aperçu pointage mensuel');
    await logAuditEvent('export.timesheet_html', 'export', buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { total_hours: totalHours, competition_days: competitionDays } }));
  }

  async function openMonthlySummaryPreviewModal() {
    const currentMonth = getCurrentMonth();
    const timeData = getTimeData();
    const coaches = getCoaches ? getCoaches() : [];
    if (!currentMonth) { alert('Veuillez sélectionner un mois.'); return; }

    const [year, month] = currentMonth.split('-');
    const monthLabel = new Date(Number(year), Number(month) - 1, 1)
      .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    const rows = coaches.map((coach) => {
      const keys = Object.keys(timeData).filter((k) => k.startsWith(`${coach.id}-${year}-${month}`));
      const totalHours = keys.reduce((s, k) => s + (timeData[k].hours || 0), 0);
      const totalCompetitions = keys.filter((k) => timeData[k].competition).length;
      const totalKm = keys.reduce((s, k) => s + (Number(timeData[k].km) || 0), 0);
      const mileage = getMonthlyMileageBreakdown(coach, currentMonth);
      const totalMileageAmount = mileage?.total || 0;
      const salary = isVolunteerProfile(coach) || isAdminProfile(coach) ? 0 : totalHours * (coach.hourly_rate || 0);
      return { coach, totalHours, totalCompetitions, totalKm, totalMileageAmount, salary };
    }).filter((r) => r.totalHours > 0 || r.totalKm > 0);

    if (rows.length === 0) { alert(`Aucune donnée saisie pour ${monthLabel}.`); return; }

    const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalSalary = rows.reduce((s, r) => s + r.salary, 0);
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

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
      <title>Synthèse ${monthLabel}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; }
        h2 { color: #1a1a2e; }
        table { border-collapse: collapse; width: 100%; margin-top: 16px; }
        th { background: #1a1a2e; color: #fff; padding: 8px 12px; text-align: left; }
        td { padding: 7px 12px; border-bottom: 1px solid #e0e0e0; }
        tr:nth-child(even) td { background: #f7f7f7; }
        tfoot td { font-weight: bold; border-top: 2px solid #1a1a2e; }
      </style></head><body>
      <h2>📊 Synthèse du mois — ${escapeHtml(monthLabel)}</h2>
      <table>
        <thead><tr>
          <th>Profil</th><th>Type</th><th>Heures</th><th>Compétitions</th><th>Km</th><th>Indemnités km</th><th>Salaire brut</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
        <tfoot><tr>
          <td colspan="5">Total</td>
          <td style="text-align:right">${fmt(totalMileage)} €</td>
          <td style="text-align:right">${fmt(totalSalary)} €</td>
        </tr></tfoot>
      </table>
    </body></html>`;

    showMileagePreviewModal(html, 'Aperçu synthèse du mois');
  }

  return { exportTimesheetHTML, openMonthlySummaryPreviewModal };
}
