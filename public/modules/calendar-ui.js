import {
  coaches,
  timeData,
  currentCoach,
  currentMonth,
  currentUser,
  selectedDay,
  setTimeData,
  setSelectedDay,
  __getCoachDisplayName,
  __getProfileLabel,
  __isVolunteerProfile,
  __buildAuditPayload
} from "./app-context.js";
import { isCurrentUserAdminDB } from "./admin-service.js";
import { createHolidayService } from "./holidays-service.js";
import { publicHolidaysFallback, schoolHolidaysFallback } from "./holidays-data.js";
import { updateSummary, updateFreezeUI, isCurrentMonthFrozen } from "./summary-ui.js";
const __holidayService = createHolidayService({
  publicFallback: publicHolidaysFallback,
  schoolFallback: schoolHolidaysFallback,
  fetchImpl: globalThis.fetch?.bind(globalThis),
  logger: console
});
const fetchPublicHolidays = __holidayService.fetchPublicHolidays;
const fetchSchoolHolidays = __holidayService.fetchSchoolHolidays;
let _supabase = null;
let _logAuditEvent = null;
let _notifyAdminAlert = null;
function initCalendarUi({ supabase, logAuditEvent, notifyAdminAlert }) {
  _supabase = supabase;
  _logAuditEvent = logAuditEvent;
  _notifyAdminAlert = notifyAdminAlert;
}
function loadCoaches() {
  const select = document.getElementById("coachSelect");
  if (!select) return;
  const prevValue = select.value;
  select.innerHTML = '<option value="">\u2014 S\xE9lectionnez un profil \u2014</option>';
  coaches.forEach((coach) => {
    const opt = document.createElement("option");
    opt.value = String(coach.id);
    const label = __getProfileLabel(coach);
    opt.textContent = `${__getCoachDisplayName(coach)}${label ? ` (${label})` : ""}`;
    select.appendChild(opt);
  });
  if (prevValue && coaches.find((c) => String(c.id) === prevValue)) {
    select.value = prevValue;
  }
}
function clearCoachForm() {
  [
    "coachName",
    "coachFirstName",
    "coachEmail",
    "coachAddress",
    "coachVehicle",
    "coachFiscalPower",
    "coachRate",
    "dailyAllowance",
    "coachOwnerUid"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const profileType = document.getElementById("coachProfileType");
  if (profileType) profileType.value = "coach";
}
function updateCoachGreeting(user, coach, _isAdmin) {
  const el = document.getElementById("coachGreeting");
  if (!el) return;
  if (!user) {
    el.textContent = "";
    el.style.display = "none";
    return;
  }
  const firstName = coach?.first_name?.trim() || user.user_metadata?.first_name?.trim() || user.user_metadata?.firstname?.trim() || null;
  const displayName = firstName || (coach ? __getCoachDisplayName(coach) : user.email || user.id);
  el.textContent = `Bonjour ${displayName},`;
  el.style.display = "";
}
async function __uploadExpenseJustification(file, prefix) {
  if (!currentUser) return "";
  const safeDate = selectedDay || "nodate";
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${currentUser.id}/${safeDate}_${prefix}_${safeName}`;
  const { error } = await _supabase.storage.from("justifications").upload(path, file, { upsert: true });
  if (error) {
    console.error("Upload justification error:", error.message);
    return "";
  }
  const { data } = _supabase.storage.from("justifications").getPublicUrl(path);
  return data?.publicUrl ?? "";
}
async function updateCalendar() {
  const calendar = document.getElementById("calendar");
  if (!calendar) return;
  calendar.innerHTML = "";
  if (!currentCoach || !currentMonth) {
    const legendCard2 = document.querySelector(".legend.card");
    const summaryCard2 = document.querySelector(".summary.card");
    if (legendCard2) legendCard2.style.display = "none";
    if (summaryCard2) summaryCard2.style.display = "none";
    updateFreezeUI();
    return;
  }
  const legendCard = document.querySelector(".legend.card");
  const summaryCard = document.querySelector(".summary.card");
  if (legendCard) legendCard.style.display = "";
  if (summaryCard) summaryCard.style.display = "";
  const [year, month] = currentMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const startOffset = (firstDay + 6) % 7;
  ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].forEach((d) => {
    const header = document.createElement("div");
    header.className = "calendar-header-cell";
    header.textContent = d;
    calendar.appendChild(header);
  });
  let publicHolidays = {};
  let schoolHolidays = [];
  try {
    [publicHolidays, schoolHolidays] = await Promise.all([
      fetchPublicHolidays(year),
      fetchSchoolHolidays(year)
    ]);
  } catch (e) {
    console.warn("calendar-ui: holidays fetch error", e);
  }
  const publicHolidayDates = new Set(Object.keys(publicHolidays));
  const schoolHolidayDates = new Set(
    schoolHolidays.flatMap((h) => {
      if (!h.start || !h.end) return [];
      const dates = [];
      const cur = new Date(h.start);
      const end = new Date(h.end);
      while (cur <= end) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    })
  );
  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    calendar.appendChild(empty);
  }
  const frozen = isCurrentMonthFrozen();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    calendar.appendChild(createDayElement(d, dateStr, { publicHolidayDates, schoolHolidayDates, frozen }));
  }
  updateFreezeUI();
}
function createDayElement(day, dateStr, { publicHolidayDates, schoolHolidayDates, frozen }) {
  const dayDiv = document.createElement("div");
  const dow = new Date(dateStr).getDay();
  const isWeekend = dow === 0 || dow === 6;
  const isPublicHoliday = publicHolidayDates.has(dateStr);
  const isSchoolHoliday = schoolHolidayDates.has(dateStr);
  const coach = currentCoach;
  const key = `${coach.id}-${dateStr}`;
  const data = timeData[key];
  const classes = ["calendar-day"];
  if (isWeekend) classes.push("weekend");
  if (isPublicHoliday) classes.push("public-holiday");
  if (isSchoolHoliday) classes.push("school-holiday");
  if (data) {
    if (data.competition) classes.push("has-competition");
    else if ((data.hours ?? 0) > 0 || (data.km ?? 0) > 0) classes.push("has-data");
    if ((data.peage ?? 0) > 0 || (data.hotel ?? 0) > 0 || (data.achat ?? 0) > 0) classes.push("has-purchase");
  }
  if (frozen) classes.push("frozen");
  dayDiv.className = classes.join(" ");
  const dayNumber = document.createElement("span");
  dayNumber.className = "day-number";
  dayNumber.textContent = String(day);
  dayDiv.appendChild(dayNumber);
  if (data) {
    const indicator = document.createElement("span");
    indicator.className = "day-indicator";
    if (data.competition) indicator.textContent = "\u{1F3C6}";
    else if ((data.hours ?? 0) > 0) indicator.textContent = `${data.hours}h`;
    else if ((data.km ?? 0) > 0) indicator.textContent = `${data.km}km`;
    dayDiv.appendChild(indicator);
  }
  dayDiv.addEventListener("click", () => handleDayClick(dateStr));
  dayDiv.dataset.date = dateStr;
  return dayDiv;
}
async function handleDayClick(dateStr) {
  if (!currentCoach) {
    alert("Veuillez s\xE9lectionner un profil.");
    return;
  }
  const isAdmin = await isCurrentUserAdminDB();
  const frozen = isCurrentMonthFrozen();
  if (!isAdmin && frozen) {
    alert("Cette fiche est gel\xE9e. Seul l'administrateur peut la modifier.");
    return;
  }
  openDayModal(dateStr);
}
function openDayModal(dateStr) {
  setSelectedDay(dateStr);
  const coach = currentCoach;
  const key = `${coach.id}-${dateStr}`;
  const data = timeData[key] ?? {};
  const title = document.getElementById("dayTitle");
  if (title) title.textContent = `Modifier le ${dateStr}`;
  const isVolunteerOrAdmin = __isVolunteerProfile(coach) || coach.profile_type === "admin" || coach.role === "admin";
  const hoursGroup = document.getElementById("trainingHoursGroup");
  if (hoursGroup) hoursGroup.style.display = isVolunteerOrAdmin ? "none" : "";
  _setField("trainingHours", data.hours ?? "");
  _setField("kilometers", data.km ?? "");
  _setField("peage", data.peage ?? "");
  _setField("hotel", data.hotel ?? "");
  _setField("achat", data.achat ?? "");
  _setField("competitionDescription", data.description ?? "");
  _setField("departurePlace", data.departurePlace ?? "");
  _setField("arrivalPlace", data.arrivalPlace ?? "");
  const compCb = document.getElementById("competitionDay");
  if (compCb) compCb.checked = !!data.competition;
  const travelGroup = document.getElementById("travelGroup");
  if (travelGroup) travelGroup.style.display = data.competition ? "" : "none";
  _showJustificationLink("peageJustificationLink", "existingPeageJustification", data.justificationUrl ?? "");
  _showJustificationLink("hotelJustificationLink", "existingHotelJustification", data.hotelJustificationUrl ?? "");
  _showJustificationLink("achatJustificationLink", "existingAchatJustification", data.achatJustificationUrl ?? "");
  ["peageJustification", "hotelJustification", "achatJustification"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const deleteBtn = document.getElementById("deleteDay");
  if (deleteBtn) deleteBtn.style.display = Object.keys(data).length ? "" : "none";
  document.getElementById("dayModal")?.classList.add("active");
}
function _setField(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = String(value ?? "");
}
function _showJustificationLink(linkId, wrapperId, url) {
  const link = document.getElementById(linkId);
  const wrapper = document.getElementById(wrapperId);
  if (link) link.href = url || "#";
  if (wrapper) wrapper.style.display = url ? "" : "none";
}
async function saveDay() {
  if (!currentCoach || !selectedDay) {
    alert("Aucun profil ou jour s\xE9lectionn\xE9.");
    return;
  }
  const g = (id) => parseFloat(document.getElementById(id)?.value ?? "") || 0;
  const hours = g("trainingHours");
  const km = g("kilometers");
  const peage = g("peage");
  const hotel = g("hotel");
  const achat = g("achat");
  const description = document.getElementById("competitionDescription")?.value?.trim() || null;
  const departurePlace = document.getElementById("departurePlace")?.value?.trim() || null;
  const arrivalPlace = document.getElementById("arrivalPlace")?.value?.trim() || null;
  const competition = document.getElementById("competitionDay")?.checked ?? false;
  const peageFile = document.getElementById("peageJustification")?.files?.[0];
  const hotelFile = document.getElementById("hotelJustification")?.files?.[0];
  const achatFile = document.getElementById("achatJustification")?.files?.[0];
  const coach = currentCoach;
  const key = `${coach.id}-${selectedDay}`;
  const existing = timeData[key] ?? {};
  if (peage > 0 && !peageFile && !existing.justificationUrl) {
    alert("Veuillez joindre un justificatif de p\xE9age.");
    return;
  }
  if (hotel > 0 && !hotelFile && !existing.hotelJustificationUrl) {
    alert("Veuillez joindre un justificatif d'h\xE9bergement.");
    return;
  }
  if (achat > 0 && !achatFile && !existing.achatJustificationUrl) {
    alert("Veuillez joindre un justificatif d'achat.");
    return;
  }
  let peageUrl = existing.justificationUrl ?? null;
  let hotelUrl = existing.hotelJustificationUrl ?? null;
  let achatUrl = existing.achatJustificationUrl ?? null;
  if (peageFile) peageUrl = await __uploadExpenseJustification(peageFile, "peage");
  if (hotelFile) hotelUrl = await __uploadExpenseJustification(hotelFile, "hotel");
  if (achatFile) achatUrl = await __uploadExpenseJustification(achatFile, "achat");
  const payload = {
    coach_id: coach.id,
    date: selectedDay,
    hours,
    km,
    peage,
    hotel,
    achat,
    description,
    departure_place: departurePlace,
    arrival_place: arrivalPlace,
    competition,
    justification_url: peageUrl,
    hotel_justification_url: hotelUrl,
    achat_justification_url: achatUrl,
    owner_uid: currentUser?.id ?? null,
    owner_email: currentUser?.email ?? null
  };
  const { data: saved, error } = await _supabase.from("time_data").upsert([payload], { onConflict: "coach_id,date" }).select();
  if (error) {
    alert("Erreur lors de la sauvegarde : " + error.message);
    return;
  }
  const newTimeData = { ...timeData };
  newTimeData[key] = saved?.[0] ?? payload;
  setTimeData(newTimeData);
  await _logAuditEvent(
    "timesheet.update",
    "time_data",
    __buildAuditPayload({ entityId: key, metadata: { date: selectedDay, hours, km } })
  );
  if (_notifyAdminAlert) {
    const coachName = __getCoachDisplayName(coach) || coach.name || "Inconnu";
    _notifyAdminAlert(coachName, selectedDay, { hours, km, peage, hotel, achat, competition }).catch(() => {
    });
  }
  document.getElementById("dayModal")?.classList.remove("active");
  await updateCalendar();
  updateSummary();
}
async function deleteDay() {
  if (!currentCoach || !selectedDay) return;
  const coach = currentCoach;
  const key = `${coach.id}-${selectedDay}`;
  const existing = timeData[key];
  if (!existing) {
    document.getElementById("dayModal")?.classList.remove("active");
    return;
  }
  if (!confirm(`Supprimer les donn\xE9es du ${selectedDay} ?`)) return;
  const { error } = await _supabase.from("time_data").delete().eq("coach_id", coach.id).eq("date", selectedDay);
  if (error) {
    alert("Erreur lors de la suppression : " + error.message);
    return;
  }
  await _logAuditEvent(
    "timesheet.delete",
    "time_data",
    __buildAuditPayload({ entityId: key, metadata: { date: selectedDay } })
  );
  const newTimeData = { ...timeData };
  delete newTimeData[key];
  setTimeData(newTimeData);
  document.getElementById("dayModal")?.classList.remove("active");
  await updateCalendar();
  updateSummary();
}
window.updateCalendar = updateCalendar;
window.openDayModal = openDayModal;
window.saveDay = saveDay;
window.deleteDay = deleteDay;
window.loadCoaches = loadCoaches;
export {
  clearCoachForm,
  deleteDay,
  initCalendarUi,
  loadCoaches,
  openDayModal,
  saveDay,
  updateCalendar,
  updateCoachGreeting
};
