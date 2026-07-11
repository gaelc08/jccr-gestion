import { isAdminViaLocalClaims, isAdminViaRest } from "./auth-admin.js";
import { __hasAdminClaim } from "./shared-utils.js";
import { supabaseUrl, supabaseKey } from "./env.js";
const ADMIN_TTL_MS = 5 * 60 * 1e3;
let _getCurrentUser = () => null;
let _getCurrentSession = () => null;
let _getCurrentAccessToken = () => null;
let _supabase = null;
function initAdminService({
  getCurrentUser,
  getCurrentSession,
  getCurrentAccessToken,
  supabase
}) {
  _getCurrentUser = getCurrentUser;
  _getCurrentSession = getCurrentSession;
  _getCurrentAccessToken = getCurrentAccessToken;
  _supabase = supabase;
}
let __adminCache = { userId: null, value: null, atMs: 0 };
let __adminInFlight = null;
function resetAdminCache(userId = null) {
  __adminCache = { userId, value: null, atMs: 0 };
  __adminInFlight = null;
}
function __isAdminForUi() {
  const currentUser = _getCurrentUser();
  if (!currentUser) return false;
  const currentAccessToken = _getCurrentAccessToken();
  const currentSession = _getCurrentSession();
  if (__adminCache.userId === currentUser.id && typeof __adminCache.value === "boolean" && Date.now() - __adminCache.atMs < ADMIN_TTL_MS) {
    return __adminCache.value;
  }
  return isAdminViaLocalClaims({
    accessToken: currentAccessToken,
    currentUser,
    currentSession,
    hasAdminClaim: __hasAdminClaim
  });
}
async function isCurrentUserAdminDB() {
  const currentUser = _getCurrentUser();
  const currentAccessToken = _getCurrentAccessToken();
  const currentSession = _getCurrentSession();
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
      console.warn("DEBUG is_admin using local admin claim fallback:", localAdmin);
      __adminCache = { userId: currentUser.id, value: true, atMs: Date.now() };
      return true;
    }
    if (__adminCache.userId === currentUser.id && typeof __adminCache.value === "boolean") {
      console.warn("DEBUG is_admin using cached value:", __adminCache.value);
      return __adminCache.value;
    }
    return false;
  } finally {
    __adminInFlight = null;
  }
}
async function notifyAdminAlert(coachName, date, data) {
  if (__isAdminForUi()) return;
  if (!_supabase) {
    console.warn("notifyAdminAlert: admin-service not initialised with supabase");
    return;
  }
  try {
    await _supabase.functions.invoke("alert-admin", { body: { coachName, date, data } });
  } catch (err) {
    console.error("notifyAdminAlert: failed to notify admin", err);
  }
}
export {
  __adminCache,
  __adminInFlight,
  __isAdminForUi,
  initAdminService,
  isCurrentUserAdminDB,
  notifyAdminAlert,
  resetAdminCache
};
