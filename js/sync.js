// ===== sync.js: LIVE-SYNC: Echtzeit-Aktualisierung über Supabase Realtime.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= LIVE-SYNC ================= */
function setLive(state) {
  const el = $('liveStatus');
  if (!el) return;
  if (state === 'ok') { el.textContent = '● live verbunden'; el.style.color = 'var(--sage)'; }
  else if (state === 'error') { el.textContent = '⚠ Verbindung unterbrochen'; el.style.color = 'var(--warn)'; }
  else { el.textContent = '… verbinde'; el.style.color = 'var(--ink-faint)'; }
}
function subscribeRealtime() {
  if (rtChannel) { sb.removeChannel(rtChannel); rtChannel = null; }
  setLive('connecting');
  const ch = sb.channel('kombuese-live');
  ['profiles', 'projects', 'project_members', 'lists', 'items', 'recipes', 'recipe_items', 'suppliers', 'app_settings', ...(db.categoriesOk ? ['categories'] : [])].forEach(t => {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, scheduleReload);
  });
  ch.subscribe(status => {
    if (status === 'SUBSCRIBED') setLive('ok');
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLive('error');
  });
  rtChannel = ch;
}

let reloadTimer = null;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    if (!started || !me) return;
    try { await loadAll(); }
    catch (e) { console.error(e); setLive('error'); return; }
    if (me.role === 'pending') { showScreen('pending'); return; }
    safeRender();
  }, 300);
}
// Eigene Änderung: sofort neu laden und zeichnen
async function refresh() {
  try { await loadAll(); }
  catch (e) { toast('Aktualisieren fehlgeschlagen: ' + friendlyError(e), null, null, true); return; }
  if (me.role === 'pending') { showScreen('pending'); return; }
  renderApp();
}
// Fremde Änderung: nicht mitten in einer Eingabe neu zeichnen
let renderDirty = false;
function isBusyEditing() {
  const ae = document.activeElement;
  const typing = ae && ['INPUT', 'SELECT', 'TEXTAREA'].includes(ae.tagName) && ae.closest('#main');
  return !!typing || !!document.querySelector('dialog[open]');
}
function safeRender() {
  if (isBusyEditing()) { renderDirty = true; return; }
  renderApp();
}
function flushDirty() {
  if (renderDirty && started && me && me.role !== 'pending' && !isBusyEditing()) { renderDirty = false; renderApp(); }
}
document.addEventListener('focusout', () => setTimeout(flushDirty, 200));
document.addEventListener('close', () => setTimeout(flushDirty, 50), true);
document.addEventListener('visibilitychange', () => { if (!document.hidden && started) scheduleReload(); });
window.addEventListener('online', () => { if (started) { subscribeRealtime(); scheduleReload(); } });

// Schreibvorgang mit Fehlerbehandlung
async function mutate(builder) {
  const { error } = await builder;
  if (error) { toast('Fehler: ' + friendlyError(error), null, null, true); return false; }
  await refresh();
  return true;
}


