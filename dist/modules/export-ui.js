// export-ui.js — Factory principale : assemble les sous-modules export
import { createExportDeclaration } from './export-declaration.js';
import { createExportExpense } from './export-expense.js';
import { createExportTimesheet } from './export-timesheet.js';
import { createExportData } from './export-data.js';

/**
 * createExportUI — factory that injects all state/service dependencies
 * and returns the export/import functions as a module API.
 * Interface publique identique à l'original — aucun changement côté appelant.
 */
export function createExportUI(deps) {
  const declaration = createExportDeclaration(deps);
  const expense = createExportExpense(deps);
  const timesheet = createExportTimesheet(deps);
  const data = createExportData(deps);

  return {
    exportDeclarationXLS:          declaration.exportDeclarationXLS,
    exportExpenseHTML:             expense.exportExpenseHTML,
    openMileagePreviewModal:       expense.openMileagePreviewModal,
    exportTimesheetHTML:           timesheet.exportTimesheetHTML,
    openMonthlySummaryPreviewModal: timesheet.openMonthlySummaryPreviewModal,
    exportMonthlyExpenses:         data.exportMonthlyExpenses,
    exportBackupJSON:              data.exportBackupJSON,
    importCoachData:               data.importCoachData,
  };
}
