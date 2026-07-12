// ambient.d.ts — Déclarations ambiantes partagées pour la migration TypeScript.
// Centralise : modules chargés par URL (esm.sh), propriétés custom sur Window/
// Navigator/LockManager, et le global `chrome` (extension navigateur).
// Fichier de type uniquement — aucun impact runtime.

// ─── Modules chargés dynamiquement depuis esm.sh ─────────────────────────────
// Les imports gardent l'URL esm.sh au runtime ; on remappe vers les types réels
// du paquet npm installé quand ils existent.
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js';
}

declare module 'https://esm.sh/exceljs@4.4.0' {
  // exceljs n'est pas installé en local ; typage volontairement souple.
  const ExcelJS: any;
  export default ExcelJS;
  export = ExcelJS;
}

// ─── Global `chrome` (API extension navigateur, optionnelle au runtime) ──────
declare const chrome: any;

// ─── Augmentations DOM ───────────────────────────────────────────────────────
interface Navigator {
  /** iOS Safari : true quand l'app tourne en mode standalone (PWA). */
  standalone?: boolean;
}

interface LockManager {
  /** Marqueur posé par les shims de debug Supabase pour éviter un double-wrap. */
  __supabaseDebugWrapped?: boolean;
}

// Propriétés custom posées sur `window` par l'app (debug, caches, promesses).
interface Window {
  supabase?: any;
  __jccApiToken?: string | null;
  __lastSession?: unknown;
  __excelJsModulePromise?: Promise<any>;
  __supabaseFetchDebugWrappedInstalled?: boolean;
  __inviteDebugLast?: unknown;
  __getInviteDebugReport?: () => unknown;
  __copyInviteDebugReport?: () => unknown;
}
