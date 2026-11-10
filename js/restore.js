// ===== restore.js: WIEDERHERSTELLEN: vollständige Sicherung (JSON) zurück in die Datenbank einspielen.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= WIEDERHERSTELLEN =================
   Nur für Admins. Spielt eine Datei aus „Vollständige Sicherung herunterladen“ ein:
   - Datensätze werden mit ihren ursprünglichen IDs eingespielt (vorhandene werden überschrieben, fehlende ergänzt).
   - Es wird NICHTS gelöscht. Was nach der Sicherung neu entstand, bleibt bestehen.
   - Benutzerkonten und Rollen sind nicht Teil davon (sie hängen am Anmeldesystem). Verweise auf Benutzer, die es
     nicht mehr gibt, werden leer gelassen; Projektmitgliedschaften nur für vorhandene, freigeschaltete Benutzer.
     Als Ersteller der Projekte steht danach der wiederherstellende Admin (die Datenbank erlaubt nichts anderes). */
const RESTORE_STEPS = [
  ['categories', 'Kategorien', 'id'], ['suppliers', 'Einkaufslisten (Lieferanten)', 'id'], ['projects', 'Projekte', 'id'],
  ['project_members', 'Mitgliedschaften', 'project_id,user_id'], ['lists', 'Listen', 'id'], ['items', 'Zutaten', 'id'],
  ['recipes', 'Rezepte', 'id'], ['recipe_items', 'Rezept-Zutaten', 'id']
];
let restoring = false;
function pickRestoreFile() { if (me && me.role === 'admin') $('restoreFileInput').click(); }
function restoreFromBackup(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file || !me || me.role !== 'admin') return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); } catch (e) { toast('Das ist keine gültige Sicherungsdatei.', null, null, true); return; }
    if (!parsed || parsed.app !== 'kombuese' || parsed.kind !== 'full-backup' || !parsed.full || !Array.isArray(parsed.full.projects)) {
      toast('Das ist keine vollständige Sicherung. Bitte eine Datei aus „Vollständige Sicherung herunterladen“ wählen.', null, null, true); return;
    }
    const f = parsed.full;
    const counts = RESTORE_STEPS.filter(([t]) => Array.isArray(f[t]) && f[t].length).map(([t, label]) => `${f[t].length} ${label}`).join(', ');
    const nImg = parsed.images ? Object.keys(parsed.images).length : 0;
    const when = parsed.exportedAt ? ` vom ${new Date(parsed.exportedAt).toLocaleDateString('de-DE')}` : '';
    openConfirm(`Sicherung${when} wiederherstellen? Enthalten: ${counts || 'keine Daten'}${nImg ? `, ${nImg} Bild${nImg === 1 ? '' : 'er'}` : ''}. Vorhandene Einträge mit gleicher ID werden auf den Stand der Sicherung gesetzt, fehlende ergänzt. Es wird nichts gelöscht.`,
      () => runRestore(parsed), 'Wiederherstellen');
  };
  reader.readAsText(file);
}
async function runRestore(parsed) {
  if (restoring || !me || me.role !== 'admin') return;
  restoring = true;
  const btn = $('restoreBtn'), info = $('restoreInfo');
  if (btn) btn.disabled = true;
  const f = parsed.full;
  const knownUsers = new Set(db.profiles.map(p => p.id));
  const activeUsers = new Set(db.profiles.filter(p => p.role !== 'pending').map(p => p.id));
  const clean = (row) => {
    const o = { ...row };
    Object.keys(o).forEach(k => { if (/_by$/.test(k)) o[k] = knownUsers.has(o[k]) ? o[k] : null; });
    return o;
  };
  // Namen sind in der Datenbank eindeutig: gleichnamige Einträge mit anderer ID nicht doppelt einspielen
  const nameTaken = (table, row) => (table === 'categories' ? db.categories : table === 'suppliers' ? db.suppliers : [])
    .some(x => x.id !== row.id && String(x.name).trim().toLowerCase() === String(row.name || '').trim().toLowerCase());
  const errors = []; let total = 0;
  for (const [table, label, conflict] of RESTORE_STEPS) {
    let rows = Array.isArray(f[table]) ? f[table] : [];
    if (table === 'project_members') rows = rows.filter(r => activeUsers.has(r.user_id));
    if (table === 'categories' || table === 'suppliers') rows = rows.filter(r => !nameTaken(table, r));
    if (!rows.length) continue;
    rows = rows.map(clean);
    // Neue Projekte darf die Datenbank nur mit dem angemeldeten Admin als Ersteller anlegen
    if (table === 'projects') rows = rows.map(r => ({ ...r, created_by: me.id }));
    for (let k = 0; k < rows.length; k += 200) {
      if (info) info.textContent = `Stelle ${label} wieder her … (${Math.min(k + 200, rows.length)} von ${rows.length})`;
      const { error } = await sb.from(table).upsert(rows.slice(k, k + 200), { onConflict: conflict });
      if (error) { errors.push(`${label}: ${friendlyError(error)}`); break; }
      total += Math.min(200, rows.length - k);
    }
  }
  let imgOk = 0, imgFail = 0;
  const images = parsed.images && typeof parsed.images === 'object' ? Object.entries(parsed.images) : [];
  for (let i = 0; i < images.length; i++) {
    const [ref, dataUrl] = images[i];
    if (!isStorageRef(ref) || !isDataUrl(dataUrl)) { imgFail++; continue; }
    if (info) info.textContent = `Stelle Bild ${i + 1} von ${images.length} wieder her …`;
    try {
      const blob = dataUrlToBlob(dataUrl);
      const { error } = await sb.storage.from(IMAGE_BUCKET).upload(ref.slice(8), blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000', upsert: true });
      if (error) imgFail++; else imgOk++;
    } catch (e) { imgFail++; }
  }
  restoring = false;
  if (btn) btn.disabled = false;
  imageUrlsFetchedAt = 0;
  await refresh();
  const summary = `${total} Datensätze${images.length ? `, ${imgOk} Bild${imgOk === 1 ? '' : 'er'}` : ''} wiederhergestellt.`;
  if (info) info.textContent = errors.length || imgFail ? '' : summary;
  if (errors.length || imgFail) {
    const msg = [errors.length ? 'Fehler bei: ' + errors.join('; ') : '', imgFail ? `${imgFail} Bild${imgFail === 1 ? '' : 'er'} nicht` : ''].filter(Boolean).join(' · ');
    if (info) info.textContent = summary + ' ' + msg;
    toast('Wiederherstellung unvollständig. ' + msg, null, null, true);
  } else toast('Wiederherstellung abgeschlossen. ' + summary);
}
