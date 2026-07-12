// auth-forms.js — Login, register, logout, reset password form handlers
import { handleSSOCallback, setupSSOButton } from './auth-sso.js';

export function setupAuthForms(supabase, { onLogoutSuccess } = {}) {
  // Handle SSO callback if present in URL
  if (new URLSearchParams(window.location.search).has('code')) {
    handleSSOCallback(supabase);
  }

  const emailInput      = document.getElementById('authEmail');
  const passwordInput   = document.getElementById('authPassword');
  const registerBtn     = document.getElementById('registerBtn');
  const loginBtn        = document.getElementById('loginBtn');
  const resetPasswordBtn = document.getElementById('resetPasswordBtn');
  const logoutBtn       = document.getElementById('logoutBtn');
  const statusSpan      = document.getElementById('authStatus');

  registerBtn?.addEventListener('click', async () => {
    const email = emailInput?.value.trim();
    const pass  = passwordInput?.value.trim();
    if (!email || !pass) { alert('Veuillez saisir votre adresse e-mail et votre mot de passe.'); return; }
    try {
      const { error } = await supabase.auth.signUp({ email, password: pass });
      if (error) throw error;
      if (statusSpan) statusSpan.textContent = 'Compte créé et connecté.';
    } catch (e) { alert(e.message); }
  });

  loginBtn?.addEventListener('click', async () => {
    const email = emailInput?.value.trim();
    const pass  = passwordInput?.value.trim();
    if (!email || !pass) { alert('Veuillez saisir votre adresse e-mail et votre mot de passe.'); return; }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
    } catch (e) { alert(e.message); }
  });

  logoutBtn?.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) { alert('Logout failed: ' + error.message); return; }
      onLogoutSuccess?.();
    } catch (e) {
      alert('Logout exception: ' + e.message);
    } finally {
      logoutBtn.disabled = false;
    }
  });

  resetPasswordBtn?.addEventListener('click', async () => {
    const email = emailInput?.value.trim();
    if (!email) { alert('Veuillez saisir votre adresse e-mail.'); return; }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) throw error;
      alert('E-mail de réinitialisation envoyé. Vérifiez votre boîte de réception.');
    } catch (e) { alert(e.message); }
  });

  setupSSOButton(supabase);
}
