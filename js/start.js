// ===== start.js: START: Einstiegspunkt, läuft als letztes.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= START ================= */
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
  setTimeout(() => onAuth(event, session), 0); // nicht direkt im Callback weiterarbeiten (Supabase-Empfehlung)
});
(async () => {
  if (sessionExpired()) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* ignore */ } }
  const { data, error } = await sb.auth.getSession();
  if (error) { $('loadingText').textContent = 'Fehler: ' + friendlyError(error); return; }
  await onAuth('INIT', data.session);
})();
