// members-core.ts — État global, types, constantes et helpers partagés

import type { ServiceDeps, HaMember, FfjCategory, MemberSource } from './members-types.ts';
export type { ServiceDeps, HaMember, FfjCategory, MemberSource };

// ─── FFJ Categories ──────────────────────────────────────────────────────────

export const FFJ_CATEGORIES: FfjCategory[] = [
  { label: 'Baby Judo',    minYear: 2020, maxYear: 2099 },
  { label: 'Mini-Poussin', minYear: 2018, maxYear: 2019 },
  { label: 'Poussin',      minYear: 2016, maxYear: 2017 },
  { label: 'Benjamin',     minYear: 2014, maxYear: 2015 },
  { label: 'Minime',       minYear: 2012, maxYear: 2013 },
  { label: 'Cadet',        minYear: 2009, maxYear: 2011 },
  { label: 'Junior',       minYear: 2006, maxYear: 2008 },
  { label: 'Senior',       minYear: 1996, maxYear: 2005 },
  { label: 'Veteran',      minYear: 0,    maxYear: 1995 },
];

export function getFfjCategory(dateOfBirth?: string): { label: string; year: number } | null {
  if (!dateOfBirth) return null;
  const yearMatch = String(dateOfBirth).match(/(?:^|\D)(\d{4})(?:\D|$)/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);
  if (isNaN(year)) return null;
  for (const cat of FFJ_CATEGORIES) {
    if (year >= cat.minYear && year <= cat.maxYear) return { label: cat.label, year };
  }
  return null;
}

// ─── Sources consolidées (HelloAsso ↔ FFJDA) ─────────────────────────────────

export const SOURCE_LABELS: Record<MemberSource, string> = {
  ha:    'HelloAsso',
  ffjda: 'FFJDA',
  both:  'HA + FFJDA',
};

const SOURCE_STYLES: Record<MemberSource, string> = {
  both:  'background:rgba(76,175,80,0.2);color:#81c784',
  ha:    'background:rgba(226,177,60,0.2);color:#e2b13c',
  ffjda: 'background:rgba(156,39,176,0.2);color:#ce93d8',
};

export function deriveSource(m: HaMember): MemberSource {
  if (m.source) return m.source;
  return m.raw_data?.saisie_ffjda ? 'both' : 'ha';
}

export function sourceBadge(source: MemberSource): string {
  const style = SOURCE_STYLES[source] ?? SOURCE_STYLES.ha;
  return `<span style="${style};padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600">${esc(SOURCE_LABELS[source] ?? source)}</span>`;
}

/**
 * Construit la liste consolidée : union des adhérents HelloAsso (déjà annotés
 * de leur statut FFJDA via raw_data.saisie_ffjda) et des adhérents présents
 * uniquement côté FFJDA (status `ffjda_only` de la réconciliation).
 * `reconData` peut être null (aucun import FFJDA) → on retombe sur HA seul.
 */
export function consolidateMembers(
  haMembers: HaMember[],
  reconData: Record<string, unknown> | null | undefined,
): HaMember[] {
  const consolidated: HaMember[] = haMembers.map((m) => ({ ...m, source: deriveSource(m) }));

  const rows = (reconData?.reconciliation as Array<Record<string, unknown>> | undefined) ?? [];
  for (const r of rows) {
    if (String(r.status ?? '') !== 'ffjda_only') continue;
    consolidated.push({
      id: r.ffjda_licence ?? r.ffjda_email ?? `${r.ffjda_last_name}-${r.ffjda_first_name}`,
      first_name: (r.ffjda_first_name as string) ?? '',
      last_name:  (r.ffjda_last_name as string) ?? '',
      email:      (r.ffjda_email as string) ?? '',
      date_of_birth: (r.ffjda_dob as string) ?? '',
      ffjda_licence: (r.ffjda_licence as string) ?? '',
      source: 'ffjda',
      raw_data: { saisie_ffjda: true, ffjda_licence: r.ffjda_licence },
    });
  }
  return consolidated;
}

// ─── State ───────────────────────────────────────────────────────────────────

let _deps: ServiceDeps | undefined;
let _members: HaMember[] = [];
let _lastSync: string | null = null;
let _activeTab = 'list';
let _supabase: unknown;
let _membersVisible = false;

export function getDeps(): ServiceDeps {
  if (!_deps) throw new Error('[members] initMembersSection() doit être appelé avant toute utilisation du module.');
  return _deps;
}
export function getMembers(): HaMember[] { return _members; }
export function getLastSync(): string | null { return _lastSync; }
export function getActiveTab(): string { return _activeTab; }
export function getSupabase(): unknown { return _supabase; }
export function isMembersVisible(): boolean { return _membersVisible; }

export function setDeps(d: ServiceDeps): void { _deps = d; _supabase = d.supabase; }
export function setMembers(m: HaMember[]): void { _members = m; }
export function setLastSync(s: string | null): void { _lastSync = s; }
export function setActiveTab(t: string): void { _activeTab = t; }
export function setMembersVisible(v: boolean): void { _membersVisible = v; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function esc(v: unknown): string {
  return getDeps().escapeHtml(v);
}

export function renderEditableName(itemId: unknown, firstName?: string, lastName?: string): string {
  const ef = esc(firstName ?? '');
  const el = esc(lastName ?? '');
  const display = `${firstName ?? ''} ${lastName ?? ''}`.trim() || '\u2014';
  return `<span class="ha-name-display">
    ${esc(display)}
    <button class="ha-edit-btn" data-item-id="${esc(String(itemId))}"
      data-first="${ef}" data-last="${el}"
      style="border:none;background:none;cursor:pointer;font-size:11px;padding:0 4px;opacity:0;vertical-align:middle"
      title="Corriger le nom">&#9999;&#65039;</button>
  </span>`;
}

export function wireEditButtons(container: HTMLElement, onEdit: (itemId: unknown, first: string, last: string) => void): void {
  container.querySelectorAll('.ha-edit-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = btn as HTMLButtonElement;
      onEdit(b.dataset.itemId, b.dataset.first ?? '', b.dataset.last ?? '');
    });
  });
}

export function getStatusHtml(status: string): string {
  const styles: Record<string, string> = {
    'matched':       'background:rgba(76,175,80,0.2);color:#81c784;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600',
    'name_mismatch': 'background:rgba(255,152,0,0.2);color:#ffb74d;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600',
    'corrected':     'background:rgba(76,175,80,0.15);color:#a5d6a7;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600',
    'unmatched':     'background:rgba(244,67,54,0.2);color:#e57373;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600',
    'ffjda_only':    'background:rgba(156,39,176,0.2);color:#ce93d8;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600',
  };
  const labels: Record<string, string> = {
    'matched':       '&#x2705; Match',
    'name_mismatch': '&#x26A0;&#xFE0F; Nom diff.',
    'corrected':     '&#x270F;&#xFE0F; Corrige',
    'unmatched':     '&#x274C; Non matche',
    'ffjda_only':    '&#x1F195; FFJDA seul',
  };
  const style = styles[status] ?? 'background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600';
  const label = labels[status] ?? esc(status);
  return `<span style="${style}">${label}</span>`;
}
