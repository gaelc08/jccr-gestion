// auth-sso.js — PKCE helpers + SSO Keycloak callback
import { kcUrl, kcRealm, kcClient } from './env.js';

// ===== PKCE helpers =====
export function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ===== SSO callback handler =====
export async function handleSSOCallback(supabase) {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  if (!code) return;

  const verifier = sessionStorage.getItem('pkce_verifier');
  if (!verifier) {
    console.error('SSO: no PKCE verifier found in sessionStorage');
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  try {
    const tokenEndpoint = `${kcUrl}/realms/${kcRealm}/protocol/openid-connect/token`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'jcc-frontend',
      code,
      redirect_uri: window.location.origin + window.location.pathname,
      code_verifier: verifier,
    });

    const tokenResp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.json();
      throw new Error(err.error_description || err.error || `Token exchange failed: ${tokenResp.status}`);
    }

    const tokens = await tokenResp.json();
    if (!tokens.id_token) throw new Error('No id_token received from Keycloak');

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'keycloak',
      token: tokens.id_token,
    });
    if (error) throw new Error(`Supabase auth failed: ${error.message}`);
  } catch (e) {
    console.error('SSO callback error:', e);
    alert('Erreur SSO : ' + e.message);
  } finally {
    window.history.replaceState({}, '', window.location.pathname);
    sessionStorage.removeItem('pkce_verifier');
  }
}

// ===== SSO button handler =====
export function setupSSOButton(supabase) {
    const ssoBtn = document.getElementById('ssoBtn') as HTMLButtonElement | null;
  ssoBtn!.addEventListener('click', () => {
    ssoBtn!.disabled = true;
    ssoBtn!.textContent = 'Redirection...';
    const codeVerifier = generateCodeVerifier();
    sessionStorage.setItem('pkce_verifier', codeVerifier);
    generateCodeChallenge(codeVerifier)
      .then(challenge => {
        const kcAuthUrl = `${kcUrl}/realms/${kcRealm}/protocol/openid-connect/auth`;
        const params = new URLSearchParams({
          client_id: kcClient,
          redirect_uri: window.location.origin + window.location.pathname,
          response_type: 'code',
          scope: 'openid email profile',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        });
        window.location.href = `${kcAuthUrl}?${params.toString()}`;
      })
      .catch(() => {
        // Fallback sans PKCE
        const kcAuthUrl = `${kcUrl}/realms/${kcRealm}/protocol/openid-connect/auth`;
        const params = new URLSearchParams({
          client_id: kcClient,
          redirect_uri: window.location.origin + window.location.pathname,
          response_type: 'code',
          scope: 'openid email profile',
        });
        window.location.href = `${kcAuthUrl}?${params.toString()}`;
      });
  });
}
