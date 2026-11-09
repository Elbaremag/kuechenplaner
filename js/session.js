// ===== session.js: SITZUNG: Dauer der Anmeldung (Tab/Tage), Speicherort der Sitzung, Supabase-Client.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ---------- Sitzungsdauer ----------
   0 Tage  = Sitzung nur im Tab (sessionStorage), Abmeldung nach 10 Min. Inaktivität (bisheriges Verhalten)
   N Tage  = Sitzung bleibt auf diesem Gerät gespeichert (localStorage), solange man innerhalb von N Tagen wieder aktiv ist
   Reihenfolge: eigene Wahl auf diesem Gerät → Standard des Admins → eingebaut (installierte App 30 Tage, Browser 0) */
const SESSION_OPTIONS = [0, 1, 7, 30, 90];
const SESSION_PREF_KEY = 'kombuese-session-days';
const LAST_ACTIVE_KEY = 'kombuese-last-active';
const adminSessionDefaults = { pwa: null, browser: null };
let appliedSessionDays = null;
let lastTouch = 0;
function isPwa() {
  try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) { return false; }
}
function ownSessionPref() {
  try { const v = localStorage.getItem(SESSION_PREF_KEY); const n = v === null ? NaN : Number(v); return SESSION_OPTIONS.includes(n) ? n : null; } catch (e) { return null; }
}
function defaultSessionDays() {
  const v = isPwa() ? adminSessionDefaults.pwa : adminSessionDefaults.browser;
  return SESSION_OPTIONS.includes(v) ? v : (isPwa() ? 30 : 0);
}
function sessionDays() { const o = ownSessionPref(); return o !== null ? o : defaultSessionDays(); }
function sessionLabel(d) { return d === 0 ? 'Bis zum Schließen (Abmeldung nach 10 Min. Inaktivität)' : d === 1 ? '1 Tag' : d + ' Tage'; }
const authStorage = {
  area() { return sessionDays() > 0 ? window.localStorage : window.sessionStorage; },
  getItem(k) { try { return this.area().getItem(k); } catch (e) { return null; } },
  setItem(k, v) { try { this.area().setItem(k, v); } catch (e) { /* Speicher gesperrt */ } },
  removeItem(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
// Wechselt der Speicherort, wandert die laufende Sitzung mit (sonst wäre man abgemeldet)
function migrateSessionStorage(oldDays, newDays) {
  if ((oldDays > 0) === (newDays > 0)) return;
  const from = oldDays > 0 ? localStorage : sessionStorage, to = oldDays > 0 ? sessionStorage : localStorage;
  try {
    Object.keys(from).filter(k => k.startsWith('sb-')).forEach(k => { to.setItem(k, from.getItem(k)); from.removeItem(k); });
  } catch (e) { /* ignore */ }
}
function touchActive(force) {
  if (sessionDays() === 0) return;
  const now = Date.now();
  if (force || now - lastTouch > 60000) { lastTouch = now; try { localStorage.setItem(LAST_ACTIVE_KEY, String(now)); } catch (e) { /* ignore */ } }
}
function sessionExpired() {
  const d = sessionDays();
  if (d === 0) return false;
  let t = 0; try { t = Number(localStorage.getItem(LAST_ACTIVE_KEY)) || 0; } catch (e) { /* ignore */ }
  return t > 0 && Date.now() - t > d * 86400000;
}
appliedSessionDays = sessionDays();
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: authStorage, persistSession: true, autoRefreshToken: true }
});

