interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function setupPWA() {
  let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const swUrl = new URL('sw.js', window.location.href);
        const scopeUrl = new URL('./', window.location.href);
        const reg = await navigator.serviceWorker.register(swUrl.href, {
          scope: scopeUrl.pathname
        });
        console.log('DEBUG service worker registered:', reg.scope);
      } catch (e) {
        console.warn('DEBUG service worker registration failed:', e);
      }
    });
  }

  const installBtn = document.getElementById('installAppBtn');
  if (!installBtn) return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    installBtn.style.display = 'inline-block';
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installBtn.style.display = 'none';
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } catch {}
    deferredInstallPrompt = null;
    installBtn.style.display = 'none';
  });
}
