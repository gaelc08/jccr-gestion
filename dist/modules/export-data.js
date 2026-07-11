// export-data.js — Export/Import données Supabase (CSV, XLSX, JSON, import)

export function createExportData({
  getCurrentAccessToken,
  getCurrentMonth,
  getCurrentUser,
  supabaseUrl,
  supabaseKey,
  downloadBlob,
  logAuditEvent,
}) {
  async function exportMonthlyExpenses(format = 'csv', month = null) {
    const currentAccessToken = getCurrentAccessToken();
    const resolvedMonth = month || getCurrentMonth();
    if (!resolvedMonth) { alert('Veuillez sélectionner un mois.'); return; }
    const btn = document.getElementById('exportMonthlyExpensesBtn');
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
    } catch (e) { alert('Erreur lors de l\'export : ' + e.message); } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📊 Export mensuel frais'; }
    }
  }

  async function exportBackupJSON() {
    const currentAccessToken = getCurrentAccessToken();
    const currentUser = getCurrentUser();
    if (!currentUser) { alert('Non connecté.'); return; }
    try {
      const [coachesRes, timeDataRes] = await Promise.all([
        globalThis.fetch(`${supabaseUrl}/rest/v1/users?select=*`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}` } }),
        globalThis.fetch(`${supabaseUrl}/rest/v1/time_data?select=*`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}` } }),
      ]);
      const coachesData = await coachesRes.json();
      const timeDataData = await timeDataRes.json();
      const backup = { exportedAt: new Date().toISOString(), coaches: coachesData, time_data: timeDataData };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `backup_jcc_${new Date().toISOString().slice(0, 10)}.json`);
      await logAuditEvent('export.backup_json', 'export', { entityId: null, targetUserId: null, targetEmail: null, metadata: { exported_by: currentUser.email } });
    } catch (e) { alert('Erreur lors de la sauvegarde : ' + e.message); }
  }

  async function importCoachData(data) {
    const currentAccessToken = getCurrentAccessToken();
    if (!data || !data.coaches || !data.time_data) { alert('Format de fichier JSON invalide.'); return; }
    if (!confirm(`Importer ${data.coaches.length} profil(s) et ${data.time_data.length} entrée(s) ? Les données existantes ne seront pas supprimées.`)) return;
    try {
      for (const coach of data.coaches) {
        await globalThis.fetch(`${supabaseUrl}/rest/v1/users`, {
          method: 'POST',
          headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
          body: JSON.stringify(coach),
        });
      }
      for (const row of data.time_data) {
        await globalThis.fetch(`${supabaseUrl}/rest/v1/time_data`, {
          method: 'POST',
          headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
          body: JSON.stringify(row),
        });
      }
      alert('Import terminé avec succès.');
    } catch (e) { alert('Erreur lors de l\'import : ' + e.message); }
  }

  return { exportMonthlyExpenses, exportBackupJSON, importCoachData };
}
