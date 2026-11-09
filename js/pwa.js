// ===== pwa.js: APP-INSTALLATION und SERVICE WORKER (Update-Hinweis).
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= APP INSTALLIEREN (PWA) ================= */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('installBtn').style.display = 'inline-flex'; });
window.addEventListener('appinstalled', () => { deferredInstall = null; $('installBtn').style.display = 'none'; });
async function installApp() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null; $('installBtn').style.display = 'none';
}
/* ---------- Service Worker: Updates melden, nicht heimlich einspielen ---------- */
let swReg = null, updateRequested = false;
function showUpdateBanner() {
  if (document.getElementById('updateBanner')) return;
  const el = document.createElement('div');
  el.id = 'updateBanner'; el.className = 'update-banner'; el.setAttribute('role', 'status');
  el.innerHTML = '<span>Neue Version verfügbar.</span><button class="ub-go" type="button">Jetzt aktualisieren</button><button class="ub-later" type="button">Später</button>';
  el.querySelector('.ub-go').onclick = applyUpdate;
  el.querySelector('.ub-later').onclick = () => el.remove();
  document.body.appendChild(el);
  try { el.setAttribute('popover', 'manual'); el.showPopover(); } catch (e) { /* ohne Popover-Unterstützung: normal eingeblendet */ }
}
function applyUpdate() {
  const w = swReg && swReg.waiting;
  updateRequested = true;
  if (w) w.postMessage({ type: 'SKIP_WAITING' }); else location.reload();
}
function requestSwVersion() {
  try { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }); } catch (e) { /* ignore */ }
}
function initServiceWorker() {
  navigator.serviceWorker.addEventListener('message', ev => {
    if (ev.data && ev.data.type === 'VERSION') { const el = document.getElementById('pfAppVersion'); if (el) el.textContent = 'App-Stand: ' + ev.data.version; }
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested) location.reload(); });
  navigator.serviceWorker.register('sw.js').then(reg => {
    swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner();
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(); });
    });
    const check = () => reg.update().catch(() => { /* offline */ });
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch(() => { /* ohne Service Worker läuft die App trotzdem */ });
}
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', initServiceWorker);
}

