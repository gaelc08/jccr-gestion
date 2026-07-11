function getCoachDisplayName(coach) {
  if (!coach) return "";
  const firstName = String(coach.first_name ?? "").trim();
  const lastName = String(coach.name ?? coach.last_name ?? "").trim();
  return [lastName, firstName].filter(Boolean).join(" ").trim();
}
function getCoachCivilite(coach) {
  return (coach?.civilite || "MR").toUpperCase();
}
function getCurrentUserDisplayName(user, options) {
  const {
    preferredCoach = null,
    coaches = [],
    normalizeEmail,
    getCoachDisplayNameFn = getCoachDisplayName
  } = options;
  if (!user) return "";
  const preferredName = getCoachDisplayNameFn(preferredCoach);
  if (preferredName) return preferredName;
  const ownedCoach = coaches.find(
    (c) => c?.owner_uid === user.id || normalizeEmail(c?.email) && normalizeEmail(c?.email) === normalizeEmail(user.email)
  );
  const ownedCoachName = getCoachDisplayNameFn(ownedCoach);
  if (ownedCoachName) return ownedCoachName;
  const meta = user.user_metadata ?? {};
  const metaFirst = String(meta.first_name ?? meta.firstname ?? "").trim();
  const metaLast = String(meta.last_name ?? meta.lastname ?? meta.name ?? "").trim();
  const metaName = [metaFirst, metaLast].filter(Boolean).join(" ").trim();
  if (metaName) return metaName;
  return String(user.email ?? "").trim();
}
function getProfileType(profileOrType) {
  const raw = typeof profileOrType === "string" ? profileOrType : profileOrType?.profile_type ?? profileOrType?.role;
  const normalized = String(raw ?? "coach").trim().toLowerCase();
  if (normalized === "benevole") return "benevole";
  if (normalized === "admin") return "admin";
  return "coach";
}
function isVolunteerProfile(profileOrType) {
  return getProfileType(profileOrType) === "benevole";
}
function isAdminProfile(profileOrType) {
  return getProfileType(profileOrType) === "admin";
}
function getProfileLabel(profileOrType, { capitalized = false, plural = false } = {}) {
  const type = getProfileType(profileOrType);
  let label;
  if (type === "benevole") {
    label = plural ? "b\xE9n\xE9voles" : "b\xE9n\xE9vole";
  } else if (type === "admin") {
    label = plural ? "administrateurs" : "administrateur";
  } else {
    label = plural ? "entra\xEEneurs" : "entra\xEEneu";
  }
  return capitalized ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}
function findExistingProfileByEmail(email, { excludeId = null, coaches = [], normalizeEmail }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  return coaches.find((c) => {
    if (!c) return false;
    if (excludeId != null && c.id === excludeId) return false;
    return normalizeEmail(c.email) === normalizedEmail;
  }) ?? null;
}
export {
  findExistingProfileByEmail,
  getCoachCivilite,
  getCoachDisplayName,
  getCurrentUserDisplayName,
  getProfileLabel,
  getProfileType,
  isAdminProfile,
  isVolunteerProfile
};
