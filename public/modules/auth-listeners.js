// auth-listeners.js
// Handles auth form handlers + onAuthStateChange logic.
// All UI code extracted from app-modular.js.

import { supabaseUrl, supabaseKey } from './env.js';
import {
  currentUser, currentSession, currentAccessToken, coaches, currentCoach, __eventListenersSetup,
  setCurrentUser, setCurrentSession, setCurrentAccessToken,
  setCoaches, setTimeData, setAuditLogs, setCurrentCoach, setEventListenersSetup,
} from './app-context.js';
import { __describeJwt, __hasAdminClaim } from './shared-utils.js';

// ===== PKCE helpers =====
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ===== SSO callback handler =====
async function handleSSOCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  if (!code) return;

  const verifier = sessionStorage.getItem('pkce_verifier');
  if (!verifier) {
    console.error('SSO: no PKCE verifier found in sessionStorage');
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  console.log('SSO callback detected, exchanging code for tokens...');

  try {
    // Exchange code for tokens at Keycloak
    const tokenEndpoint = 'https://auth.judo-cattenom.fr/realms/jccattenom/protocol/openid-connect/token';
    const clientSecret = 'pdOiQ5MNnwW6UPXTfy9L2J9i2kC4CEpV';
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'supabase',
      client_secret: clientSecret,
      code: code,
      redirect_uri: window.location.origin + window.location.pathname,
      code_verifier: verifier,
    });

    const tokenResp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.json();
      throw new Error(err.error_description || err.error || `Token exchange failed: ${tokenResp.status}`);
    }

    const tokens = await tokenResp.json();
    const idToken = tokens.id_token;

    if (!idToken) {
      throw new Error('No id_token received from Keycloak');
    }

    console.log('ID token received, signing into Supabase via signInWithIdToken...');

    // Sign into Supabase using the Keycloak ID token
    const { data, error } = await _supabase.auth.signInWithIdToken({
      provider: 'keycloak',
      token: idToken,
    });

    if (error) {
      throw new Error(`Supabase auth failed: ${error.message}`);
    }

    console.log('SSO login successful!', data);
  } catch (e) {
    console.error('SSO callback error:', e);
    alert('Erreur SSO : ' + e.message);
  } finally {
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
    sessionStorage.removeItem('pkce_verifier');
  }
}

let _supabase = null;
let _isCurrentUserAdminDB = null;
let _loadAllDataFromSupabase = null;
let _loadCoaches = null;
let _updateCoachGreeting = null;
let _updateCalendar = null;
let _updateSummary = null;
let _setupEventListeners = null;
let _inviteFlowActive = false;
let __adminCache = { userId: null, value: null, atMs: 0 };
let __adminInFlight = null;
let __adminFirstNameCache = null; // cache prénom admin pour éviter flicker
let __uiInitializedForUser = null; // UID de l'utilisateur dont l'UI est déjà initialisée

export function initAuthListeners({
  supabase,
  isCurrentUserAdminDB,
  loadAllDataFromSupabase,
  loadCoaches,
  updateCoachGreeting,
  updateCalendar,
  updateSummary,
  setupEventListeners,
  inviteFlowActive,
  setInviteFlowActive,
}) {
  _supabase = supabase;
  _isCurrentUserAdminDB = isCurrentUserAdminDB;
  _loadAllDataFromSupabase = loadAllDataFromSupabase;
  _loadCoaches = loadCoaches;
  _updateCoachGreeting = updateCoachGreeting;
  _updateCalendar = updateCalendar;
  _updateSummary = updateSummary;
  _setupEventListeners = setupEventListeners;
  _inviteFlowActive = inviteFlowActive;
  _setInviteFlowActive = setInviteFlowActive;
}

let _setInviteFlowActive = null;

// ===== Admin check (with TTL cache) =====
export async function isCurrentUserAdminDB() {
  if (!currentUser) { console.log('DEBUG no currentUser'); return false; }

  const { isAdminViaLocalClaims } = await import('./auth-admin.js');
  const { isAdminViaRest } = await import('./auth-admin.js');

  const localAdmin = isAdminViaLocalClaims({
    accessToken: currentAccessToken,
    currentUser,
    currentSession,
    hasAdminClaim: __hasAdminClaim,
  });

  const ttlMs = 5 * 60 * 1000;
  if (__adminCache.userId === currentUser.id && typeof __adminCache.value === 'boolean' && (Date.now() - __adminCache.atMs) < ttlMs) {
    return __adminCache.value;
  }

  if (__adminInFlight) {
    try { return await __adminInFlight; } catch { /* fall through */ }
  }

  __adminInFlight = (async () => {
    let value = await isAdminViaRest({
      supabaseUrl,
      supabaseKey,
      accessToken: currentAccessToken,
      currentUser,
      fetchImpl: globalThis.fetch?.bind(globalThis),
    });
    if (!value && localAdmin) {
      console.warn('DEBUG is_admin REST returned false, using local admin claim fallback');
      value = true;
    }
    __adminCache = { userId: currentUser.id, value, atMs: Date.now() };
    return value;
  })();

  try {
    const value = await __adminInFlight;
    console.log('DEBUG is_admin (REST):', value);
    return value;
  } catch (e) {
    console.warn('DEBUG is_admin (REST) failed:', e);
    if (localAdmin) {
      __adminCache = { userId: currentUser.id, value: true, atMs: Date.now() };
      return true;
    }
    if (__adminCache.userId === currentUser.id && typeof __adminCache.value === 'boolean') {
      return __adminCache.value;
    }
    return false;
  } finally {
    __adminInFlight = null;
  }
}

export function invalidateAdminCache() {
  __adminCache = { userId: null, value: null, atMs: 0 };
  __adminInFlight = null;
}

// ===== Auth form listeners =====
export function setupAuthListeners() {
  console.log('DEBUG setupAuthListeners called');

  // Handle SSO callback if present
  if (new URLSearchParams(window.location.search).has('code')) {
    handleSSOCallback();
  }

  const emailInput     = document.getElementById('authEmail');
  const passwordInput  = document.getElementById('authPassword');
  const registerBtn    = document.getElementById('registerBtn');
  const loginBtn       = document.getElementById('loginBtn');
  const resetPasswordBtn = document.getElementById('resetPasswordBtn');
  const logoutBtn      = document.getElementById('logoutBtn');
  const statusSpan     = document.getElementById('authStatus');

  if (!loginBtn || !logoutBtn) {
    console.error('DEBUG loginBtn or logoutBtn not found in DOM');
  }

  registerBtn?.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const pass  = passwordInput.value.trim();
    if (!email || !pass) { alert('Veuillez saisir votre adresse e-mail et votre mot de passe.'); return; }
    try {
      const { data, error } = await _supabase.auth.signUp({ email, password: pass });
      if (error) throw error;
      statusSpan.textContent = 'Compte créé et connecté.';
    } catch (e) { alert(e.message); }
  });

  loginBtn?.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const pass  = passwordInput.value.trim();
    if (!email || !pass) { alert('Veuillez saisir votre adresse e-mail et votre mot de passe.'); return; }
    try {
      const { error } = await _supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
    } catch (e) { alert(e.message); }
  });

  const ssoBtn = document.getElementById('ssoBtn');
  ssoBtn?.addEventListener('click', () => {
    ssoBtn.disabled = true;
    ssoBtn.textContent = 'Redirection...';
    // PKCE OAuth flow directly to Keycloak
    const codeVerifier = generateCodeVerifier();
    sessionStorage.setItem('pkce_verifier', codeVerifier);
    generateCodeChallenge(codeVerifier).then(challenge => {
      const kcAuthUrl = 'https://auth.judo-cattenom.fr/realms/jccattenom/protocol/openid-connect/auth';
      const params = new URLSearchParams({
        client_id: 'supabase',
        redirect_uri: window.location.origin + window.location.pathname,
        response_type: 'code',
        scope: 'openid email profile',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
      window.location.href = `${kcAuthUrl}?${params.toString()}`;
    });
  });

  logoutBtn?.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    try {
      const { error } = await _supabase.auth.signOut({ scope: 'global' });
      if (error) { alert('Logout failed: ' + error.message); return; }
      setCurrentUser(null);
      document.getElementById('appContainer').style.display  = 'none';
      document.getElementById('authContainer').style.display = 'flex';
    } catch (e) {
      alert('Logout exception: ' + e.message);
    } finally {
      logoutBtn.disabled = false;
    }
  });

  resetPasswordBtn?.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) { alert('Veuillez saisir votre adresse e-mail.'); return; }
    try {
      const { error } = await _supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) throw error;
      alert('E-mail de réinitialisation envoyé. Vérifiez votre boîte de réception.');
    } catch (e) { alert(e.message); }
  });

  // ===== onAuthStateChange =====
  _supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('DEBUG onAuthStateChange:', event, session);
    setCurrentSession(session || null);
    setCurrentAccessToken(session?.access_token || null);
    window.__lastSession = session;

    // Ne pas recharger l'UI sur les refresh de token silencieux
    if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      if (event !== 'INITIAL_SESSION') return; // TOKEN_REFRESHED = juste mettre à jour le token
    }

    invalidateAdminCache();

    if (currentAccessToken) {
      console.log('DEBUG access token present:', String(currentAccessToken).slice(0, 12) + '...');
      console.log('DEBUG access token details:', __describeJwt(currentAccessToken));
    }

    // --- Invite flow ---
    if (event === 'SIGNED_IN' && _inviteFlowActive && session?.user) {
      document.getElementById('invitePasswordModal')?.classList.add('active');
      const inviteSetPasswordBtn = document.getElementById('inviteSetPasswordBtn');
      if (!inviteSetPasswordBtn) { console.warn('WARN missing element: #inviteSetPasswordBtn'); return; }
      inviteSetPasswordBtn.onclick = async () => {
        const newPass     = document.getElementById('inviteNewPasswordInput').value;
        const confirmPass = document.getElementById('inviteConfirmPasswordInput').value;
        if (!newPass)            { alert('Veuillez saisir un mot de passe.'); return; }
        if (newPass.length < 8)  { alert('Le mot de passe doit contenir au moins 8 caractères.'); return; }
        if (newPass !== confirmPass) { alert('Les mots de passe ne correspondent pas.'); return; }
        _setInviteFlowActive?.(false);
        _inviteFlowActive = false;
        document.getElementById('invitePasswordModal')?.classList.remove('active');
        const { error } = await _supabase.auth.updateUser({ password: newPass });
        if (error) {
          _inviteFlowActive = true;
          _setInviteFlowActive?.(true);
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
      if (!updatePasswordBtn) { console.warn('WARN missing element: #updatePasswordBtn'); return; }
      updatePasswordBtn.onclick = async () => {
        const newPass     = document.getElementById('newPasswordInput').value;
        const confirmPass = document.getElementById('confirmPasswordInput').value;
        if (!newPass)            { alert('Veuillez saisir un nouveau mot de passe.'); return; }
        if (newPass.length < 8)  { alert('Le mot de passe doit contenir au moins 8 caractères.'); return; }
        if (newPass !== confirmPass) { alert('Les mots de passe ne correspondent pas.'); return; }
        const { error } = await _supabase.auth.updateUser({ password: newPass });
        if (error) {
          alert(error.message);
        } else {
          document.getElementById('newPasswordInput').value    = '';
          document.getElementById('confirmPasswordInput').value = '';
          document.getElementById('passwordResetModal')?.classList.remove('active');
          alert('Mot de passe mis à jour avec succès. Veuillez vous reconnecter.');
          await _supabase.auth.signOut();
        }
      };
      return;
    }

    const statusSpanInner = document.getElementById('authStatus');
    const select          = document.getElementById('coachSelect');
    const user            = session?.user;

    if (user) {
      setCurrentUser(user);
      if (statusSpanInner) statusSpanInner.textContent = `Connecté : ${user.email}`;
      document.getElementById('authContainer').style.display = 'none';
      document.getElementById('appContainer').style.display  = 'block';

      // Ignorer si l'UI est déjà initialisée pour cet utilisateur
      if (__uiInitializedForUser === user.id) return;
      __uiInitializedForUser = user.id;

      const isAdmin = await isCurrentUserAdminDB();
      const adminEls = [
        'adminActionsPanel', 'adminProfileBtn', 'addCoachBtn', 'editCoachBtn', 'inviteAdminBtn',
        'freezeBtn', 'auditLogsBtn', 'helloAssoBtn', 'competitionsBtn', 'exportMonthlyExpensesBtn',
        'importGroup', 'backupBtn', 'adminTopBar',
      ];
      adminEls.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === 'adminActionsPanel' || id === 'importGroup') {
          el.style.display = isAdmin ? (id === 'importGroup' ? 'flex' : 'block') : 'none';
        } else if (id === 'adminTopBar') {
          el.style.display = isAdmin ? 'flex' : 'none';
        } else {
          // Si le bouton est dans la sidebar, utiliser 'block' (pas 'inline-block')
          const inSidebar = el.closest('#appSidebar');
          el.style.display = isAdmin ? (inSidebar ? 'block' : 'inline-block') : 'none';
        }
      });

      // Init admin top bar month value
      if (isAdmin) {
        const topMonth = document.getElementById('adminTopBarMonthSelect');
        const sidebarMonth = document.getElementById('monthSelect');
        if (topMonth && sidebarMonth) topMonth.value = sidebarMonth.value;
      }

      if (select) select.disabled = !isAdmin;
      _updateCoachGreeting?.(user, null, isAdmin);

      const prevCoaches    = coaches.slice();
      const prevCurrentCoach = currentUser;

      try {
        await _loadAllDataFromSupabase({ isAdminOverride: isAdmin });
        if (select) _loadCoaches?.();
        if (!isAdmin && coaches.length > 0) {
          setCurrentCoach(coaches[0]);
          if (select) select.value = String(coaches[0].id);
        } else if (isAdmin && coaches.length > 0) {
          // Auto-sélectionner le profil de l'admin connecté s'il en a un
          const ownProfile = coaches.find((c) => c.owner_uid === user.id);
          if (ownProfile) {
            setCurrentCoach(ownProfile);
            if (select) select.value = String(ownProfile.id);
          }
        }
        // Sync admin top bar coach select after coaches loaded
        if (isAdmin) {
          const topCoach = document.getElementById('adminTopBarCoachSelect');
          if (topCoach && select) topCoach.value = select.value;
        }
      } catch (e) {
        console.error('Failed to load data:', e);
        if (select) _loadCoaches?.();
      }

      _updateCoachGreeting?.(user, !isAdmin && coaches.length > 0 ? coaches[0] : null, isAdmin);
      // Pour l'admin, charger le prénom depuis admin_profiles — avec cache pour éviter le flicker
      if (isAdmin) {
        if (__adminFirstNameCache) {
          _updateCoachGreeting?.(user, { first_name: __adminFirstNameCache }, isAdmin);
        } else {
          _supabase.from('admin_profiles').select('first_name').eq('owner_uid', user.id).maybeSingle()
            .then(({ data: ap }) => {
              if (ap?.first_name) {
                __adminFirstNameCache = ap.first_name;
                _updateCoachGreeting?.(user, { first_name: ap.first_name }, isAdmin);
              }
            })
            .catch(() => {});
        }
      }

      if (!__eventListenersSetup) {
        _setupEventListeners?.();
        setEventListenersSetup(true);
      }
      try { _updateCalendar?.(); _updateSummary?.(); } catch (e) { console.error('Failed to update UI:', e); }

      // Afficher l'agenda par défaut si aucun profil sélectionné
      if (!currentCoach) {
        import('./competitions-ui.js').then((m) => {
          const section = document.getElementById('competitionsSection');
          if (section) section.style.display = 'block';
          m.showCompetitionsSection();
        }).catch(() => {});
      }

    } else {
      setCurrentUser(null);
      setCurrentSession(null);
      setCurrentAccessToken(null);
      setCoaches([]);
      setTimeData({});
      setAuditLogs([]);
      setCurrentCoach(null);
      __uiInitializedForUser = null; // reset pour permettre une nouvelle init au prochain login
      __adminFirstNameCache = null;
      if (select) select.innerHTML = '<option value="">-- Sélectionner --</option>';
      if (statusSpanInner) statusSpanInner.textContent = 'Non connecté.';
      document.getElementById('authContainer').style.display = 'flex';
      document.getElementById('appContainer').style.display  = 'none';
      _updateCoachGreeting?.(null, null, true);
    }
  });
}
