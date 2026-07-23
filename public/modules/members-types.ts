// members-types.ts — Interfaces et types pour le module membres

export type MemberSource = 'ha' | 'ffjda' | 'both';

export interface HaMember {
  helloasso_id?: unknown;
  id?: unknown;
  first_name?: string;
  last_name?: string;
  email?: string;
  date_of_birth?: string;
  membership_amount?: number | null;
  membership_date?: string | null;
  discipline?: string;
  judo_category?: string;
  ffjda_licence?: string;
  // Source consolidée : 'ha' = HelloAsso seul, 'ffjda' = présent uniquement
  // dans FFJDA (ffjda_only), 'both' = adhérent HelloAsso saisi FFJDA.
  source?: MemberSource;
  raw_data?: { saisie_ffjda?: boolean; ffjda_licence?: unknown; [key: string]: unknown };
}

export interface FfjCategory {
  label: string;
  minYear: number;
  maxYear: number;
}

export interface ServiceDeps {
  syncHelloAssoMembers: () => Promise<unknown>;
  getHelloAssoMembers: () => Promise<HaMember[]>;
  getLastSyncTime: () => Promise<string | null>;
  parseHelloAssoCsv: (text: string) => Array<{ email?: string; date_of_birth?: string }>;
  importHelloAssoCsvData: (supabase: unknown, rows: Array<{ email?: string; date_of_birth?: string }>) => Promise<{ updated: number; notFound: string[] }>;
  importFfjdaCsv: (text: string) => Promise<{ matched: number; total: number; not_found: number }>;
  correctMemberName: (itemId: unknown, firstName: string, lastName: string) => Promise<{ success: boolean }>;
  getReconciliation: () => Promise<unknown>;
  getFfjdaMembers: () => Promise<unknown[]>;
  supabase: unknown;
  escapeHtml: (v: unknown) => string;
}
