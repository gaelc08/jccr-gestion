function createRestGateway(options) {
  const {
    supabaseUrl,
    supabaseKey,
    getAccessToken,
    getCurrentUser,
    normalizeEmail,
    toAuditJson,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    logger = console
  } = options;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("createRestGateway requires supabaseUrl and supabaseKey");
  }
  if (!fetchImpl) {
    throw new Error("fetch is not available in this browser environment");
  }
  async function coachWriteViaRest(coachData, { editingId = null } = {}) {
    const accessToken = getAccessToken();
    if (!accessToken) {
      return { data: null, error: { message: "No access token available (not logged in yet?)" }, status: 0, statusText: "NO_TOKEN" };
    }
    const isUpdate = editingId != null;
    const baseUrl = `${supabaseUrl}/rest/v1/users`;
    const url = isUpdate ? `${baseUrl}?id=eq.${encodeURIComponent(editingId)}` : baseUrl;
    try {
      const res = await fetchImpl(url, {
        method: isUpdate ? "PATCH" : "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(coachData)
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
        const message = j?.message ?? j?.error_description ?? j?.error ?? text ?? `${res.status} ${res.statusText}`;
        return { data: null, error: { message: String(message) }, status: res.status, statusText: res.statusText };
      }
      return {
        data: Array.isArray(json) ? json : json ? [json] : [],
        error: null,
        status: res.status,
        statusText: res.statusText
      };
    } catch (e) {
      return { data: null, error: { message: e?.message ?? String(e) }, status: 0, statusText: "FETCH_ERROR" };
    }
  }
  async function restSelect(table, { select = "*", filters = [], order = null, limit = null } = {}) {
    const accessToken = getAccessToken();
    if (!accessToken) {
      return { data: null, error: { message: "No access token available" }, status: 0, statusText: "NO_TOKEN" };
    }
    const urlObj = new URL(`${supabaseUrl}/rest/v1/${table}`);
    urlObj.searchParams.set("select", select);
    for (const [col, op, value] of filters) {
      urlObj.searchParams.set(col, `${op}.${value}`);
    }
    if (order?.column) {
      const dir = String(order.direction ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
      urlObj.searchParams.set("order", `${order.column}.${dir}`);
    }
    if (Number.isFinite(limit) && Number(limit) > 0) {
      urlObj.searchParams.set("limit", String(limit));
    }
    try {
      const res = await fetchImpl(urlObj.toString(), {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` }
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
        const message = j?.message ?? j?.error_description ?? j?.error ?? text ?? `${res.status} ${res.statusText}`;
        return { data: null, error: { message: String(message) }, status: res.status, statusText: res.statusText };
      }
      return {
        data: Array.isArray(json) ? json : json ? [json] : [],
        error: null,
        status: res.status,
        statusText: res.statusText
      };
    } catch (e) {
      return { data: null, error: { message: e?.message ?? String(e) }, status: 0, statusText: "FETCH_ERROR" };
    }
  }
  async function logAuditEvent(action, entityType, { entityId = null, targetUserId = null, targetEmail = null, metadata = {} } = {}) {
    const currentUser = getCurrentUser();
    const accessToken = getAccessToken();
    if (!currentUser || !accessToken) return null;
    try {
      const resp = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/log_audit_event`, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          p_action: String(action ?? "").trim(),
          p_entity_type: String(entityType ?? "").trim(),
          p_entity_id: entityId == null ? null : String(entityId),
          p_target_user_id: targetUserId ?? null,
          p_target_email: normalizeEmail(targetEmail) ?? (targetEmail ? String(targetEmail) : null),
          p_metadata: toAuditJson(metadata ?? {})
        })
      });
      if (!resp.ok) throw new Error(`Failed to log audit event: ${resp.status}`);
    } catch (e) {
      logger?.warn?.("DEBUG audit log failed:", action, e);
    }
    return null;
  }
  return { coachWriteViaRest, restSelect, logAuditEvent };
}
export {
  createRestGateway
};
