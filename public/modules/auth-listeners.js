import { supabaseUrl, supabaseKey, kcUrl, kcRealm, kcClient } from "./env.js";
import {
  currentUser,
  currentSession,
  currentAccessToken,
  coaches,
  currentCoach,
  __eventListenersSetup,
  setCurrentUser,
  setCurrentSession,
  setCurrentAccessToken,
  setCoaches,
  setTimeData,
  setAuditLogs,
  setCurrentCoach,
  setEventListenersSetup
} from "./app-context.js";
import { __describeJwt, __hasAdminClaim } from "./shared-utils.js";
import { isAdminViaLocalClaims, isAdminViaRest } from "./auth-admin.js";
let _supabase = null;
let _isCurrentUserAdminDB = null;
let _loadAllDataFromSupabase = null;
let _loadCoaches = null;
let _updateCoachGreeting = null;
let _updateCalendar = null;
let _updateSummary = null;
let _setupEventListeners = null;
let _inviteFlowActive = false;
let _setInviteFlowActive = null;
let __adminCache = { userId: null, value: null, atMs: 0 };
let __adminInFlight = null;
let __adminFirstNameCache = null;
let __uiInitializedForUser = null;
const ADMIN_TTL_MS = 5 * 60 * 1e3;
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function handleSSOCallback() {
  const code = new URLSearchParams(window.location.search).get("code");
  if (!code) return;
  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) {
    console.error("SSO: no PKCE verifier found in sessionStorage");
    window.history.replaceState({}, "", window.location.pathname);
    return;
  }
  console.log("SSO callback detected, exchanging code for tokens...");
  try {
    const tokenEndpoint = `${kcUrl}/realms/${kcRealm}/protocol/openid-connect/token`;
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "jcc-frontend",
      code,
      redirect_uri: window.location.origin + window.location.pathname,
      code_verifier: verifier
    });
    const tokenResp = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    if (!tokenResp.ok) {
      const err = await tokenResp.json();
      throw new Error(err.error_description ?? err.error ?? `Token exchange failed: ${tokenResp.status}`);
    }
    const tokens = await tokenResp.json();
    if (!tokens.id_token) throw new Error("No id_token received from Keycloak");
    console.log("ID token received, signing into Supabase via signInWithIdToken...");
    const { data, error } = await _supabase.auth.signInWithIdToken({
      provider: "keycloak",
      token: tokens.id_token
    });
    if (error) throw new Error(`Supabase auth failed: ${error.message}`);
    console.log("SSO login successful!", data);
  } catch (e) {
    console.error("SSO callback error:", e);
    alert("Erreur SSO : " + e.message);
  } finally {
    window.history.replaceState({}, "", window.location.pathname);
    sessionStorage.removeItem("pkce_verifier");
  }
}
function initAuthListeners(opts) {
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
async function isCurrentUserAdminDB() {
  if (!currentUser) {
    console.log("DEBUG no currentUser");
    return false;
  }
  const localAdmin = isAdminViaLocalClaims({
    accessToken: currentAccessToken,
    currentUser,
    currentSession,
    hasAdminClaim: __hasAdminClaim
  });
  if (__adminCache.userId === currentUser.id && typeof __adminCache.value === "boolean" && Date.now() - __adminCache.atMs < ADMIN_TTL_MS) {
    return __adminCache.value;
  }
  if (__adminInFlight) {
    try {
      return await __adminInFlight;
    } catch {
    }
  }
  __adminInFlight = (async () => {
    let value = await isAdminViaRest({
      supabaseUrl,
      supabaseKey,
      accessToken: currentAccessToken,
      currentUser,
      fetchImpl: globalThis.fetch?.bind(globalThis)
    });
    if (!value && localAdmin) {
      console.warn("DEBUG is_admin REST returned false, using local admin claim fallback");
      value = true;
    }
    __adminCache = { userId: currentUser.id, value, atMs: Date.now() };
    return value;
  })();
  try {
    const value = await __adminInFlight;
    console.log("DEBUG is_admin (REST):", value);
    return value;
  } catch (e) {
    console.warn("DEBUG is_admin (REST) failed:", e);
    if (localAdmin) {
      __adminCache = { userId: currentUser.id, value: true, atMs: Date.now() };
      return true;
    }
    if (__adminCache.userId === currentUser.id && typeof __adminCache.value === "boolean") {
      return __adminCache.value;
    }
    return false;
  } finally {
    __adminInFlight = null;
  }
}
function invalidateAdminCache() {
  __adminCache = { userId: null, value: null, atMs: 0 };
  __adminInFlight = null;
}
function setupAuthListeners() {
  console.log("DEBUG setupAuthListeners called");
  if (new URLSearchParams(window.location.search).has("code")) {
    void handleSSOCallback();
  }
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const registerBtn = document.getElementById("registerBtn");
  const loginBtn = document.getElementById("loginBtn");
  const resetPasswordBtn = document.getElementById("resetPasswordBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const statusSpan = document.getElementById("authStatus");
  if (!loginBtn || !logoutBtn) {
    console.error("DEBUG loginBtn or logoutBtn not found in DOM");
  }
  registerBtn?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) {
      alert("Veuillez saisir votre adresse e-mail et votre mot de passe.");
      return;
    }
    try {
      const { error } = await _supabase.auth.signUp({ email, password: pass });
      if (error) throw error;
      if (statusSpan) statusSpan.textContent = "Compte cr\xE9\xE9 et connect\xE9.";
    } catch (e) {
      alert(e.message);
    }
  });
  loginBtn?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) {
      alert("Veuillez saisir votre adresse e-mail et votre mot de passe.");
      return;
    }
    try {
      const { error } = await _supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
    } catch (e) {
      alert(e.message);
    }
  });
  const ssoBtn = document.getElementById("ssoBtn");
  ssoBtn?.addEventListener("click", () => {
    ssoBtn.disabled = true;
    ssoBtn.textContent = "Redirection...";
    const codeVerifier = generateCodeVerifier();
    sessionStorage.setItem("pkce_verifier", codeVerifier);
    generateCodeChallenge(codeVerifier).then((challenge) => {
      const kcAuthUrl = `${kcUrl}/realms/${kcRealm}/protocol/openid-connect/auth`;
      const params = new URLSearchParams({
        client_id: kcClient,
        redirect_uri: window.location.origin + window.location.pathname,
        response_type: "code",
        scope: "openid email profile",
        code_challenge: challenge,
        code_challenge_method: "S256"
      });
      window.location.href = `${kcAuthUrl}?${params.toString()}`;
    }).catch((err) => {
      console.error("SSO PKCE error, fallback sans PKCE:", err);
      const kcAuthUrl = `${kcUrl}/realms/${kcRealm}/protocol/openid-connect/auth`;
      const params = new URLSearchParams({
        client_id: kcClient,
        redirect_uri: window.location.origin + window.location.pathname,
        response_type: "code",
        scope: "openid email profile"
      });
      window.location.href = `${kcAuthUrl}?${params.toString()}`;
    });
  });
  logoutBtn?.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    try {
      const { error } = await _supabase.auth.signOut({ scope: "global" });
      if (error) {
        alert("Logout failed: " + error.message);
        return;
      }
      setCurrentUser(null);
      document.getElementById("appContainer").style.display = "none";
      document.getElementById("authContainer").style.display = "flex";
    } catch (e) {
      alert("Logout exception: " + e.message);
    } finally {
      logoutBtn.disabled = false;
    }
  });
  resetPasswordBtn?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) {
      alert("Veuillez saisir votre adresse e-mail.");
      return;
    }
    try {
      const { error } = await _supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
      alert("E-mail de r\xE9initialisation envoy\xE9. V\xE9rifiez votre bo\xEEte de r\xE9ception.");
    } catch (e) {
      alert(e.message);
    }
  });
  _supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("DEBUG onAuthStateChange:", event, session);
    setCurrentSession(session ?? null);
    setCurrentAccessToken(session?.access_token ?? null);
    window.__lastSession = session;
    if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
      if (event !== "INITIAL_SESSION") return;
    }
    invalidateAdminCache();
    if (currentAccessToken) {
      console.log("DEBUG access token present:", String(currentAccessToken).slice(0, 12) + "...");
      console.log("DEBUG access token details:", __describeJwt(currentAccessToken));
    }
    if (event === "SIGNED_IN" && _inviteFlowActive && session?.user) {
      document.getElementById("invitePasswordModal")?.classList.add("active");
      const inviteSetPasswordBtn = document.getElementById("inviteSetPasswordBtn");
      if (!inviteSetPasswordBtn) {
        console.warn("WARN missing element: #inviteSetPasswordBtn");
        return;
      }
      inviteSetPasswordBtn.onclick = async () => {
        const newPass = document.getElementById("inviteNewPasswordInput").value;
        const confirmPass = document.getElementById("inviteConfirmPasswordInput").value;
        if (!newPass) {
          alert("Veuillez saisir un mot de passe.");
          return;
        }
        if (newPass.length < 8) {
          alert("Le mot de passe doit contenir au moins 8 caract\xE8res.");
          return;
        }
        if (newPass !== confirmPass) {
          alert("Les mots de passe ne correspondent pas.");
          return;
        }
        _setInviteFlowActive?.(false);
        _inviteFlowActive = false;
        document.getElementById("invitePasswordModal")?.classList.remove("active");
        const { error } = await _supabase.auth.updateUser({ password: newPass });
        if (error) {
          _inviteFlowActive = true;
          _setInviteFlowActive?.(true);
          document.getElementById("invitePasswordModal")?.classList.add("active");
          document.getElementById("inviteNewPasswordInput").value = "";
          document.getElementById("inviteConfirmPasswordInput").value = "";
          alert(error.message);
        } else {
          document.getElementById("inviteNewPasswordInput").value = "";
          document.getElementById("inviteConfirmPasswordInput").value = "";
        }
      };
      return;
    }
    if (event === "PASSWORD_RECOVERY") {
      document.getElementById("passwordResetModal")?.classList.add("active");
      const updatePasswordBtn = document.getElementById("updatePasswordBtn");
      if (!updatePasswordBtn) {
        console.warn("WARN missing element: #updatePasswordBtn");
        return;
      }
      updatePasswordBtn.onclick = async () => {
        const newPass = document.getElementById("newPasswordInput").value;
        const confirmPass = document.getElementById("confirmPasswordInput").value;
        if (!newPass) {
          alert("Veuillez saisir un nouveau mot de passe.");
          return;
        }
        if (newPass.length < 8) {
          alert("Le mot de passe doit contenir au moins 8 caract\xE8res.");
          return;
        }
        if (newPass !== confirmPass) {
          alert("Les mots de passe ne correspondent pas.");
          return;
        }
        const { error } = await _supabase.auth.updateUser({ password: newPass });
        if (error) {
          alert(error.message);
        } else {
          document.getElementById("newPasswordInput").value = "";
          document.getElementById("confirmPasswordInput").value = "";
          document.getElementById("passwordResetModal")?.classList.remove("active");
          alert("Mot de passe mis \xE0 jour avec succ\xE8s. Veuillez vous reconnecter.");
          await _supabase.auth.signOut();
        }
      };
      return;
    }
    const statusSpanInner = document.getElementById("authStatus");
    const select = document.getElementById("coachSelect");
    const user = session?.user ?? null;
    if (user) {
      setCurrentUser(user);
      if (statusSpanInner) statusSpanInner.textContent = `Connect\xE9 : ${user.email}`;
      document.getElementById("authContainer").style.display = "none";
      document.getElementById("appContainer").style.display = "block";
      if (__uiInitializedForUser === user.id) return;
      __uiInitializedForUser = user.id;
      const isAdmin = await isCurrentUserAdminDB();
      const adminEls = [
        "adminActionsPanel",
        "adminProfileBtn",
        "addCoachBtn",
        "editCoachBtn",
        "inviteAdminBtn",
        "freezeBtn",
        "auditLogsBtn",
        "helloAssoBtn",
        "competitionsBtn",
        "exportMonthlyExpensesBtn",
        "importBtn",
        "backupBtn",
        "adminTopBar"
      ];
      adminEls.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === "adminActionsPanel") {
          el.style.display = isAdmin ? "block" : "none";
        } else if (id === "adminTopBar") {
          el.style.display = isAdmin ? "flex" : "none";
        } else {
          const inSidebar = el.closest("#appSidebar");
          el.style.display = isAdmin ? inSidebar ? "block" : "inline-block" : "none";
        }
      });
      if (isAdmin) {
        const topMonth = document.getElementById("adminTopBarMonthSelect");
        const sidebarMonth = document.getElementById("monthSelect");
        if (topMonth && sidebarMonth) topMonth.value = sidebarMonth.value;
      }
      if (select) select.disabled = !isAdmin;
      _updateCoachGreeting?.(user, null, isAdmin);
      try {
        await _loadAllDataFromSupabase?.({ isAdminOverride: isAdmin });
        _loadCoaches?.();
        const coachesList = coaches;
        if (!isAdmin && coachesList.length > 0) {
          setCurrentCoach(coachesList[0]);
          if (select) select.value = String(coachesList[0].id);
        } else if (isAdmin && coachesList.length > 0) {
          const ownProfile = coachesList.find((c) => c.owner_uid === user.id);
          if (ownProfile) {
            setCurrentCoach(ownProfile);
            if (select) select.value = String(ownProfile.id);
          }
        }
        if (isAdmin) {
          const topCoach = document.getElementById("adminTopBarCoachSelect");
          if (topCoach && select) topCoach.value = select.value;
        }
      } catch (e) {
        console.error("Failed to load data:", e);
        _loadCoaches?.();
      }
      _updateCoachGreeting?.(
        user,
        !isAdmin && coaches.length > 0 ? coaches[0] : null,
        isAdmin
      );
      if (isAdmin) {
        if (__adminFirstNameCache) {
          _updateCoachGreeting?.(user, { first_name: __adminFirstNameCache }, isAdmin);
        } else {
          _supabase.from("admin_profiles").select("first_name").eq("owner_uid", user.id).maybeSingle().then(({ data: ap }) => {
            if (ap?.first_name) {
              __adminFirstNameCache = ap.first_name;
              _updateCoachGreeting?.(user, { first_name: ap.first_name }, isAdmin);
            }
          }).catch(() => {
          });
        }
      }
      if (!__eventListenersSetup) {
        _setupEventListeners?.();
        setEventListenersSetup(true);
      }
      try {
        _updateCalendar?.();
        _updateSummary?.();
      } catch (e) {
        console.error("Failed to update UI:", e);
      }
      if (!currentCoach) {
        import("./competitions-ui.js").then((m) => {
          const section = document.getElementById("competitionsSection");
          if (section) section.style.display = "block";
          m.showCompetitionsSection?.();
        }).catch(() => {
        });
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
      __adminFirstNameCache = null;
      if (select) select.innerHTML = '<option value="">-- S\xE9lectionner --</option>';
      if (statusSpanInner) statusSpanInner.textContent = "Non connect\xE9.";
      document.getElementById("authContainer").style.display = "flex";
      document.getElementById("appContainer").style.display = "none";
      _updateCoachGreeting?.(null, null, true);
    }
  });
}
export {
  initAuthListeners,
  invalidateAdminCache,
  isCurrentUserAdminDB,
  setupAuthListeners
};
