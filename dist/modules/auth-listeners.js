// auth-listeners.js — Factory principale : assemble auth-forms + auth-state
// Interface publique identique à l'original — aucun changement côté appelant.
import { setupAuthForms } from './auth-forms.js';
import { setupAuthStateChange } from './auth-state.js';
export { isCurrentUserAdminDB, invalidateAdminCache } from './auth-admin-cache.js';

export function initAuthListeners({
  supabase,
  isCurrentUserAdminDB: _ignored, // fourni par auth-admin-cache désormais
  loadAllDataFromSupabase,
  loadCoaches,
  updateCoachGreeting,
  updateCalendar,
  updateSummary,
  setupEventListeners,
  inviteFlowActive,
  setInviteFlowActive,
}) {
  setupAuthForms(supabase, {
    onLogoutSuccess() {
      const { setCurrentUser } = require('./app-context.js');
      setCurrentUser(null);
      document.getElementById('appContainer').style.display  = 'none';
      document.getElementById('authContainer').style.display = 'flex';
    },
  });

  setupAuthStateChange(supabase, {
    loadAllDataFromSupabase,
    loadCoaches,
    updateCoachGreeting,
    updateCalendar,
    updateSummary,
    setupEventListeners,
    getInviteFlowActive: () => inviteFlowActive,
    setInviteFlowActive,
  });
}

export function setupAuthListeners() {
  // Backward-compat shim — setupAuthForms est appelé dans initAuthListeners.
  // Conservé pour éviter toute rupture d'import dans app-modular.js.
}
