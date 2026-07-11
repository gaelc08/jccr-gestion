const PROD_SUPABASE_URL = 'https://ajbpzueanpeukozjhkiv.supabase.co';
const PROD_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqYnB6dWVhbnBldWtvempoa2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4OTQyMTAsImV4cCI6MjA4ODQ3MDIxMH0.1i1nJ3DlHGVPIWKNjD64ZyHj3cxG4o-ikju-sO0T67A';

// Test environment: self-hosted Supabase behind Caddy proxy
const TEST_SUPABASE_URL = 'https://test.judo-cattenom.fr/supabase';
const TEST_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgzNzc1MDgzLCJleHAiOjIwOTkxMzUwODN9.PjE4ivb4J134uEi1mqtbyUDGbDBfyY7cxsvVV1b_VH0';

const TEST_KC_URL = 'https://auth.test.judo-cattenom.fr';
const PROD_KC_URL = 'https://auth.judo-cattenom.fr';

const hostname = (window.location.hostname || '').toLowerCase();
const isLocalHost = ['localhost', '127.0.0.1'].includes(hostname);
const isTestHost = hostname === 'test.judo-cattenom.fr';

const ENV_OVERRIDE_KEY = 'jct.env.override';

// Query param ?env=test|prod|auto
const envParam = (new URLSearchParams(window.location.search).get('env') || '').toLowerCase();

if (envParam === 'test' || envParam === 'prod') {
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

const effectiveOverride =
  envParam === 'test' || envParam === 'prod'
    ? envParam
    : (persistedOverride === 'test' || persistedOverride === 'prod'
        ? persistedOverride
        : '');

export const effectiveEnv =
  isTestHost ? 'test'
  : (effectiveOverride || (isLocalHost ? 'test' : 'prod'));

export const supabaseUrl =
  effectiveEnv === 'test' ? TEST_SUPABASE_URL : PROD_SUPABASE_URL;

export const supabaseKey =
  effectiveEnv === 'test' ? TEST_SUPABASE_KEY : PROD_SUPABASE_KEY;

export const kcUrl = effectiveEnv === 'test' ? TEST_KC_URL : PROD_KC_URL;
export const kcRealm = 'jccattenom';
export const kcClient = 'jcc-frontend';

export const siteUrl =
  effectiveEnv === 'test'
    ? 'https://test.judo-cattenom.fr'
    : 'https://judo-cattenom.fr';

export const VERSION_DATE = '2026-07-06';
export const VERSION_INCREMENT = '02';
export const BUILD_ID = `${VERSION_DATE}-r${VERSION_INCREMENT}`;

console.log('DEBUG env:', effectiveEnv, 'supabase:', supabaseUrl);

export const getVersion = () => {
  return `-r`;
};
