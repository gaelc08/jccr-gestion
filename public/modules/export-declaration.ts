// export-declaration.js — Export déclaration salaire (XLSX)

export function createExportDeclaration({
  getCurrentCoach,
  getCurrentMonth,
  getTimeData,
  getCurrentUser,
  isVolunteerProfile,
  isAdminProfile,
  getCoachDisplayName,
  getMileageScaleDescription,
  loadExcelJs,
  blobToDataUrl,
  downloadBlob,
  logAuditEvent,
  buildMonthlyAuditPayload,
}) {
  async function exportDeclarationXLS() {
    const currentCoach = getCurrentCoach();
    const currentMonth = getCurrentMonth();
    const timeData = getTimeData();

    if (!currentCoach || !currentMonth) { alert('Veuillez sélectionner un profil et un mois.'); return; }
    if (isVolunteerProfile(currentCoach) || isAdminProfile(currentCoach)) { alert("L'export de déclaration salaire n'est pas disponible pour un profil bénévole ou administrateur."); return; }

    const [year, month] = currentMonth.split('-');
    const rows = Object.keys(timeData)
      .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
      .sort()
      .map((key) => {
        const date = key.split('-').slice(-3).join('-');
        const data = timeData[key];
        const hours = Number(data.hours) || 0;
        const hourlyRate = Number(currentCoach.hourly_rate) || 0;
        const trainingAmount = hours * hourlyRate;
        const competitionAllowance = data.competition ? (Number(currentCoach.daily_allowance) || 0) : 0;
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

    const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);
    const competitionDays = rows.reduce((sum, r) => sum + (r.competition ? 1 : 0), 0);
    const totalTrainingAmount = rows.reduce((sum, r) => sum + r.trainingAmount, 0);
    const totalCompetitionAllowance = rows.reduce((sum, r) => sum + r.competitionAllowance, 0);
    const grandTotal = rows.reduce((sum, r) => sum + r.declaredTotal, 0);
    const coachDisplayName = getCoachDisplayName(currentCoach) || currentCoach.name;
    const exportDate = new Date().toLocaleDateString('fr-FR');

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
    } catch (e) { console.warn('Impossible de charger le logo pour export XLSX:', e); }

    worksheet.mergeCells('C1:H1');
    worksheet.getCell('C1').value = 'Déclaration salaire';
    worksheet.getCell('C1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F3460' } };
    worksheet.mergeCells('C2:H2');
    worksheet.getCell('C2').value = `Judo Club Cattenom Rodemack — période ${month}/${year}`;
    worksheet.getCell('C2').font = { name: 'Calibri', size: 11, color: { argb: 'FF526274' } };

    const metaRows = [
      ['Intervenant', coachDisplayName || 'Non renseigné', 'Mois déclaré', `${month}/${year}`],
      ['Adresse', currentCoach.address || 'Non renseignée', 'Taux horaire', Number(currentCoach.hourly_rate) || 0],
      ['Indemnité forfaitaire compétition', Number(currentCoach.daily_allowance) || 0, 'Date d\'édition', exportDate],
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
    nc.value = 'Ce fichier correspond à la déclaration salaire du mois. Il peut être ouvert dans Excel sans avertissement de format puis imprimé en PDF si nécessaire.';
    nc.alignment = { wrapText: true, vertical: 'top' }; nc.border = border;
    nc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = String(currentCoach.name || 'intervenant').replace(/[^a-z0-9_\-]/gi, '_');
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `declaration_salaire_${safeName}_${currentMonth}.xlsx`);
    await logAuditEvent('export.declaration_xlsx', 'export', buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { coach_name: coachDisplayName || null, total_hours: totalHours, competition_days: competitionDays, total_amount: grandTotal } }));
  }

  return { exportDeclarationXLS };
}
