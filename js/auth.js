// ===== auth.js: ANMELDUNG: Login, Registrierung, Passwort, Abmeldung, Inaktivitäts-Timer, Sitzungsablauf.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= ANMELDUNG ================= */
function showScreen(name) {
  $('loadingScreen').style.display = name === 'loading' ? 'flex' : 'none';
  $('loginScreen').style.display = name === 'login' ? 'flex' : 'none';
  $('pendingScreen').style.display = name === 'pending' ? 'flex' : 'none';
  $('app').classList.toggle('active', name === 'app');
  if (name !== 'app') closeMobileNav();
}
function showLoginMessage(kind, text) {
  $('loginError').style.display = kind === 'error' ? 'block' : 'none';
  $('loginInfo').style.display = kind === 'info' ? 'block' : 'none';
  if (kind === 'error') $('loginError').textContent = text;
  if (kind === 'info') $('loginInfo').textContent = text;
}

async function doLogin() {
  let input = $('loginEmail').value.trim();
  const pass = $('loginPass').value;
  if (!input || !pass) { showLoginMessage('error', 'Bitte E-Mail/Benutzername und Passwort eingeben.'); return; }
  const email = input.includes('@') ? input : localEmailFor(input);
  const btn = $('loginBtn');
  btn.disabled = true;
  showLoginMessage('none');
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false;
  if (error) {
    showLoginMessage('error', /Invalid login credentials/i.test(error.message) ? 'E-Mail/Benutzername oder Passwort ist falsch.' : friendlyError(error));
    $('loginPass').value = '';
    return;
  }
  $('loginPass').value = '';
  touchActive(true);
  // Der weitere Ablauf startet über onAuthStateChange
}
async function forgotPassword() {
  const email = $('loginEmail').value.trim();
  if (!email) { showLoginMessage('error', 'Bitte oben deine E-Mail-Adresse eintragen, dann erneut auf „Passwort vergessen?“ klicken.'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) { showLoginMessage('error', friendlyError(error)); return; }
  showLoginMessage('info', 'Falls es ein Konto mit dieser Adresse gibt, wurde eine E-Mail zum Zurücksetzen gesendet.');
}
function openRegisterDialog() {
  $('regName').value = ''; $('regEmail').value = ''; $('regPass').value = '';
  $('regError').style.display = 'none';
  registerDialog.showModal(); $('regName').focus();
}
async function submitRegister() {
  const name = $('regName').value.trim();
  const email = $('regEmail').value.trim();
  const pass = $('regPass').value;
  const errEl = $('regError');
  errEl.style.display = 'none';
  if (!name || !email || !pass) { errEl.textContent = 'Bitte alle Felder ausfüllen.'; errEl.style.display = 'block'; return; }
  if (pass.length < 6) { errEl.textContent = 'Das Passwort braucht mindestens 6 Zeichen.'; errEl.style.display = 'block'; return; }
  const btn = $('regBtn'); btn.disabled = true;
  const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { name } } });
  btn.disabled = false;
  if (error) { errEl.textContent = friendlyError(error); errEl.style.display = 'block'; return; }
  if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
    errEl.textContent = 'Diese E-Mail-Adresse ist bereits registriert.'; errEl.style.display = 'block'; return;
  }
  registerDialog.close();
  $('loginEmail').value = email;
  showLoginMessage('info', 'Konto angelegt. Bitte warte, bis ein Admin dich freischaltet, und melde dich danach an.');
}
async function doLogout() {
  await sb.auth.signOut();
  stopSession();
  showScreen('login');
}
function stopSession() {
  started = false; startingFor = null; me = null; recoveryMode = false;
  if (rtChannel) { sb.removeChannel(rtChannel); rtChannel = null; }
  db.profiles = []; db.projects = []; db.members = []; db.lists = []; db.items = [];
  stopIdleTimer();
}

async function onAuth(event, session) {
  if (!session) { stopSession(); showScreen('login'); return; }
  if (event === 'PASSWORD_RECOVERY') recoveryMode = true;
  if (started && me && me.id === session.user.id) {
    if (recoveryMode) { recoveryMode = false; openPasswordDialog(true); }
    return;
  }
  await startSession(session);
  if (recoveryMode) { recoveryMode = false; openPasswordDialog(true); }
}
async function startSession(session) {
  if (startingFor === session.user.id) return;
  startingFor = session.user.id;
  showScreen('loading');
  const { data: prof, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) {
    startingFor = null;
    $('loadingText').textContent = 'Verbindung fehlgeschlagen: ' + friendlyError(error);
    return;
  }
  me = prof || { id: session.user.id, email: session.user.email, name: session.user.email, role: 'pending' };
  if (me.role === 'pending') { started = true; showScreen('pending'); return; }
  try { await loadAll(); }
  catch (e) { startingFor = null; $('loadingText').textContent = 'Daten konnten nicht geladen werden: ' + friendlyError(e); return; }
  started = true;
  subscribeRealtime();
  showScreen('app');
  renderApp();
  startIdleTimer();
  startReminderToast();
  adminDailyTasks();
}
/* ================= AUTO-ABMELDUNG BEI INAKTIVITÄT ================= */
const IDLE_LIMIT_MS = 10 * 60 * 1000;
let idleTimer = null;
function resetIdleTimer() {
  if (!started) return;
  touchActive();
  clearTimeout(idleTimer);
  if (sessionDays() > 0) return; // lange Sitzung: Ablauf wird über die letzte Aktivität geprüft
  idleTimer = setTimeout(() => {
    if (started) { toast('Wegen Inaktivität automatisch abgemeldet.'); doLogout(); }
  }, IDLE_LIMIT_MS);
}
function startIdleTimer() {
  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, resetIdleTimer, { passive: true }));
  resetIdleTimer();
}
function stopIdleTimer() { clearTimeout(idleTimer); }
// Lange Sitzungen: läuft die Frist ohne Aktivität ab (z. B. Gerät lag liegen), wird abgemeldet
function checkSessionExpiry() {
  if (started && sessionExpired()) { toast('Die Sitzung ist abgelaufen. Bitte neu anmelden.'); doLogout(); }
}
setInterval(checkSessionExpiry, 5 * 60 * 1000);
// signierte Bild-Links laufen nach 24 h ab: rechtzeitig erneuern
setInterval(() => { if (started && Date.now() - imageUrlsFetchedAt > 6 * 3600 * 1000 && imageUrlCache.size) refresh(); }, 30 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkSessionExpiry(); });
// Eigene Wahl auf diesem Gerät ('' = Standard)
function setSessionPref(v) {
  try { if (v === '') localStorage.removeItem(SESSION_PREF_KEY); else localStorage.setItem(SESSION_PREF_KEY, String(Number(v))); } catch (e) { /* ignore */ }
  const nd = sessionDays();
  migrateSessionStorage(appliedSessionDays, nd);
  appliedSessionDays = nd;
  touchActive(true); resetIdleTimer();
  toast(nd === 0 ? 'Abmeldung beim Schließen und nach 10 Min. Inaktivität.' : `Du bleibst auf diesem Gerät bis zu ${sessionLabel(nd)} ohne Aktivität angemeldet.`);
}
// Admin-Standard wirkt nur auf Geräten ohne eigene Wahl
function applyAdminSessionDefault() {
  const s = db.settings || {};
  adminSessionDefaults.pwa = s.session_days_pwa === undefined ? null : Number(s.session_days_pwa);
  adminSessionDefaults.browser = s.session_days_browser === undefined ? null : Number(s.session_days_browser);
  const nd = sessionDays();
  migrateSessionStorage(appliedSessionDays, nd);
  appliedSessionDays = nd;
  if (started) resetIdleTimer();
}

async function recheckAccess() {
  const { data } = await sb.auth.getSession();
  if (!data.session) { stopSession(); showScreen('login'); return; }
  started = false; startingFor = null;
  await startSession(data.session);
}

