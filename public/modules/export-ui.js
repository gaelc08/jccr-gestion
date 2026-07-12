function createExportUI({
  getCurrentCoach,
  getCurrentMonth,
  getTimeData,
  getSelectedDay,
  getCurrentUser,
  getCurrentAccessToken,
  getCoaches,
  supabase,
  supabaseUrl,
  supabaseKey,
  logAuditEvent,
  buildMonthlyAuditPayload,
  downloadBlob,
  loadExcelJs,
  blobToDataUrl,
  escapeHtml,
  normalizeMonth,
  getCoachDisplayName,
  getProfileLabel,
  getProfileType,
  isVolunteerProfile,
  isAdminProfile,
  getMileageScaleDescription,
  getMonthlyMileageBreakdown
}) {
  function __formatMonthLabel(monthValue) {
    const normalized = normalizeMonth(monthValue);
    const [year, month] = String(normalized ?? "").split("-");
    if (!year || !month) return normalized;
    return `${month}/${year}`;
  }
  function __closeMileagePreviewModal() {
    document.getElementById("mileagePreviewModal")?.classList.remove("active");
  }
  function __getMonthlyExpenseReceiptIssues(coachId, year, month) {
    const timeData = getTimeData();
    const issues = [];
    Object.keys(timeData).filter((key) => key.startsWith(`${coachId}-${year}-${month}`)).sort().forEach((key) => {
      const date = key.split("-").slice(-3).join("-");
      const data = timeData[key] ?? {};
      const missing = [];
      if ((data.peage ?? 0) > 0 && !data.justificationUrl) missing.push("p\xE9age");
      if ((data.hotel ?? 0) > 0 && !data.hotelJustificationUrl) missing.push("h\xF4tel");
      if ((data.achat ?? 0) > 0 && !data.achatJustificationUrl) missing.push("achat");
      if (missing.length) issues.push({ date, missing });
    });
    return issues;
  }
  function __showMileagePreviewModal(html, modalTitle = "Aper\xE7u") {
    let modal = document.getElementById("mileagePreviewModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "mileagePreviewModal";
      modal.className = "modal export-preview-modal";
      modal.innerHTML = `
        <div class="modal-content export-preview-content">
          <h2 id="previewModalTitle"></h2>
          <div class="export-preview-toolbar">
            <button id="previewPrintBtn" class="btn-primary">\u{1F5A8}\uFE0F Imprimer / PDF</button>
            <button id="previewCloseBtn" class="btn-danger">Fermer</button>
          </div>
          <iframe id="mileagePreviewFrame" class="export-preview-frame" title="Aper\xE7u"></iframe>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) __closeMileagePreviewModal();
      });
      modal.querySelector("#previewCloseBtn")?.addEventListener("click", __closeMileagePreviewModal);
    }
    const titleEl = modal.querySelector("#previewModalTitle");
    if (titleEl) titleEl.textContent = modalTitle;
    const iframe = modal.querySelector("#mileagePreviewFrame");
    const printBtn = modal.querySelector("#previewPrintBtn");
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
    modal.classList.add("active");
  }
  async function exportDeclarationXLS() {
    const currentCoach = getCurrentCoach();
    const currentMonth = getCurrentMonth();
    const timeData = getTimeData();
    const currentUser = getCurrentUser();
    if (!currentCoach || !currentMonth) {
      alert("Veuillez s\xE9lectionner un profil et un mois.");
      return;
    }
    if (isVolunteerProfile(currentCoach) || isAdminProfile(currentCoach)) {
      alert("L'export de d\xE9claration salaire n'est pas disponible pour un profil b\xE9n\xE9vole ou administrateur.");
      return;
    }
    const [year, month] = currentMonth.split("-");
    const rows = Object.keys(timeData).filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`)).sort().map((key) => {
      const date = key.split("-").slice(-3).join("-");
      const data = timeData[key];
      const hours = Number(data.hours) || 0;
      const hourlyRate = Number(currentCoach.hourly_rate) || 0;
      const trainingAmount = hours * hourlyRate;
      const competitionAllowance = data.competition ? Number(currentCoach.daily_allowance) || 0 : 0;
      return {
        date,
        description: data.description || (data.competition ? "Jour de comp\xE9tition" : "Entra\xEEnement"),
        hours,
        hourlyRate,
        trainingAmount,
        competition: !!data.competition,
        competitionAllowance,
        declaredTotal: trainingAmount + competitionAllowance
      };
    });
    if (!rows.length) {
      alert("Aucune donn\xE9e \xE0 d\xE9clarer pour ce mois.");
      return;
    }
    const totalHours = rows.reduce((s, r) => s + r.hours, 0);
    const competitionDays = rows.reduce((s, r) => s + (r.competition ? 1 : 0), 0);
    const totalTrainingAmount = rows.reduce((s, r) => s + r.trainingAmount, 0);
    const totalCompetitionAllowance = rows.reduce((s, r) => s + r.competitionAllowance, 0);
    const grandTotal = rows.reduce((s, r) => s + r.declaredTotal, 0);
    const coachDisplayName = getCoachDisplayName(currentCoach) || currentCoach.name;
    const exportDate = (/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR");
    const ExcelJS = await loadExcelJs();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Judo Club Cattenom Rodemack";
    workbook.created = /* @__PURE__ */ new Date();
    const worksheet = workbook.addWorksheet("D\xE9claration salaire", {
      properties: { defaultRowHeight: 22 },
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 } },
      views: [{ showGridLines: false }]
    });
    worksheet.columns = [{ width: 14 }, { width: 28 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }];
    const navyFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F3460" } };
    const lightFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2FF" } };
    const totalFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9F1FB" } };
    const border = { top: { style: "thin", color: { argb: "FFC7D2E0" } }, left: { style: "thin", color: { argb: "FFC7D2E0" } }, bottom: { style: "thin", color: { argb: "FFC7D2E0" } }, right: { style: "thin", color: { argb: "FFC7D2E0" } } };
    try {
      const logoResponse = await fetch(new URL("logo-jcc.png", window.location.href));
      if (logoResponse.ok) {
        const logoBase64 = await blobToDataUrl(await logoResponse.blob());
        const imageId = workbook.addImage({ base64: logoBase64, extension: "png" });
        worksheet.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 58, height: 58 } });
      }
    } catch (e) {
      console.warn("Logo load error:", e);
    }
    worksheet.mergeCells("C1:H1");
    worksheet.getCell("C1").value = "D\xE9claration salaire";
    worksheet.getCell("C1").font = { name: "Calibri", size: 18, bold: true, color: { argb: "FF0F3460" } };
    worksheet.mergeCells("C2:H2");
    worksheet.getCell("C2").value = `Judo Club Cattenom Rodemack \u2014 p\xE9riode ${month}/${year}`;
    worksheet.getCell("C2").font = { name: "Calibri", size: 11, color: { argb: "FF526274" } };
    const coach = currentCoach;
    const metaRows = [
      ["Intervenant", coachDisplayName || "Non renseign\xE9", "Mois d\xE9clar\xE9", `${month}/${year}`],
      ["Adresse", coach.address || "Non renseign\xE9e", "Taux horaire", Number(coach.hourly_rate) || 0],
      ["Indemnit\xE9 forfaitaire comp\xE9tition", Number(coach.daily_allowance) || 0, "Date d'\xE9dition", exportDate]
    ];
    metaRows.forEach((values, index) => {
      const rowNumber = 5 + index;
      const row = worksheet.getRow(rowNumber);
      row.values = values;
      [1, 3].forEach((col) => {
        const cell = row.getCell(col);
        cell.fill = lightFill;
        cell.font = { bold: true, color: { argb: "FF0F3460" } };
        cell.border = border;
      });
      [2, 4].forEach((col) => {
        const cell = row.getCell(col);
        cell.border = border;
        if (rowNumber === 6 && col === 4) cell.numFmt = "#,##0.00 \u20AC";
        if (rowNumber === 7 && col === 2) cell.numFmt = "#,##0.00 \u20AC";
      });
    });
    worksheet.mergeCells("A9:H9");
    const st = worksheet.getCell("A9");
    st.value = "Synth\xE8se \xE0 d\xE9clarer";
    st.font = { bold: true, size: 12, color: { argb: "FF0F3460" } };
    const sh = worksheet.getRow(10);
    sh.values = ["Heures prest\xE9es", "Jours de comp\xE9tition", "Montant heures", "Indemnit\xE9s forfaitaires", "Total d\xE9claration"];
    sh.eachCell((cell, col) => {
      if (col <= 5) {
        cell.fill = navyFill;
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.border = border;
        cell.alignment = { horizontal: "center" };
      }
    });
    const sv = worksheet.getRow(11);
    sv.values = [totalHours, competitionDays, totalTrainingAmount, totalCompetitionAllowance, grandTotal];
    sv.eachCell((cell, col) => {
      if (col <= 5) {
        cell.border = border;
        cell.alignment = { horizontal: col <= 2 ? "center" : "right" };
        if (col >= 3) cell.numFmt = "#,##0.00 \u20AC";
        if (col === 1) cell.numFmt = "0.0";
      }
    });
    worksheet.mergeCells("A13:H13");
    const dt = worksheet.getCell("A13");
    dt.value = "D\xE9tail de la d\xE9claration";
    dt.font = { bold: true, size: 12, color: { argb: "FF0F3460" } };
    const dh = worksheet.getRow(14);
    dh.values = ["Date", "Libell\xE9", "Heures prest\xE9es", "Taux horaire", "Montant heures", "Jour comp\xE9tition", "Indemnit\xE9 forfaitaire", "Total d\xE9clar\xE9"];
    dh.eachCell((cell) => {
      cell.fill = navyFill;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.border = border;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    let drn = 15;
    rows.forEach((rowData, index) => {
      const row = worksheet.getRow(drn);
      row.values = [rowData.date, rowData.description, rowData.hours, rowData.hourlyRate, rowData.trainingAmount, rowData.competition ? "Oui" : "Non", rowData.competitionAllowance, rowData.declaredTotal];
      row.eachCell((cell, col) => {
        cell.border = border;
        cell.alignment = { vertical: "middle", horizontal: [3, 4, 5, 7, 8].includes(col) ? "right" : col === 6 ? "center" : "left", wrapText: col === 2 };
        if (index % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FBFF" } };
        if (col === 3) cell.numFmt = "0.0";
        if ([4, 5, 7, 8].includes(col)) cell.numFmt = "#,##0.00 \u20AC";
      });
      drn++;
    });
    const tr = worksheet.getRow(drn);
    tr.values = ["TOTAL", "", totalHours, "", totalTrainingAmount, competitionDays, totalCompetitionAllowance, grandTotal];
    tr.eachCell((cell, col) => {
      cell.border = border;
      cell.fill = totalFill;
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: [3, 5, 6, 7, 8].includes(col) ? "right" : "left" };
      if (col === 3) cell.numFmt = "0.0";
      if ([5, 7, 8].includes(col)) cell.numFmt = "#,##0.00 \u20AC";
    });
    worksheet.mergeCells(`A${drn + 2}:H${drn + 3}`);
    const nc = worksheet.getCell(`A${drn + 2}`);
    nc.value = "Ce fichier correspond \xE0 la d\xE9claration salaire du mois.";
    nc.alignment = { wrapText: true, vertical: "top" };
    nc.border = border;
    nc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FBFF" } };
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = String(currentCoach.name || "intervenant").replace(/[^a-z0-9_\-]/gi, "_");
    downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `declaration_salaire_${safeName}_${currentMonth}.xlsx`);
    await logAuditEvent("export.declaration_xlsx", "export", buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { coach_name: coachDisplayName ?? null, total_hours: totalHours, competition_days: competitionDays, total_amount: grandTotal } }));
  }
  function exportExpenseHTML() {
    const currentCoach = getCurrentCoach();
    const currentMonth = getCurrentMonth();
    const timeData = getTimeData();
    if (!currentCoach || !currentMonth) {
      alert("Veuillez s\xE9lectionner un profil et un mois.");
      return;
    }
    const [year, month] = currentMonth.split("-");
    const today = (/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR");
    const mileageBreakdown = getMonthlyMileageBreakdown(currentCoach, currentMonth);
    const receiptIssues = __getMonthlyExpenseReceiptIssues(currentCoach.id, year, month);
    if (receiptIssues.length) {
      const details = receiptIssues.map((i) => `- ${i.date} : justificatif manquant pour ${i.missing.join(", ")}`).join("\n");
      alert(`Impossible d'exporter la note de frais.
Ajoutez les justificatifs obligatoires pour :
${details}`);
      return;
    }
    const rows = [];
    let total = 0;
    Object.keys(timeData).filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`)).sort().forEach((key) => {
      const date = key.split("-").slice(-3).join("-");
      const data = timeData[key];
      const hasExpense = (data.km ?? 0) > 0 || (data.peage ?? 0) > 0 || (data.hotel ?? 0) > 0 || (data.achat ?? 0) > 0;
      if (!hasExpense) return;
      const mileage = mileageBreakdown.byKey?.[key] ?? { amount: 0, effectiveRate: 0 };
      const amount = mileage.amount + (data.peage ?? 0) + (data.hotel ?? 0) + (data.achat ?? 0);
      total += amount;
      rows.push({ date, ...data, mileageAmount: mileage.amount, tollAmount: data.peage ?? 0, hotelAmount: data.hotel ?? 0, purchaseAmount: data.achat ?? 0, amount, effectiveRate: mileage.effectiveRate });
    });
    if (total === 0) {
      alert("Aucune d\xE9pense saisie pour ce mois.");
      return;
    }
    const logoUrl = new URL("logo-jcc.png", window.location.href).href;
    const coachDisplayName = getCoachDisplayName(currentCoach) || currentCoach.name;
    const profileLabel = getProfileLabel(currentCoach, { capitalized: true });
    const signatureLabel = isVolunteerProfile(currentCoach) || isAdminProfile(currentCoach) ? "Signature du b\xE9n\xE9vole / administrateur" : "Signature du salari\xE9";
    const totalMileageAmount = rows.reduce((s, r) => s + (r.mileageAmount || 0), 0);
    const totalTollAmount = rows.reduce((s, r) => s + (r.tollAmount || 0), 0);
    const totalHotelAmount = rows.reduce((s, r) => s + (r.hotelAmount || 0), 0);
    const totalPurchaseAmount = rows.reduce((s, r) => s + (r.purchaseAmount || 0), 0);
    const totalMileageKm = rows.reduce((s, r) => s + (Number(r.km) || 0), 0);
    const mileageScaleDescription = getMileageScaleDescription(currentCoach.fiscal_power);
    const esc = (v, fb = "") => escapeHtml(v || fb);
    const sanitizeUrl = (v) => {
      if (!v) return "";
      try {
        const u = new URL(String(v), window.location.href);
        if (!["http:", "https:"].includes(u.protocol.toLowerCase())) return "";
        return escapeHtml(u.href);
      } catch {
        return "";
      }
    };
    const buildJustifLinks = (row) => {
      const links = [];
      const t = sanitizeUrl(row.justificationUrl);
      const h = sanitizeUrl(row.hotelJustificationUrl);
      const a = sanitizeUrl(row.achatJustificationUrl);
      if (t) links.push(`<a href="${t}" target="_blank" rel="noopener noreferrer">P\xE9age</a>`);
      if (h) links.push(`<a href="${h}" target="_blank" rel="noopener noreferrer">H\xF4tel</a>`);
      if (a) links.push(`<a href="${a}" target="_blank" rel="noopener noreferrer">Achat</a>`);
      return links.length ? `<div class="justif-links">${links.join("")}</div>` : '<span class="meta-line">Aucun justificatif</span>';
    };
    const safeCoachName = esc(currentCoach.name);
    const safeCoachDisplayName = esc(coachDisplayName, "Non renseign\xE9");
    const safeAddress = esc(currentCoach.address, "Non renseign\xE9e");
    const safeProfileLabel = esc(profileLabel);
    const safeVehicle = esc(currentCoach.vehicle, "Non renseign\xE9");
    const safeFiscalPower = esc(currentCoach.fiscal_power, "Non renseign\xE9e");
    const safeMileageScaleDescription = esc(mileageScaleDescription);
    const safeSignatureLabel = esc(signatureLabel);
    const tableRows = rows.map((row) => `
      <tr>
        <td>${esc(row.date)}</td>
        <td><div class="expense-cell"><strong>${esc(row.description, "D\xE9placement judo")}</strong><span class="route-line">${esc(row.departurePlace, "-")} \u2192 ${esc(row.arrivalPlace, "-")}</span>${buildJustifLinks(row)}</div></td>
        <td class="number">${Number(row.km) || 0}</td>
        <td class="amount">${(row.mileageAmount || 0).toFixed(2).replace(".", ",")} \u20AC</td>
        <td class="amount">${(row.tollAmount || 0).toFixed(2).replace(".", ",")} \u20AC</td>
        <td class="amount">${(row.hotelAmount || 0).toFixed(2).replace(".", ",")} \u20AC</td>
        <td class="amount">${(row.purchaseAmount || 0).toFixed(2).replace(".", ",")} \u20AC</td>
        <td class="amount">${(row.amount || 0).toFixed(2).replace(".", ",")} \u20AC</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Note de frais - ${safeCoachName} - ${month}/${year}</title></head><body>${tableRows}</body></html>`;
    __showMileagePreviewModal(html, "Aper\xE7u note de frais");
    void logAuditEvent("export.expense_html", "export", buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { total_amount: total } }));
  }
  async function exportTimesheetHTML() {
    const currentCoach = getCurrentCoach();
    const currentMonth = getCurrentMonth();
    const timeData = getTimeData();
    if (!currentCoach || !currentMonth) {
      alert("Veuillez s\xE9lectionner un profil et un mois.");
      return;
    }
    const [year, month] = currentMonth.split("-");
    const today = (/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR");
    const logoUrl = new URL("logo-jcc.png", window.location.href).href;
    const coachDisplayName = getCoachDisplayName(currentCoach) || currentCoach.name;
    const profileLabel = getProfileLabel(currentCoach, { capitalized: true });
    const signatureLabel = isVolunteerProfile(currentCoach) || isAdminProfile(currentCoach) ? "Signature du b\xE9n\xE9vole / administrateur" : "Signature du salari\xE9";
    const hourlyRate = Number(currentCoach.hourly_rate) || 0;
    const dailyAllowance = Number(currentCoach.daily_allowance) || 0;
    const esc = (v, fb = "") => escapeHtml(v || fb);
    let totalHours = 0, competitionDays = 0, totalCompetitionAllowance = 0, totalTrainingAmount = 0, totalAmount = 0;
    const rows = [];
    Object.keys(timeData).filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`)).sort().forEach((key) => {
      const date = key.split("-").slice(-3).join("-");
      const data = timeData[key];
      const hours = Number(data.hours) || 0;
      const competition = !!data.competition;
      if (hours > 0 || competition) {
        const trainingAmount = hours * hourlyRate;
        const competitionAllowance = competition ? dailyAllowance : 0;
        const lineTotal = trainingAmount + competitionAllowance;
        totalHours += hours;
        totalTrainingAmount += trainingAmount;
        if (competition) competitionDays++;
        totalCompetitionAllowance += competitionAllowance;
        totalAmount += lineTotal;
        rows.push({ date, hours, competition, trainingAmount, competitionAllowance, lineTotal, description: data.description || "" });
      }
    });
    if (!rows.length) {
      alert("Aucune heure d'entra\xEEnement ni comp\xE9tition saisie pour ce mois.");
      return;
    }
    const tableRows = rows.map((r) => `
      <tr>
        <td>${esc(r.date)}</td>
        <td class="number">${r.hours}</td>
        <td class="amount">${hourlyRate.toFixed(2).replace(".", ",")} \u20AC</td>
        <td class="amount">${r.trainingAmount.toFixed(2).replace(".", ",")} \u20AC</td>
        <td class="amount">${r.competitionAllowance.toFixed(2).replace(".", ",")} \u20AC</td>
        <td class="amount">${r.lineTotal.toFixed(2).replace(".", ",")} \u20AC</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Relev\xE9 heures - ${esc(currentCoach.name)} - ${month}/${year}</title></head><body>${tableRows}</body></html>`;
    __showMileagePreviewModal(html, "Aper\xE7u pointage mensuel");
    await logAuditEvent("export.timesheet_html", "export", buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { total_hours: totalHours, competition_days: competitionDays } }));
  }
  async function exportMonthlyExpenses(format = "csv", month = null) {
    const currentAccessToken = getCurrentAccessToken();
    const resolvedMonth = month ?? getCurrentMonth();
    if (!resolvedMonth) {
      alert("Veuillez s\xE9lectionner un mois.");
      return;
    }
    const btn = document.getElementById("exportMonthlyExpensesBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "\u23F3 Export en cours\u2026";
    }
    try {
      const res = await globalThis.fetch(`${supabaseUrl}/functions/v1/export-monthly-expenses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${currentAccessToken}`, "Content-Type": "application/json", apikey: supabaseKey },
        body: JSON.stringify({ month: resolvedMonth, format })
      });
      if (!res.ok) {
        const t = await res.text();
        alert("Erreur export : " + t);
        return;
      }
      const blob = await res.blob();
      const ext = format === "xlsx" ? "xlsx" : "csv";
      downloadBlob(blob, `export_frais_${resolvedMonth}.${ext}`);
    } catch (e) {
      alert("Erreur lors de l'export : " + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "\u{1F4CA} Export mensuel frais";
      }
    }
  }
  async function exportBackupJSON() {
    const currentAccessToken = getCurrentAccessToken();
    const currentUser = getCurrentUser();
    if (!currentUser) {
      alert("Non connect\xE9.");
      return;
    }
    try {
      const [coachesRes, timeDataRes] = await Promise.all([
        globalThis.fetch(`${supabaseUrl}/rest/v1/users?select=*`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}` } }),
        globalThis.fetch(`${supabaseUrl}/rest/v1/time_data?select=*`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}` } })
      ]);
      if (!coachesRes.ok || !timeDataRes.ok) throw new Error(`Erreur Supabase (users: ${coachesRes.status}, time_data: ${timeDataRes.status})`);
      const coachesData = await coachesRes.json();
      const timeDataData = await timeDataRes.json();
      const backup = { exportedAt: (/* @__PURE__ */ new Date()).toISOString(), coaches: coachesData, time_data: timeDataData };
      downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }), `backup_jcc_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`);
      await logAuditEvent("export.backup_json", "export", { entityId: null, targetUserId: null, targetEmail: null, metadata: { exported_by: currentUser.email } });
    } catch (e) {
      alert("Erreur lors de la sauvegarde : " + e.message);
    }
  }
  async function importCoachData(data) {
    const currentAccessToken = getCurrentAccessToken();
    if (!data?.coaches || !data?.time_data) {
      alert("Format de fichier JSON invalide.");
      return;
    }
    if (!confirm(`Importer ${data.coaches.length} profil(s) et ${data.time_data.length} entr\xE9e(s) ?`)) return;
    try {
      const failures = [];
      for (const [i, coach] of data.coaches.entries()) {
        const res = await globalThis.fetch(`${supabaseUrl}/rest/v1/users`, { method: "POST", headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}`, "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates" }, body: JSON.stringify(coach) });
        if (!res.ok) failures.push(`coach #${i + 1}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      }
      for (const [i, row] of data.time_data.entries()) {
        const res = await globalThis.fetch(`${supabaseUrl}/rest/v1/time_data`, { method: "POST", headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}`, "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates" }, body: JSON.stringify(row) });
        if (!res.ok) failures.push(`time_data #${i + 1}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      }
      if (failures.length > 0) {
        alert(`Import termin\xE9 avec ${failures.length} \xE9chec(s) :
` + failures.join("\n"));
      } else {
        alert("Import termin\xE9 avec succ\xE8s.");
      }
    } catch (e) {
      alert("Erreur lors de l'import : " + e.message);
    }
  }
  async function openMileagePreviewModal() {
    exportExpenseHTML();
  }
  async function openMonthlySummaryPreviewModal() {
    const currentMonth = getCurrentMonth();
    const timeData = getTimeData();
    const coaches = getCoaches ? getCoaches() : [];
    if (!currentMonth) {
      alert("Veuillez s\xE9lectionner un mois.");
      return;
    }
    const [year, month] = currentMonth.split("-");
    const monthLabel = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const rows = coaches.map((coach) => {
      const keys = Object.keys(timeData).filter((k) => k.startsWith(`${coach.id}-${year}-${month}`));
      const totalHours = keys.reduce((s, k) => s + (timeData[k].hours ?? 0), 0);
      const totalCompetitions = keys.filter((k) => timeData[k].competition).length;
      const totalKm = keys.reduce((s, k) => s + (Number(timeData[k].km) || 0), 0);
      const mileage = getMonthlyMileageBreakdown(coach, currentMonth);
      const totalMileageAmount = mileage?.total ?? 0;
      const salary = isVolunteerProfile(coach) || isAdminProfile(coach) ? 0 : totalHours * (coach.hourly_rate ?? 0);
      return { coach, totalHours, totalCompetitions, totalKm, totalMileageAmount, salary };
    }).filter((r) => r.totalHours > 0 || r.totalKm > 0);
    if (rows.length === 0) {
      alert(`Aucune donn\xE9e saisie pour ${monthLabel}.`);
      return;
    }
    const fmt = (n) => Number(n ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalSalary = rows.reduce((s, r) => s + r.salary, 0);
    const totalMileage = rows.reduce((s, r) => s + r.totalMileageAmount, 0);
    const tableRows = rows.map((r) => `
      <tr>
        <td>${escapeHtml(getCoachDisplayName(r.coach))}</td>
        <td>${escapeHtml(getProfileLabel(r.coach) || (isVolunteerProfile(r.coach) ? "B\xE9n\xE9vole" : "Entra\xEEneur"))}</td>
        <td style="text-align:center">${r.totalHours}</td>
        <td style="text-align:center">${r.totalCompetitions}</td>
        <td style="text-align:center">${r.totalKm}</td>
        <td style="text-align:right">${fmt(r.totalMileageAmount)} \u20AC</td>
        <td style="text-align:right">${isVolunteerProfile(r.coach) || isAdminProfile(r.coach) ? "\u2014" : fmt(r.salary) + " \u20AC"}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Synth\xE8se ${escapeHtml(monthLabel)}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;font-size:13px}h2{color:#1a1a2e}table{border-collapse:collapse;width:100%;margin-top:16px}th{background:#1a1a2e;color:#fff;padding:8px 12px;text-align:left}td{padding:7px 12px;border-bottom:1px solid #e0e0e0}tr:nth-child(even) td{background:#f7f7f7}tfoot td{font-weight:bold;border-top:2px solid #1a1a2e}</style></head><body>
      <h2>\u{1F4CA} Synth\xE8se du mois \u2014 ${escapeHtml(monthLabel)}</h2>
      <table><thead><tr><th>Profil</th><th>Type</th><th>Heures</th><th>Comp\xE9titions</th><th>Km</th><th>Indemnit\xE9s km</th><th>Salaire brut</th></tr></thead>
      <tbody>${tableRows}</tbody>
      <tfoot><tr><td colspan="5">Total</td><td style="text-align:right">${fmt(totalMileage)} \u20AC</td><td style="text-align:right">${fmt(totalSalary)} \u20AC</td></tr></tfoot></table></body></html>`;
    __showMileagePreviewModal(html, "Aper\xE7u synth\xE8se du mois");
  }
  return {
    exportDeclarationXLS,
    exportExpenseHTML,
    exportTimesheetHTML,
    exportMonthlyExpenses,
    exportBackupJSON,
    importCoachData,
    openMileagePreviewModal,
    openMonthlySummaryPreviewModal
  };
}
export {
  createExportUI
};
