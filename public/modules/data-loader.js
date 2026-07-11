import { supabaseUrl, supabaseKey } from "./env.js";
import {
  coaches,
  currentUser,
  currentAccessToken,
  setCoaches,
  setTimeData,
  setFrozenMonths
} from "./app-context.js";
import { isCurrentUserAdminDB } from "./admin-service.js";
import { getProfileLabel, getCoachDisplayName } from "./profile-utils.js";
let _restSelect = null;
function initDataLoader({ restSelect }) {
  _restSelect = restSelect;
}
function loadCoaches() {
  const select = document.getElementById("coachSelect");
  const topSelect = document.getElementById("adminTopBarCoachSelect");
  const selects = [select, topSelect].filter((s) => s !== null);
  if (selects.length === 0) return;
  const current = select?.value ?? topSelect?.value ?? "";
  selects.forEach((s) => {
    s.innerHTML = '<option value="">-- S\xE9lectionner --</option>';
    coaches.forEach((coach) => {
      const opt = document.createElement("option");
      opt.value = String(coach.id);
      const label = getProfileLabel(coach, { capitalized: true });
      const displayName = getCoachDisplayName(coach) || coach.name || coach.email || String(coach.id);
      opt.textContent = `${displayName} (${label})`;
      s.appendChild(opt);
    });
    if (current && coaches.find((c) => String(c.id) === current)) {
      s.value = current;
    }
  });
}
async function loadAllDataFromSupabase({ isAdminOverride } = {}) {
  if (!_restSelect) throw new Error("initDataLoader() not called");
  const isAdmin = typeof isAdminOverride === "boolean" ? isAdminOverride : await isCurrentUserAdminDB();
  console.log("DEBUG loadAllDataFromSupabase start, isAdmin=", isAdmin);
  if (!currentUser) return;
  if (!currentAccessToken) throw new Error("No access token; cannot load data");
  let newCoaches = [];
  if (isAdmin) {
    const res = await _restSelect("profiles");
    if (res.error) throw new Error(res.error.message);
    newCoaches = (res.data ?? []).map((d) => ({ id: d.id, ...d }));
  } else {
    let res = await _restSelect("profiles", {
      filters: [["owner_uid", "eq", currentUser.id]]
    });
    if (res.error) throw new Error(res.error.message);
    let rows = res.data ?? [];
    if (rows.length === 0 && currentUser.email) {
      const claimRes = await globalThis.fetch(`${supabaseUrl}/rest/v1/rpc/claim_user_profile`, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${currentAccessToken}`,
          "Content-Type": "application/json"
        },
        body: "{}"
      });
      if (claimRes.ok) {
        res = await _restSelect("profiles", {
          filters: [["owner_uid", "eq", currentUser.id]]
        });
        if (res.error) throw new Error(res.error.message);
        rows = res.data ?? [];
      } else {
        const text = await claimRes.text().catch(() => "");
        console.warn("DEBUG claim_user_profile failed:", claimRes.status, text);
      }
    }
    newCoaches = rows.map((d) => ({ id: d.id, ...d }));
  }
  setCoaches(newCoaches);
  loadCoaches();
  let timeSnap = [];
  if (isAdmin) {
    const res = await _restSelect("time_data");
    if (res.error) throw new Error(res.error.message);
    timeSnap = res.data ?? [];
  } else if (coaches.length > 0) {
    const coachId = coaches[0].id;
    const res = await _restSelect("time_data", {
      filters: [["coach_id", "eq", coachId]]
    });
    if (res.error) throw new Error(res.error.message);
    timeSnap = res.data ?? [];
  }
  const newTimeData = {};
  for (const data of timeSnap) {
    const key = `${data.coach_id}-${data.date}`;
    newTimeData[key] = {
      hours: Number(data.hours) || 0,
      competition: Boolean(data.competition),
      km: Number(data.km) || 0,
      description: String(data.description ?? ""),
      departurePlace: String(data.departure_place ?? ""),
      arrivalPlace: String(data.arrival_place ?? ""),
      peage: Number(data.peage) || 0,
      justificationUrl: String(data.justification_url ?? ""),
      hotel: Number(data.hotel) || 0,
      hotelJustificationUrl: String(data.hotel_justification_url ?? ""),
      achat: Number(data.achat) || 0,
      achatJustificationUrl: String(data.achat_justification_url ?? ""),
      coachId: data.coach_id != null ? Number(data.coach_id) : null,
      ownerUid: data.owner_uid != null ? String(data.owner_uid) : null,
      ownerEmail: data.owner_email != null ? String(data.owner_email) : null,
      id: Number(data.id)
    };
  }
  setTimeData(newTimeData);
  const frozenRes = await _restSelect("frozen_timesheets");
  if (!frozenRes.error) {
    const newFrozen = /* @__PURE__ */ new Set();
    for (const r of frozenRes.data ?? []) {
      newFrozen.add(`${r.coach_id}-${r.month}`);
    }
    setFrozenMonths(newFrozen);
  }
}
export {
  initDataLoader,
  loadAllDataFromSupabase,
  loadCoaches
};
