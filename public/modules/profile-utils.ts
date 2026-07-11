// profile-utils.ts — Coach profile helpers
import type { Coach, User } from '@types/index';

export type ProfileType = 'coach' | 'benevole' | 'admin';

export interface ProfileLabelOptions {
  capitalized?: boolean;
  plural?: boolean;
}

export interface GetCurrentUserDisplayNameOptions {
  preferredCoach?: Partial<Coach> | null;
  coaches?: Coach[];
  normalizeEmail: (email: unknown) => string | null;
  getCoachDisplayNameFn?: (coach: Partial<Coach> | null | undefined) => string;
}

export interface FindExistingProfileOptions {
  excludeId?: number | null;
  coaches?: Coach[];
  normalizeEmail: (email: unknown) => string | null;
}

export function getCoachDisplayName(coach: Partial<Coach> | null | undefined): string {
  if (!coach) return '';
  const firstName = String(coach.first_name ?? '').trim();
  // Note: some records use `name` instead of `last_name` — kept for compat
  const lastName = String((coach as Record<string, unknown>).name ?? coach.last_name ?? '').trim();
  return [lastName, firstName].filter(Boolean).join(' ').trim();
}

export function getCoachCivilite(coach: Partial<Coach> | null | undefined): string {
  return ((coach as Record<string, unknown>)?.civilite as string || 'MR').toUpperCase();
}

export function getCurrentUserDisplayName(
  user: User | null | undefined,
  options: GetCurrentUserDisplayNameOptions
): string {
  const {
    preferredCoach = null,
    coaches = [],
    normalizeEmail,
    getCoachDisplayNameFn = getCoachDisplayName,
  } = options;

  if (!user) return '';

  const preferredName = getCoachDisplayNameFn(preferredCoach);
  if (preferredName) return preferredName;

  const ownedCoach = coaches.find(
    (c) =>
      c?.owner_uid === user.id ||
      (normalizeEmail(c?.email) && normalizeEmail(c?.email) === normalizeEmail(user.email))
  );
  const ownedCoachName = getCoachDisplayNameFn(ownedCoach);
  if (ownedCoachName) return ownedCoachName;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metaFirst = String(meta.first_name ?? meta.firstname ?? '').trim();
  const metaLast = String(meta.last_name ?? meta.lastname ?? meta.name ?? '').trim();
  const metaName = [metaFirst, metaLast].filter(Boolean).join(' ').trim();
  if (metaName) return metaName;

  return String(user.email ?? '').trim();
}

export function getProfileType(profileOrType: unknown): ProfileType {
  const raw =
    typeof profileOrType === 'string'
      ? profileOrType
      : ((profileOrType as Record<string, unknown>)?.profile_type ??
         (profileOrType as Record<string, unknown>)?.role);
  const normalized = String(raw ?? 'coach').trim().toLowerCase();
  if (normalized === 'benevole') return 'benevole';
  if (normalized === 'admin') return 'admin';
  return 'coach';
}

export function isVolunteerProfile(profileOrType: unknown): boolean {
  return getProfileType(profileOrType) === 'benevole';
}

export function isAdminProfile(profileOrType: unknown): boolean {
  return getProfileType(profileOrType) === 'admin';
}

export function getProfileLabel(
  profileOrType: unknown,
  { capitalized = false, plural = false }: ProfileLabelOptions = {}
): string {
  const type = getProfileType(profileOrType);
  let label: string;
  if (type === 'benevole') {
    label = plural ? 'bénévoles' : 'bénévole';
  } else if (type === 'admin') {
    label = plural ? 'administrateurs' : 'administrateur';
  } else {
    label = plural ? 'entraîneurs' : 'entraîneu';
  }
  return capitalized ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}

export function findExistingProfileByEmail(
  email: unknown,
  { excludeId = null, coaches = [], normalizeEmail }: FindExistingProfileOptions
): Coach | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  return (
    coaches.find((c) => {
      if (!c) return false;
      if (excludeId != null && c.id === excludeId) return false;
      return normalizeEmail(c.email) === normalizedEmail;
    }) ?? null
  );
}
