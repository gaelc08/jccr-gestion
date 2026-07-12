/**
 * global.d.ts — Augmentations globales pour le projet JCC gestion
 * Propriétés window.* ajoutées dynamiquement par les modules.
 */

import type { Session, SupabaseClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    // Supabase runtime
    supabase: SupabaseClient;

    // Session debug (auth-state.ts)
    __lastSession: Session | null;

    // Fetch debug shim (supabase-client.ts)
    __supabaseFetchDebugWrappedInstalled: boolean;

    // API token (helloasso-service.ts)
    __jccApiToken: string | undefined;

    // Invite debug tools (invite-debug.ts)
    __inviteDebugLast: Record<string, unknown> | null;
    __getInviteDebugReport: () => string;
    __copyInviteDebugReport: () => Promise<string>;

    // ExcelJS module cache (export-runtime.ts)
    __excelJsModulePromise: Promise<unknown> | undefined;

    // Index signature for dynamic property access (calendar-ui, summary-ui, etc.)
    [key: string]: unknown;
  }
}

export {};
