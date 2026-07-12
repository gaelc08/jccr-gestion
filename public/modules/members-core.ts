// members-core.ts — État global, types, constantes et helpers partagés

import type { ServiceDeps, HaMember, FfjCategory } from './members-types.ts';
export type { ServiceDeps, HaMember, FfjCategory };

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

// ─── State ───────────────────────────────────────────────────────────────────

let _deps: ServiceDeps;
let _members: HaMember[] = [];
let _lastSync: string | null = null;
let _activeTab = 'list';
let _supabase: unknown;
let _membersVisible = false;

export function getDeps(): ServiceDeps { return _deps; }
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
