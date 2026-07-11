function isAdminViaLocalClaims({
  accessToken,
  currentUser,
  currentSession,
  hasAdminClaim
}) {
  const tokenAdmin = hasAdminClaim(accessToken);
  const currentUserAdmin = currentUser?.app_metadata && (currentUser.app_metadata.is_admin === true || currentUser.app_metadata.is_admin === "true");
  const sessionUserAdmin = currentSession?.user?.app_metadata && (currentSession.user.app_metadata["is_admin"] === true || currentSession.user.app_metadata["is_admin"] === "true");
  return !!(tokenAdmin || currentUserAdmin || sessionUserAdmin);
}
async function isAdminViaRest({
  supabaseUrl,
  supabaseKey,
  accessToken,
  currentUser,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = 1e4
}) {
  if (!currentUser || !accessToken) return false;
  const fetchFn = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) throw new Error("fetch is not available in this browser environment");
  const url = `${supabaseUrl}/rest/v1/rpc/is_admin`;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => {
    try {
      controller.abort();
    } catch {
    }
  }, timeoutMs) : null;
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: "{}",
      signal: controller?.signal ?? void 0
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const j = json;
      const msg = j?.message ?? j?.error_description ?? j?.error ?? text ?? `${res.status} ${res.statusText}`;
      throw new Error(`is_admin REST failed: ${String(msg)}`);
    }
    return !!json;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
export {
  isAdminViaLocalClaims,
  isAdminViaRest
};
