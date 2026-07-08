const PROD_SUPABASE_URL = 'https://ajbpzueanpeukozjhkiv.supabase.co';
const PROD_SUPABASE_KEY = 'eyJhbG...T67A';

const DEV_SUPABASE_URL = 'https://nkzsjyzhpvivfgslzltn.supabase.co';
const DEV_SUPABASE_KEY = 'sb_publishable_lHFJ9uxG0ZgkCeONR3PXyA_Jf8Lx_p_';

// Test environment: self-hosted Supabase behind Caddy proxy
const TEST_SUPABASE_URL = 'https://test.judo-cattenom.fr/supabase';
const TEST_SUPABASE_KEY = 'sb_publishable_lHFJ9uxG0ZgkCeONR3PXyA_Jf8Lx_p_';

const TEST_KC_URL = 'https://auth.test.judo-cattenom.fr';
const PROD_KC_URL = 'https://auth.judo-cattenom.fr';

const hostname = (window.location.hostname || '').toLowerCase();
const isLocalHost = ['localhost', '127.0.0.1'].includes(hostname);
const isDevHost = hostname === 'dev' || hostname.startsWith('dev.') || hostname.startsWith('dev-');
const isTestHost = hostname === 'test.judo-cattenom.fr';
const ENV_OVERRIDE_KEY = 'jct.env.override';
const envParam = (new URLSearchParams(window.location.search).get('env') || '').toLowerCase();

if (envParam === 'dev' || envParam === 'prod') {
  try {
    window.localStorage.setItem(ENV_OVERRIDE_KEY, envParam);
  } catch {}
} else if (envParam === 'auto') {
  try {
    window.localStorage.removeItem(ENV_OVERRIDE_KEY);
  } catch {}
}

let persistedOverride = '';
try {
  persistedOverride = (window.localStorage.getItem(ENV_OVERRIDE_KEY) || '').toLowerCase();
} catch {}

const effectiveOverride = envParam === 'dev' || envParam === 'prod'
  ? envParam
  : (persistedOverride === 'dev' || persistedOverride === 'prod' ? persistedOverride : '');

export const effectiveEnv = isTestHost
  ? 'test'
  : (effectiveOverride || ((isLocalHost || isDevHost) ? 'dev' : 'prod'));

const localDevUrlOverride = window.localStorage.getItem('jct.dev.supabase.url');
const localDevKeyOverride = window.localStorage.getItem('jct.dev.supabase.key');

export const supabaseUrl = effectiveEnv === 'test'
  ? TEST_SUPABASE_URL
  : (effectiveEnv === 'dev'
    ? (localDevUrlOverride || DEV_SUPABASE_URL || PROD_SUPABASE_URL)
    : PROD_SUPABASE_URL);

export const supabaseKey = effectiveEnv === 'test'
  ? TEST_SUPABASE_KEY
  : (effectiveEnv === 'dev'
    ? (localDevKeyOverride || DEV_SUPABASE_KEY || PROD_SUPABASE_KEY)
    : PROD_SUPABASE_KEY);

// Keycloak config (auto-detected by hostname)
export const kcUrl = effectiveEnv === 'test' ? TEST_KC_URL : PROD_KC_URL;
export const kcRealm = 'jccattenom';
export const kcClient = 'jcc-frontend';

// Site URL (for redirect URIs, etc.)
export const siteUrl = effectiveEnv === 'test'
  ? 'https://test.judo-cattenom.fr'
  : 'https://judo-cattenom.fr';

export const VERSION_DATE = '2026-07-06';
export const VERSION_INCREMENT = '02';
export const BUILD_ID = `${VERSION_DATE}-r${VERSION_INCREMENT}`;

if (effectiveEnv === 'dev' && !localDevKeyOverride) {
  console.info('DEBUG dev env active using remote dev Supabase project defaults.');
}

console.log('DEBUG env:', effectiveEnv, 'supabase:', supabaseUrl);

// Fonction pour récupérer la version automatiquement
export const getVersion = () => {
  return `-r`;
};
