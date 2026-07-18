// auth-listeners.ts — Auth form handlers + onAuthStateChange logic.
import { supabaseUrl, supabaseKey, kcUrl, kcRealm, kcClient } from './env.js';
import {
  currentUser, currentSession, currentAccessToken, coaches, currentCoach, __eventListenersSetup,
  setCurrentUser, setCurrentSession, setCurrentAccessToken,
  setCoaches, setTimeData, setAuditLogs, setCurrentCoach, setEventListenersSetup,
} from './app-context.js';
import { __describeJwt, __hasAdminClaim } from './shared-utils.js';
import { isAdminViaLocalClaims, isAdminViaRest } from './auth-admin.js';
import type { User, Session } from '../../src/types/index.js';

// ─── Types ───────────────────────────────────────────────────────────────────
interface SupabaseAuth {
  signUp(opts: { email: string; password: string }): Promise<{ data: unknown; error: { message: string } | null }>;
  signInWithPassword(opts: { email: string; password: string }): Promise<{ error: { message: string } | null }>;
  signInWithIdToken(opts: { provider: string; token: string }): Promise<{ data: unknown; error: { message: string } | null }>;
  resetPasswordForEmail(email: string, opts?: { redirectTo?: string }): Promise<{ error: { message: string } | null }>;
  updateUser(opts: { password: string }): Promise<{ error: { message: string } | null }>;
  signOut(opts?: { scope?: string }): Promise<{ error: { message: string } | null }>;
  onAuthStateChange(cb: (event: string, session: Session | null) => void): void;
}

interface SupabaseFrom {
  select(cols: string): {
    eq(col: string, val: string): {
      maybeSingle(): Promise<{ data: { first_name?: string } | null }>;
    };
  };
}

interface SupabaseClient {
  auth: SupabaseAuth;
  from(table: string): SupabaseFrom;
  functions: { invoke(name: string, opts?: { body?: unknown }): Promise<unknown> };
}

export interface AuthListenersOptions {
  supabase: SupabaseClient;
  isCurrentUserAdminDB: () => Promise<boolean>;
  loadAllDataFromSupabase: (opts?: { isAdminOverride?: boolean }) => Promise<void>;
  loadCoaches: () => void;
  updateCoachGreeting: (user: User | null, coach: Partial<{ first_name: string }> | null, isAdmin: boolean) => void;
  updateCalendar: () => void;
  updateSummary: () => void;
  setupEventListeners: () => void;
  inviteFlowActive: boolean;
  setInviteFlowActive: (v: boolean) => void;
}

// ─── Module-level state ───────────────────────────────────────────────────────
let _supabase: SupabaseClient | null = null;
let _isCurrentUserAdminDB: (() => Promise<boolean>) | null = null;
let _loadAllDataFromSupabase: ((opts?: { isAdminOverride?: boolean }) => Promise<void>) | null = null;
let _loadCoaches: (() => void) | null = null;
let _updateCoachGreeting: ((user: User | null, coach: Partial<{ first_name: string }> | null, isAdmin: boolean) => void) | null = null;
let _updateCalendar: (() => void) | null = null;
let _updateSummary: (() => void) | null = null;
let _setupEventListeners: (() => void) | null = null;
let _inviteFlowActive = false;
let _setInviteFlowActive: ((v: boolean) => void) | null = null;

let __adminCache: { userId: string | null; value: boolean | null; atMs: number } = { userId: null, value: null, atMs: 0 };
let __adminInFlight: Promise<boolean> | null = null;
let __adminFirstNameCache: string | null = null;
let __uiInitializedForUser: string | null = null;

const ADMIN_TTL_MS = 5 * 60 * 1000;

// ─── PKCE helpers ─────────────────────────────────────────────────────────────
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── SSO callback ─────────────────────────────────────────────────────────────
async function handleSSOCallback(): Promise<void> {
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) return;

  const verifier = sessionStorage.getItem('pkce_verifier');
  if (!verifier) {
    console.error('SSO: no PKCE verifier found in sessionStorage');
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  console.log('SSO callback detected, exchanging code for tokens...');
  try {
    const tokenEndpoint = `${kcUrl}/realms/${kcRealm}/protocol/openid-connect/token`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'jcc-frontend',
      code,
      redirect_uri: window.location.origin + window.location.pathname,
      code_verifier: verifier,
    });

    const tokenResp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.json() as { error_description?: string; error?: string };
      throw new Error(err.error_description ?? err.error ?? `Token exchange failed: ${tokenResp.status}`);
    }

    const tokens = await tokenResp.json() as { id_token?: string };
    if (!tokens.id_token) throw new Error('No id_token received from Keycloak');

    console.log('ID token received, signing into Supabase via signInWithIdToken...');
    const { data, error } = await _supabase!.auth.signInWithIdToken({
      provider: 'keycloak',
      token: tokens.id_token,
    });
    if (error) throw new Error(`Supabase auth failed: ${error.message}`);
    console.log('SSO login successful!', data);
  } catch (e) {
    console.error('SSO callback error:', e);
    alert('Erreur SSO : ' + (e as Error).message);
  } finally {
    window.history.replaceState({}, '', window.location.pathname);
    sessionStorage.removeItem('pkce_verifier');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initAuthListeners(opts: AuthListenersOptions): void {
  _supabase = opts.supabase;
  _isCurrentUserAdminDB = opts.isCurrentUserAdminDB;
  _loadAllDataFromSupabase = opts.loadAllDataFromSupabase;
  _loadCoaches = opts.loadCoaches;
  _updateCoachGreeting = opts.updateCoachGreeting;
  _updateCalendar = opts.updateCalendar;
  _updateSummary = opts.updateSummary;
  _setupEventListeners = opts.setupEventListeners;
  _inviteFlowActive = opts.inviteFlowActive;
  _setInviteFlowActive = opts.setInviteFlowActive;
}

// ─── Admin cache (local, distinct from admin-service cache) ───────────────────
export async function isCurrentUserAdminDB(): Promise<boolean> {
  if (!currentUser) { console.log('DEBUG no currentUser'); return false; }

  const localAdmin = isAdminViaLocalClaims({
    accessToken: currentAccessToken,
    currentUser,
    currentSession,
    hasAdminClaim: __hasAdminClaim,
  });

  if (
    __adminCache.userId === currentUser.id &&
    typeof __adminCache.value === 'boolean' &&
    Date.now() - __adminCache.atMs < ADMIN_TTL_MS
  ) {
    return __adminCache.value;
  }

  if (__adminInFlight) {
    try { return await __adminInFlight; } catch { /* fall through */ }
  }

  __adminInFlight = (async () => {
    let value = await isAdminViaRest({
      supabaseUrl, supabaseKey,
      accessToken: currentAccessToken,
      currentUser,
      fetchImpl: globalThis.fetch?.bind(globalThis),
    });
    if (!value && localAdmin) {
      console.warn('DEBUG is_admin REST returned false, using local admin claim fallback');
      value = true;
    }
    __adminCache = { userId: currentUser!.id, value, atMs: Date.now() };
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

export function invalidateAdminCache(): void {
  __adminCache = { userId: null, value: null, atMs: 0 };
  __adminInFlight = null;
}

// ─── setupAuthListeners ───────────────────────────────────────────────────────
export function setupAuthListeners(): void {
  console.log('DEBUG setupAuthListeners called');

  if (new URLSearchParams(window.location.search).has('code')) {
    void handleSSOCallback();
  }

  const emailInput       = document.getElementById('authEmail')      as HTMLInputElement | null;
  const passwordInput    = document.getElementById('authPassword')   as HTMLInputElement | null;
  const registerBtn      = document.getElementById('registerBtn')    as HTMLButtonElement | null;
  const loginBtn         = document.getElementById('loginBtn')       as HTMLButtonElement | null;
  const resetPasswordBtn = document.getElementById('resetPasswordBtn') as HTMLButtonElement | null;
  const logoutBtn        = document.getElementById('logoutBtn')      as HTMLButtonElement | null;
  const statusSpan       = document.getElementById('authStatus')     as HTMLElement | null;

  if (!loginBtn || !logoutBtn) {
    console.error('DEBUG loginBtn or logoutBtn not found in DOM');
  }

  registerBtn?.addEventListener('click', async () => {
    const email = emailInput!.value.trim();
    const pass  = passwordInput!.value.trim();
    if (!email || !pass) { alert('Veuillez saisir votre adresse e-mail et votre mot de passe.'); return; }
    try {
      const { error } = await _supabase!.auth.signUp({ email, password: pass });
      if (error) throw error;
      if (statusSpan) statusSpan.textContent = 'Compte créé et connecté.';
    } catch (e) { alert((e as Error).message); }
  });

  loginBtn?.addEventListener('click', async () => {
    const email = emailInput!.value.trim();
    const pass  = passwordInput!.value.trim();
    if (!email || !pass) { alert('Veuillez saisir votre adresse e-mail et votre mot de passe.'); return; }
    try {
      const { error } = await _supabase!.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
    } catch (e) { alert((e as Error).message); }
  });

  const ssoBtn = document.getElementById('ssoBtn') as HTMLButtonElement | null;
  ssoBtn?.addEventListener('click', () => {
    ssoBtn.disabled = true;
    ssoBtn.textContent = 'Redirection...';
    const codeVerifier = generateCodeVerifier();
    sessionStorage.setItem('pkce_verifier', codeVerifier);
    generateCodeChallenge(codeVerifier).then((challenge) => {
      const kcAuthUrl = `${kcUrl}/realms/${kcRealm}/protocol/openid-connect/auth`;
      const params = new URLSearchParams({
        client_id: kcClient,
        redirect_uri: window.location.origin + window.location.pathname,
        response_type: 'code',
        scope: 'openid email profile',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
      window.location.href = `${kcAuthUrl}?${params.toString()}`;
    }).catch((err) => {
      console.error('SSO PKCE error, fallback sans PKCE:', err);
      const kcAuthUrl = `${kcUrl}/realms/${kcRealm}/protocol/openid-connect/auth`;
      const params = new URLSearchParams({
        client_id: kcClient,
        redirect_uri: window.location.origin + window.location.pathname,
        response_type: 'code',
        scope: 'openid email profile',
      });
      window.location.href = `${kcAuthUrl}?${params.toString()}`;
    });
  });

  logoutBtn?.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    try {
      const { error } = await _supabase!.auth.signOut({ scope: 'global' });
      if (error) { alert('Logout failed: ' + error.message); return; }
      setCurrentUser(null);
      (document.getElementById('appContainer')  as HTMLElement).style.display = 'none';
      (document.getElementById('authContainer') as HTMLElement).style.display = 'flex';
    } catch (e) {
      alert('Logout exception: ' + (e as Error).message);
    } finally {
      logoutBtn.disabled = false;
    }
  });

  resetPasswordBtn?.addEventListener('click', async () => {
    const email = emailInput!.value.trim();
    if (!email) { alert('Veuillez saisir votre adresse e-mail.'); return; }
    try {
      const { error } = await _supabase!.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) throw error;
      alert('E-mail de réinitialisation envoyé. Vérifiez votre boîte de réception.');
    } catch (e) { alert((e as Error).message); }
  });

  // ─── onAuthStateChange ───────────────────────────────────────────────────
  _supabase!.auth.onAuthStateChange(async (event, session) => {
    console.log('DEBUG onAuthStateChange:', event, session);
    setCurrentSession(session ?? null);
    setCurrentAccessToken(session?.access_token ?? null);
    (window as Record<string, unknown>).__lastSession = session;

    if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      if (event !== 'INITIAL_SESSION') return;
    }

    invalidateAdminCache();

    if (currentAccessToken) {
      console.log('DEBUG access token present:', String(currentAccessToken).slice(0, 12) + '...');
      console.log('DEBUG access token details:', __describeJwt(currentAccessToken));
    }

    // ── Invite flow ──
    if (event === 'SIGNED_IN' && _inviteFlowActive && session?.user) {
      document.getElementById('invitePasswordModal')?.classList.add('active');
      const inviteSetPasswordBtn = document.getElementById('inviteSetPasswordBtn') as HTMLButtonElement | null;
      if (!inviteSetPasswordBtn) { console.warn('WARN missing element: #inviteSetPasswordBtn'); return; }
      inviteSetPasswordBtn.onclick = async () => {
        const newPass     = (document.getElementById('inviteNewPasswordInput')     as HTMLInputElement).value;
        const confirmPass = (document.getElementById('inviteConfirmPasswordInput') as HTMLInputElement).value;
        if (!newPass)               { alert('Veuillez saisir un mot de passe.'); return; }
        if (newPass.length < 8)     { alert('Le mot de passe doit contenir au moins 8 caractères.'); return; }
        if (newPass !== confirmPass) { alert('Les mots de passe ne correspondent pas.'); return; }
        _setInviteFlowActive?.(false);
        _inviteFlowActive = false;
        document.getElementById('invitePasswordModal')?.classList.remove('active');
        const { error } = await _supabase!.auth.updateUser({ password: newPass });
        if (error) {
          _inviteFlowActive = true;
          _setInviteFlowActive?.(true);
          document.getElementById('invitePasswordModal')?.classList.add('active');
          (document.getElementById('inviteNewPasswordInput')     as HTMLInputElement).value = '';
          (document.getElementById('inviteConfirmPasswordInput') as HTMLInputElement).value = '';
          alert(error.message);
        } else {
          (document.getElementById('inviteNewPasswordInput')     as HTMLInputElement).value = '';
          (document.getElementById('inviteConfirmPasswordInput') as HTMLInputElement).value = '';
        }
      };
      return;
    }

    // ── Password recovery ──
    if (event === 'PASSWORD_RECOVERY') {
      document.getElementById('passwordResetModal')?.classList.add('active');
      const updatePasswordBtn = document.getElementById('updatePasswordBtn') as HTMLButtonElement | null;
      if (!updatePasswordBtn) { console.warn('WARN missing element: #updatePasswordBtn'); return; }
      updatePasswordBtn.onclick = async () => {
        const newPass     = (document.getElementById('newPasswordInput')     as HTMLInputElement).value;
        const confirmPass = (document.getElementById('confirmPasswordInput') as HTMLInputElement).value;
        if (!newPass)               { alert('Veuillez saisir un nouveau mot de passe.'); return; }
        if (newPass.length < 8)     { alert('Le mot de passe doit contenir au moins 8 caractères.'); return; }
        if (newPass !== confirmPass) { alert('Les mots de passe ne correspondent pas.'); return; }
        const { error } = await _supabase!.auth.updateUser({ password: newPass });
        if (error) {
          alert(error.message);
        } else {
          (document.getElementById('newPasswordInput')     as HTMLInputElement).value = '';
          (document.getElementById('confirmPasswordInput') as HTMLInputElement).value = '';
          document.getElementById('passwordResetModal')?.classList.remove('active');
          alert('Mot de passe mis à jour avec succès. Veuillez vous reconnecter.');
          await _supabase!.auth.signOut();
        }
      };
      return;
    }

    // ── Signed-in ──
    const statusSpanInner = document.getElementById('authStatus') as HTMLElement | null;
    const select          = document.getElementById('coachSelect') as HTMLSelectElement | null;
    const user            = session?.user ?? null;

    if (user) {
      setCurrentUser(user as User);
      if (statusSpanInner) statusSpanInner.textContent = `Connecté : ${user.email}`;
      (document.getElementById('authContainer') as HTMLElement).style.display = 'none';
      (document.getElementById('appContainer')  as HTMLElement).style.display = 'block';

      if (__uiInitializedForUser === user.id) return;
      __uiInitializedForUser = user.id;

      const isAdmin = await isCurrentUserAdminDB();
      const adminEls = [
        'adminActionsPanel', 'adminProfileBtn', 'addCoachBtn', 'editCoachBtn', 'inviteAdminBtn',
        'freezeBtn', 'auditLogsBtn', 'helloAssoBtn', 'competitionsBtn', 'exportMonthlyExpensesBtn',
        'importBtn', 'backupBtn', 'adminTopBar',
      ];
      adminEls.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === 'adminActionsPanel') {
          el.style.display = isAdmin ? 'block' : 'none';
        } else if (id === 'adminTopBar') {
          el.style.display = isAdmin ? 'flex' : 'none';
        } else {
          const inSidebar = el.closest('#appSidebar');
          el.style.display = isAdmin ? (inSidebar ? 'flex' : 'inline-block') : 'none';
        }
      });

      if (isAdmin) {
        const topMonth     = document.getElementById('adminTopBarMonthSelect') as HTMLSelectElement | null;
        const sidebarMonth = document.getElementById('monthSelect')            as HTMLSelectElement | null;
        if (topMonth && sidebarMonth) topMonth.value = sidebarMonth.value;
      }

      if (select) select.disabled = !isAdmin;
      _updateCoachGreeting?.(user as User, null, isAdmin);

      try {
        await _loadAllDataFromSupabase?.({ isAdminOverride: isAdmin });
        _loadCoaches?.();
        const coachesList = coaches as Array<{ id: unknown; owner_uid?: string }>;
        if (!isAdmin && coachesList.length > 0) {
          setCurrentCoach(coachesList[0] as Parameters<typeof setCurrentCoach>[0]);
          if (select) select.value = String(coachesList[0].id);
        } else if (isAdmin && coachesList.length > 0) {
          const ownProfile = coachesList.find((c) => c.owner_uid === user.id);
          if (ownProfile) {
            setCurrentCoach(ownProfile as Parameters<typeof setCurrentCoach>[0]);
            if (select) select.value = String(ownProfile.id);
          }
        }
        if (isAdmin) {
          const topCoach = document.getElementById('adminTopBarCoachSelect') as HTMLSelectElement | null;
          if (topCoach && select) topCoach.value = select.value;
        }
      } catch (e) {
        console.error('Failed to load data:', e);
        _loadCoaches?.();
      }

      _updateCoachGreeting?.(
        user as User,
        !isAdmin && (coaches as unknown[]).length > 0
          ? (coaches as Array<{ first_name?: string }>)[0]
          : null,
        isAdmin
      );

      if (isAdmin) {
        if (__adminFirstNameCache) {
          _updateCoachGreeting?.(user as User, { first_name: __adminFirstNameCache }, isAdmin);
        } else {
          _supabase!.from('admin_profiles').select('first_name').eq('owner_uid', user.id).maybeSingle()
            .then(({ data: ap }) => {
              if (ap?.first_name) {
                __adminFirstNameCache = ap.first_name;
                _updateCoachGreeting?.(user as User, { first_name: ap.first_name! }, isAdmin);
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

      if (!currentCoach) {
        import('./competitions-ui.js').then((m) => {
          const section = document.getElementById('competitionsSection');
          if (section) { section.style.display = 'block'; section.hidden = false; }
          (m as { showCompetitionsSection?: () => void }).showCompetitionsSection?.();
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
      __uiInitializedForUser = null;
      __adminFirstNameCache  = null;
      if (select) select.innerHTML = '<option value="">-- Sélectionner --</option>';
      if (statusSpanInner) statusSpanInner.textContent = 'Non connecté.';
      (document.getElementById('authContainer') as HTMLElement).style.display = 'flex';
      (document.getElementById('appContainer')  as HTMLElement).style.display = 'none';
      _updateCoachGreeting?.(null, null, true);
    }
  });
}
