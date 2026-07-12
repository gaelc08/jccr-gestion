// auth-state.js — onAuthStateChange handler + UI init post-login
import {
  coaches, currentCoach,
  setCurrentUser, setCurrentSession, setCurrentAccessToken,
  setCoaches, setTimeData, setAuditLogs, setCurrentCoach,
  currentUser, __eventListenersSetup, setEventListenersSetup,
} from './app-context.js';
import { __describeJwt } from './shared-utils.js';
import { isCurrentUserAdminDB, invalidateAdminCache } from './auth-admin-cache.js';

let __uiInitializedForUser = null;
let __adminFirstNameCache  = null;

const ADMIN_ELS = [
  'adminActionsPanel', 'adminProfileBtn', 'addCoachBtn', 'editCoachBtn', 'inviteAdminBtn',
  'freezeBtn', 'auditLogsBtn', 'helloAssoBtn', 'competitionsBtn', 'exportMonthlyExpensesBtn',
  'importBtn', 'backupBtn', 'adminTopBar',
];

function applyAdminUI(isAdmin) {
  ADMIN_ELS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'adminActionsPanel') {
      el.style.display = isAdmin ? 'block' : 'none';
    } else if (id === 'adminTopBar') {
      el.style.display = isAdmin ? 'flex' : 'none';
    } else {
      el.style.display = isAdmin ? (el.closest('#appSidebar') ? 'block' : 'inline-block') : 'none';
    }
  });
}

export function setupAuthStateChange(supabase, {
  loadAllDataFromSupabase,
  loadCoaches,
  updateCoachGreeting,
  updateCalendar,
  updateSummary,
  setupEventListeners,
  getInviteFlowActive,
  setInviteFlowActive,
}) {
  supabase.auth.onAuthStateChange(async (event, session) => {
    setCurrentSession(session || null);
    setCurrentAccessToken(session?.access_token || null);
    window.__lastSession = session;

    if (event === 'TOKEN_REFRESHED') return;

    invalidateAdminCache();

    // --- Invite flow ---
    if (event === 'SIGNED_IN' && getInviteFlowActive?.() && session?.user) {
      document.getElementById('invitePasswordModal')?.classList.add('active');
      const inviteSetPasswordBtn = document.getElementById('inviteSetPasswordBtn');
      if (!inviteSetPasswordBtn) return;
      inviteSetPasswordBtn.onclick = async () => {
        const newPass     = document.getElementById('inviteNewPasswordInput')?.value;
        const confirmPass = document.getElementById('inviteConfirmPasswordInput')?.value;
        if (!newPass)                  { alert('Veuillez saisir un mot de passe.'); return; }
        if (newPass.length < 8)        { alert('Le mot de passe doit contenir au moins 8 caractères.'); return; }
        if (newPass !== confirmPass)   { alert('Les mots de passe ne correspondent pas.'); return; }
        setInviteFlowActive(false);
        document.getElementById('invitePasswordModal')?.classList.remove('active');
        const { error } = await supabase.auth.updateUser({ password: newPass });
        if (error) {
          setInviteFlowActive(true);
          document.getElementById('invitePasswordModal')?.classList.add('active');
          document.getElementById('inviteNewPasswordInput').value    = '';
          document.getElementById('inviteConfirmPasswordInput').value = '';
          alert(error.message);
        } else {
          document.getElementById('inviteNewPasswordInput').value    = '';
          document.getElementById('inviteConfirmPasswordInput').value = '';
        }
      };
      return;
    }

    // --- Password recovery ---
    if (event === 'PASSWORD_RECOVERY') {
      document.getElementById('passwordResetModal')?.classList.add('active');
      const updatePasswordBtn = document.getElementById('updatePasswordBtn');
      if (!updatePasswordBtn) return;
      updatePasswordBtn.onclick = async () => {
        const newPass     = document.getElementById('newPasswordInput')?.value;
        const confirmPass = document.getElementById('confirmPasswordInput')?.value;
        if (!newPass)                { alert('Veuillez saisir un nouveau mot de passe.'); return; }
        if (newPass.length < 8)     { alert('Le mot de passe doit contenir au moins 8 caractères.'); return; }
        if (newPass !== confirmPass) { alert('Les mots de passe ne correspondent pas.'); return; }
        const { error } = await supabase.auth.updateUser({ password: newPass });
        if (error) {
          alert(error.message);
        } else {
          document.getElementById('newPasswordInput').value    = '';
          document.getElementById('confirmPasswordInput').value = '';
          document.getElementById('passwordResetModal')?.classList.remove('active');
          alert('Mot de passe mis à jour avec succès. Veuillez vous reconnecter.');
          await supabase.auth.signOut();
        }
      };
      return;
    }

    const statusSpan = document.getElementById('authStatus');
    const select     = document.getElementById('coachSelect');
    const user       = session?.user;

    if (user) {
      setCurrentUser(user);
      if (statusSpan) statusSpan.textContent = `Connecté : ${user.email}`;
      document.getElementById('authContainer').style.display = 'none';
      document.getElementById('appContainer').style.display  = 'block';

      if (__uiInitializedForUser === user.id) return;
      __uiInitializedForUser = user.id;

      const isAdmin = await isCurrentUserAdminDB();
      applyAdminUI(isAdmin);

      if (isAdmin) {
        const topMonth    = document.getElementById('adminTopBarMonthSelect');
        const sidebarMonth = document.getElementById('monthSelect');
        if (topMonth && sidebarMonth) topMonth.value = sidebarMonth.value;
      }

      if (select) select.disabled = !isAdmin;
      updateCoachGreeting?.(user, null, isAdmin);

      try {
        await loadAllDataFromSupabase({ isAdminOverride: isAdmin });
        if (select) loadCoaches?.();
        if (!isAdmin && coaches.length > 0) {
          setCurrentCoach(coaches[0]);
          if (select) select.value = String(coaches[0].id);
        } else if (isAdmin && coaches.length > 0) {
          const ownProfile = coaches.find(c => c.owner_uid === user.id);
          if (ownProfile) {
            setCurrentCoach(ownProfile);
            if (select) select.value = String(ownProfile.id);
          }
        }
        if (isAdmin) {
          const topCoach = document.getElementById('adminTopBarCoachSelect');
          if (topCoach && select) topCoach.value = select.value;
        }
      } catch (e) {
        console.error('Failed to load data:', e);
        if (select) loadCoaches?.();
      }

      updateCoachGreeting?.(user, !isAdmin && coaches.length > 0 ? coaches[0] : null, isAdmin);

      if (isAdmin) {
        if (__adminFirstNameCache) {
          updateCoachGreeting?.(user, { first_name: __adminFirstNameCache }, isAdmin);
        } else {
          supabase.from('admin_profiles').select('first_name').eq('owner_uid', user.id).maybeSingle()
            .then(({ data: ap }) => {
              if (ap?.first_name) {
                __adminFirstNameCache = ap.first_name;
                updateCoachGreeting?.(user, { first_name: ap.first_name }, isAdmin);
              }
            })
            .catch(() => {});
        }
      }

      if (!__eventListenersSetup) {
        setupEventListeners?.();
        setEventListenersSetup(true);
      }

      try { updateCalendar?.(); updateSummary?.(); } catch (e) { console.error('Failed to update UI:', e); }

      if (!currentCoach) {
        import('./competitions-ui.js').then(m => {
          const section = document.getElementById('competitionsSection');
          if (section) section.style.display = 'block';
          m.showCompetitionsSection();
        }).catch(() => {});
      }

    } else {
      // Signed out
      setCurrentUser(null);
      setCurrentSession(null);
      setCurrentAccessToken(null);
      setCoaches([]);
      setTimeData({});
      setAuditLogs([]);
      setCurrentCoach(null);
      __uiInitializedForUser = null;
      __adminFirstNameCache  = null;
      if (select) select.innerHTML = '<option value="">-- Sélectionner --</option>';
      if (statusSpan) statusSpan.textContent = 'Non connecté.';
      document.getElementById('authContainer').style.display = 'flex';
      document.getElementById('appContainer').style.display  = 'none';
      updateCoachGreeting?.(null, null, true);
    }
  });
}
