// ===== admin.js: ADMINISTRATION: Benutzer, Rollen, Einkaufslisten, Kategorien, Sitzungsdauer, Papierkorb, Sicherung, Import.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= SYSTEMVERWALTUNG ================= */
function openUserAdmin() {
  if (!me || me.role !== 'admin') return;
  closeMobileNav();
  renderUserAdminList(); renderAllProjectsList(); renderSupplierAdminList(); renderCategoryAdminList(); renderRoleLegend();
  $('versionInput').value = (db.settings && db.settings.version) || ''; renderSessionAdmin();
  $('newUserLocal').checked = false; toggleNewUserLocal();
  userAdminDialog.showModal();
}
function renderRoleLegend() {
  $('roleLegend').innerHTML = ['admin', 'lead', 'editor', 'viewer'].map(r => `
    <div style="margin-bottom:8px;">
      <span class="role-badge ${r}">${roleLabel(r)}</span>
      <span class="role-desc" style="margin-top:2px; display:block;">${escapeHtml(roleDescription(r))}</span>
    </div>`).join('');
}
function renderUserAdminList() {
  const users = [...db.profiles].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
  $('userAdminList').innerHTML = users.map(u => `
    <div class="member-row">
      <span style="display:flex; align-items:center; gap:10px;">
        ${avatarHtml(u, 'small')}
        <span>${escapeHtml(u.name || '—')}<div class="meta">${u.username ? '@' + escapeHtml(u.username) + ' (lokal)' : escapeHtml(u.email || '')}</div></span>
      </span>
      <span style="display:flex; align-items:center; gap:6px;">
        <select ${u.id === me.id ? 'disabled title="Eigene Rolle kann nicht geändert werden"' : ''} onchange="setUserRole('${u.id}', this.value)">
          ${['pending', 'viewer', 'editor', 'lead', 'admin'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}
        </select>
        ${u.id === me.id ? '' : `<button class="icon-btn" data-delete-user="${u.id}" onclick="deleteUser('${u.id}')" title="Benutzer löschen" aria-label="Benutzer löschen">🗑</button>`}
      </span>
    </div>`).join('');
}
// Löschen geht nur über die Edge Function „delete-user“ (braucht den Service-Role-Key, der nie in die App darf)
let deleteUserId = null;
function deleteUser(id) {
  const u = db.profiles.find(p => p.id === id);
  if (!u || id === me.id || me.role !== 'admin') return;
  deleteUserId = id;
  $('duText').textContent = `Benutzer „${u.name || u.email || u.username}“ endgültig löschen?`;
  document.querySelector('input[name="duProjects"][value="keep"]').checked = true;
  deleteUserDialog.showModal();
}
async function runDeleteUser() {
  const id = deleteUserId, u = db.profiles.find(p => p.id === id);
  if (!u || id === me.id || me.role !== 'admin') return;
  const mode = (document.querySelector('input[name="duProjects"]:checked') || {}).value || 'keep';
  deleteUserDialog.close();
  const { data, error } = await sb.functions.invoke('delete-user', { body: { user_id: id, projects: mode } });
  let msg = null;
  if (error) {
    msg = /not found|404|Failed to send|FunctionsFetchError/i.test(error.message || '') || error.name === 'FunctionsFetchError'
      ? 'Die Funktion „delete-user“ ist in Supabase noch nicht eingerichtet (siehe Anleitung).'
      : friendlyError(error);
    try { const b = error.context && await error.context.json(); if (b && b.error) msg = b.error; } catch (e) { /* ignore */ }
  } else if (data && data.error) msg = data.error;
  if (msg) { toast('Löschen fehlgeschlagen: ' + msg, null, null, true); return; }
  await refresh();
  toast(`Benutzer „${u.name || u.email || u.username}“ gelöscht.`);
}
async function setUserRole(id, role) {
  if (id === me.id) return;
  await mutate(sb.from('profiles').update({ role }).eq('id', id));
}
function toggleNewUserLocal() {
  const local = $('newUserLocal').checked;
  $('newUserEmailField').style.display = local ? 'none' : '';
  $('newUserUsernameField').style.display = local ? '' : 'none';
}
async function createUser() {
  const name = $('newUserName').value.trim();
  const local = $('newUserLocal').checked;
  const username = $('newUserUsername').value.trim();
  const emailInput = $('newUserEmail').value.trim();
  const password = $('newUserPassword').value;
  const role = $('newUserRole').value;
  if (!name || !password || (local ? !username : !emailInput)) {
    toast(local ? 'Bitte Name, Benutzername und Passwort angeben.' : 'Bitte Name, E-Mail und Passwort angeben.', null, null, true);
    return;
  }
  if (password.length < 6) { toast('Das Passwort braucht mindestens 6 Zeichen.', null, null, true); return; }
  const email = local ? localEmailFor(username) : emailInput;
  const btn = $('createUserBtn'); btn.disabled = true;
  // Eigener, kurzlebiger Client, damit die Sitzung des Admins unberührt bleibt
  const tmp = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'kombuese-tmp-signup' }
  });
  const { data, error } = await tmp.auth.signUp({ email, password, options: { data: { name } } });
  btn.disabled = false;
  if (error) { toast('Fehler: ' + friendlyError(error), null, null, true); return; }
  if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
    toast(local ? 'Dieser Benutzername ist bereits vergeben.' : 'Diese E-Mail-Adresse ist bereits registriert.', null, null, true); return;
  }
  const patch = { role, name };
  if (local) patch.username = slugifyUsername(username);
  const { error: e2 } = await sb.from('profiles').update(patch).eq('id', data.user.id);
  if (e2) { toast('Konto angelegt, Rolle konnte nicht gesetzt werden: ' + friendlyError(e2), null, null, true); }
  else toast(`Konto für ${name} angelegt.`);
  $('newUserName').value = ''; $('newUserEmail').value = ''; $('newUserUsername').value = ''; $('newUserPassword').value = '';
  await refresh();
}
function renderSupplierAdminList() {
  const suppliers = [...db.suppliers].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  $('supplierAdminList').innerHTML = suppliers.length ? suppliers.map(s => `
    <div class="member-row">
      <span style="min-width:0;">${escapeHtml(s.name)}${s.note ? `<div class="meta" style="white-space:pre-wrap;">📝 ${escapeHtml(s.note)}</div>` : ''}</span>
      <span style="display:flex; gap:2px; flex-shrink:0;">
        <button class="icon-btn" title="Notiz bearbeiten" aria-label="Einkaufsliste bearbeiten" onclick="openSupplierDialog('${escapeHtml(escapeJs(s.name))}')">✎</button>
        <button class="icon-btn del" aria-label="Einkaufsliste entfernen" onclick="deleteSupplier('${s.id}', '${escapeHtml(escapeJs(s.name))}')">✕</button>
      </span>
    </div>`).join('') : `<div style="color:var(--ink-faint); font-size:13.5px;">Noch keine Einkaufslisten angelegt.</div>`;
}
async function createSupplier() {
  const input = $('newSupplierName');
  const name = input.value.trim();
  const note = $('newSupplierNote').value.trim();
  if (!name) { input.focus(); return; }
  const { error } = await sb.from('suppliers').insert(note ? { name, note } : { name });
  if (error) { toast(/duplicate|unique/i.test(error.message) ? 'Diese Einkaufsliste gibt es schon.' : 'Fehler: ' + friendlyError(error), null, null, true); return; }
  input.value = ''; $('newSupplierNote').value = '';
  await refresh();
}
function deleteSupplier(id, name) {
  openConfirm(`Einkaufsliste „${name}“ entfernen? Bereits eingetragene Zutaten behalten den Namen als Text.`,
    () => mutate(sb.from('suppliers').delete().eq('id', id)), 'Entfernen');
}

/* ---------- Einkaufslisten: Notizen ---------- */
const NO_SUPPLIER = 'Ohne Einkaufsliste';
function findSupplierByName(name) {
  const n = String(name || '').trim().toLowerCase();
  return n ? db.suppliers.find(s => s.name.trim().toLowerCase() === n) || null : null;
}
function canManageSuppliers() { return !!me && ['admin', 'lead', 'editor'].includes(me.role); }
function supplierNoteHtml(name) {
  const s = name === NO_SUPPLIER ? null : findSupplierByName(name);
  return s && s.note ? `<div class="sup-note">📝 ${escapeHtml(s.note)}</div>` : '';
}
function supplierEditButton(name, editable) {
  if (!editable || !canManageSuppliers() || name === NO_SUPPLIER) return '';
  return ` <button class="icon-btn no-print" title="Notiz der Einkaufsliste bearbeiten" aria-label="Einkaufsliste bearbeiten" onclick="openSupplierDialog('${escapeHtml(escapeJs(name))}')">✎</button>`;
}
let supplierDialogState = null;
function openSupplierDialog(name) {
  const s = findSupplierByName(name);
  supplierDialogState = { id: s ? s.id : null, name: s ? s.name : name };
  $('sdName').value = supplierDialogState.name;
  $('sdNote').value = s ? (s.note || '') : '';
  supplierDialog.showModal();
  $('sdNote').focus();
}
async function saveSupplierDialog() {
  const st = supplierDialogState;
  if (!st) return;
  const note = $('sdNote').value.trim();
  // Gibt es den Namen nur als Text in Zutaten (nicht in der Liste), wird die Einkaufsliste dabei angelegt.
  const res = st.id
    ? await sb.from('suppliers').update({ note }).eq('id', st.id).select('id')
    : await sb.from('suppliers').insert({ name: st.name, note }).select('id');
  if (res.error) { toast('Notiz konnte nicht gespeichert werden: ' + friendlyError(res.error), null, null, true); return; }
  if (st.id && !(res.data || []).length) { toast('Keine Berechtigung, diese Einkaufsliste zu ändern.', null, null, true); return; }
  supplierDialog.close();
  supplierDialogState = null;
  await refresh();
  toast('Einkaufsliste gespeichert.');
}

/* ---------- Kategorien zentral verwalten (Verwaltung, nur Admin) ---------- */
function categoryUsage(name) {
  const n = String(name).trim().toLowerCase();
  const same = i => String(i.category || '').trim().toLowerCase() === n;
  return db.items.filter(i => !i.deleted_at && same(i)).length + db.recipeItems.filter(same).length;
}
function unlistedCategories() {
  const known = new Set(db.categories.map(c => c.name.trim().toLowerCase()));
  const out = new Map();
  [...db.items, ...db.recipeItems].forEach(i => {
    const c = String(i.category || '').trim();
    if (c && !known.has(c.toLowerCase()) && !out.has(c.toLowerCase())) out.set(c.toLowerCase(), c);
  });
  return [...out.values()].sort((a, b) => a.localeCompare(b, 'de'));
}
function renderCategoryAdminList() {
  const box = $('categoryAdminList');
  if (!box) return;
  if (!db.categoriesOk) {
    box.innerHTML = `<div style="color:var(--ink-faint); font-size:13.5px;">Die zentrale Kategorienliste ist noch nicht eingerichtet. Bitte einmal <b>supabase-etappe2.sql</b> im Supabase SQL Editor ausführen.</div>`;
    return;
  }
  const cats = sortedCategories();
  let html = cats.length ? cats.map((c, i) => {
    const n = categoryUsage(c.name);
    return `
    <div class="member-row">
      <span style="min-width:0;">${escapeHtml(c.name)}${n ? ` <span class="meta">· ${n} Zutat${n === 1 ? '' : 'en'}</span>` : ''}</span>
      <span style="display:flex; gap:4px; align-items:center; flex-shrink:0;">
        <button class="move-btn" onclick="moveCategory('${c.id}', -1)" ${i === 0 ? 'disabled' : ''} aria-label="Kategorie nach oben" title="Nach oben">▲</button>
        <button class="move-btn" onclick="moveCategory('${c.id}', 1)" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Kategorie nach unten" title="Nach unten">▼</button>
        <button class="icon-btn" title="Umbenennen" aria-label="Kategorie umbenennen" onclick="openCategoryRename('${c.id}')">✎</button>
        <button class="icon-btn del" title="Entfernen" aria-label="Kategorie entfernen" onclick="deleteCategory('${c.id}')">✕</button>
      </span>
    </div>`;
  }).join('') : `<div style="color:var(--ink-faint); font-size:13.5px;">Noch keine Kategorien angelegt.</div>`;
  const extra = unlistedCategories();
  if (extra.length) {
    html += `<div class="meta" style="margin-top:14px;">In Zutaten verwendet, aber nicht in der Liste (zum Übernehmen antippen):</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">${extra.map(n =>
        `<button class="btn secondary small" onclick="createCategory('${escapeHtml(escapeJs(n))}')">+ ${escapeHtml(n)}</button>`).join('')}</div>`;
  }
  box.innerHTML = html;
}
async function createCategory(prefill) {
  if (!db.categoriesOk) { toast('Bitte zuerst supabase-etappe2.sql ausführen.', null, null, true); return; }
  const input = $('newCategoryName');
  const name = String(prefill || input.value).trim().replace(/\s+/g, ' ');
  if (!name) { input.focus(); return; }
  const order = db.categories.reduce((m, c) => Math.max(m, c.sort_order), 0) + 10;
  const { error } = await sb.from('categories').insert({ name, sort_order: order });
  if (error) { toast(/duplicate|unique/i.test(error.message) ? 'Diese Kategorie gibt es schon.' : 'Fehler: ' + friendlyError(error), null, null, true); return; }
  if (!prefill) input.value = '';
  await refresh();
}
let categoryReorderBusy = false;
async function moveCategory(id, dir) {
  if (categoryReorderBusy) return;
  const ids = sortedCategories().map(c => c.id);
  const from = ids.indexOf(id), to = from + dir;
  if (from === -1 || to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  const byId = new Map(db.categories.map(c => [c.id, c]));
  const changed = ids.map((cid, i) => ({ id: cid, order: (i + 1) * 10 })).filter(x => byId.get(x.id).sort_order !== x.order);
  categoryReorderBusy = true;
  try {
    const results = await Promise.all(changed.map(x => sb.from('categories').update({ sort_order: x.order }).eq('id', x.id)));
    const failed = results.find(r => r.error);
    if (failed) toast('Reihenfolge konnte nicht gespeichert werden: ' + friendlyError(failed.error), null, null, true);
    await refresh();
  } finally { categoryReorderBusy = false; }
}
let renameCategoryId = null;
function openCategoryRename(id) {
  const c = db.categories.find(x => x.id === id);
  if (!c) return;
  renameCategoryId = id;
  $('crName').value = c.name;
  const n = categoryUsage(c.name);
  $('crInfo').textContent = n ? `${n} Zutat${n === 1 ? '' : 'en'} mit dieser Kategorie werden mit umbenannt.` : '';
  categoryRenameDialog.showModal();
  $('crName').select();
}
async function saveCategoryRename() {
  const c = db.categories.find(x => x.id === renameCategoryId);
  const name = $('crName').value.trim().replace(/\s+/g, ' ');
  if (!c || !name) return;
  if (name === c.name) { categoryRenameDialog.close(); return; }
  // Datenbankfunktion: benennt Kategorie und alle Zutaten/Rezeptzutaten in einem Schritt um (nur Admin)
  const { error } = await sb.rpc('rename_category', { p_id: c.id, p_new: name });
  if (error) { toast(/duplicate|unique/i.test(error.message) ? 'Diese Kategorie gibt es schon.' : 'Fehler: ' + friendlyError(error), null, null, true); return; }
  categoryRenameDialog.close();
  renameCategoryId = null;
  await refresh();
  toast('Kategorie umbenannt.');
}
function deleteCategory(id) {
  const c = db.categories.find(x => x.id === id);
  if (!c) return;
  const n = categoryUsage(c.name);
  openConfirm(`Kategorie „${c.name}“ aus der Liste entfernen?` + (n ? ` ${n} Zutat${n === 1 ? '' : 'en'} behalten den Namen als Text.` : ''),
    () => mutate(sb.from('categories').delete().eq('id', id)), 'Entfernen');
}
function renderSessionAdmin() {
  const ok = db.settings && 'session_days_pwa' in db.settings;
  const opts = cur => SESSION_OPTIONS.map(d => `<option value="${d}" ${d === cur ? 'selected' : ''}>${escapeHtml(sessionLabel(d))}</option>`).join('');
  $('sessPwa').innerHTML = opts(ok ? Number(db.settings.session_days_pwa) : 30);
  $('sessBrowser').innerHTML = opts(ok ? Number(db.settings.session_days_browser) : 0);
  $('sessPwa').disabled = $('sessBrowser').disabled = $('sessSave').disabled = !ok;
  $('sessHint').style.display = ok ? 'none' : '';
  renderTrashAdmin();
  renderImageAdmin();
}
function legacyImageJobs() {
  const jobs = [];
  db.recipes.filter(r => isDataUrl(r.image)).forEach(r => jobs.push({ table: 'recipes', id: r.id, col: 'image', folder: 'recipes', value: r.image }));
  db.profiles.filter(p => isDataUrl(p.avatar)).forEach(p => jobs.push({ table: 'profiles', id: p.id, col: 'avatar', folder: 'avatars', value: p.avatar }));
  return jobs;
}
let imageMigrating = false;
const TRASH_OPTIONS = [7, 14, 30, 60, 90];
function trashDays() { const n = Number(db.settings && db.settings.trash_days); return n >= 1 ? n : 30; }
function trashOk() { return !!(db.settings && 'trash_days' in db.settings); }
function daysAgo(iso) { return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null; }
function renderTrashAdmin() {
  const ok = trashOk();
  $('trashDaysSel').innerHTML = TRASH_OPTIONS.map(d => `<option value="${d}" ${d === trashDays() ? 'selected' : ''}>${d} Tage</option>`).join('');
  $('trashDaysSel').disabled = $('trashSave').disabled = $('trashPurgeNow').disabled = !ok;
  $('trashHint').style.display = ok ? 'none' : '';
  const last = db.settings && db.settings.last_backup_at ? daysAgo(db.settings.last_backup_at) : null;
  $('backupInfo').textContent = !db.settings || !('last_backup_at' in db.settings) ? ''
    : last === null ? 'Noch keine vollständige Sicherung aus der App heruntergeladen.'
    : last === 0 ? 'Letzte vollständige Sicherung: heute.' : `Letzte vollständige Sicherung: vor ${last} Tag${last === 1 ? '' : 'en'}.`;
}
async function saveTrashDays() {
  await mutate(sb.from('app_settings').update({ trash_days: Number($('trashDaysSel').value), updated_by: me.id, updated_at: new Date().toISOString() }).eq('id', 'main'));
  toast('Aufbewahrungsdauer gespeichert.');
}
async function runPurge() {
  const { data, error } = await sb.rpc('purge_trash');
  if (error) return { error };
  return { data };
}
async function purgeTrashNow() {
  const { data, error } = await runPurge();
  if (error) { toast('Aufräumen fehlgeschlagen: ' + friendlyError(error), null, null, true); return; }
  await refresh();
  const n = (data.items || 0) + (data.lists || 0);
  toast(n ? `${data.items} Zutat${data.items === 1 ? '' : 'en'} und ${data.lists} Liste${data.lists === 1 ? '' : 'n'} endgültig gelöscht.` : `Nichts zu löschen (Frist: ${data.days} Tage).`);
}
// Admin: einmal täglich aufräumen und an die Sicherung erinnern (falls kein geplanter Job läuft)
async function adminDailyTasks() {
  if (!me || me.role !== 'admin') return;
  const today = new Date().toISOString().slice(0, 10);
  let stamp = null; try { stamp = localStorage.getItem('kombuese-daily'); } catch (e) { /* ignore */ }
  if (stamp === today) return;
  try { localStorage.setItem('kombuese-daily', today); } catch (e) { /* ignore */ }
  if (trashOk()) {
    const { data } = await runPurge();
    if (data && (data.items || data.lists)) await refresh();
  }
  if (db.settings && 'last_backup_at' in db.settings) {
    const d = daysAgo(db.settings.last_backup_at);
    if (d === null || d >= 14) toast(d === null ? 'Es gibt noch keine vollständige Sicherung aus der App.' : `Die letzte vollständige Sicherung ist ${d} Tage her.`, 'Jetzt sichern', () => openUserAdmin());
  }
}
async function downloadFullBackup() {
  if (!me || me.role !== 'admin') return;
  const btn = $('fullBackupBtn'); btn.disabled = true;
  const withImages = $('backupImages').checked;
  try {
    $('backupInfo').textContent = 'Sichere Tabellen …';
    const specs = [['profiles', ['created_at', 'id']], ['projects', ['created_at', 'id']], ['project_members', ['project_id', 'user_id']], ['lists', ['created_at', 'id']], ['items', ['created_at', 'id']],
      ['recipes', ['name']], ['recipe_items', ['name']], ['suppliers', ['name']], ['categories', ['sort_order', 'name']]];
    const full = {}, missing = [];
    for (const [t, cols] of specs) {
      try { full[t] = await fetchAll(t, cols); } catch (e) { missing.push(t); }
    }
    if (missing.includes('profiles') || missing.includes('projects') || missing.includes('items') || missing.includes('lists')) throw new Error('Tabelle(n) nicht lesbar: ' + missing.join(', '));
    full.app_settings = db.settings;
    const images = {};
    let imageFailed = 0;
    if (withImages) {
      const refs = new Set();
      (full.recipes || []).forEach(r => { if (isStorageRef(r.image)) refs.add(r.image); });
      (full.profiles || []).forEach(p => { if (isStorageRef(p.avatar)) refs.add(p.avatar); });
      let i = 0;
      for (const ref of refs) {
        $('backupInfo').textContent = `Sichere Bild ${++i} von ${refs.size} …`;
        try {
          const url = imgSrc(ref);
          const blob = await (await fetch(url)).blob();
          images[ref] = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
        } catch (e) { imageFailed++; }
      }
    }
    const payload = Object.assign(buildExportPayload(), {
      app: 'kombuese', kind: 'full-backup', schema: 1, full, images,
      note: 'Zurückspielen: Admin → „Sicherung wiederherstellen“. Alternativ legt „Daten importieren“ projects/lists/items als neue Projekte an. „full“ enthält alle Rohdaten, „images“ die Bilder (Schlüssel = Verweis aus recipes.image / profiles.avatar).'
    });
    downloadBlob(`kombuese-sicherung-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    if (db.settings && 'last_backup_at' in db.settings) {
      const now = new Date().toISOString();
      const { error } = await sb.from('app_settings').update({ last_backup_at: now }).eq('id', 'main');
      if (!error) db.settings.last_backup_at = now;
    }
    toast(imageFailed ? `Sicherung erstellt, ${imageFailed} Bild${imageFailed === 1 ? '' : 'er'} konnten nicht geladen werden.` : 'Vollständige Sicherung erstellt.', null, null, imageFailed > 0);
  } catch (e) {
    toast('Sicherung fehlgeschlagen: ' + friendlyError(e), null, null, true);
  }
  btn.disabled = false;
  renderTrashAdmin();
}
function renderImageAdmin() {
  if (imageMigrating) return;
  const n = legacyImageJobs().length;
  $('imgMigrateInfo').textContent = n ? `${n} Bild${n === 1 ? '' : 'er'} liegen noch in der Datenbank.` : 'Alle Bilder liegen im Storage.';
  $('imgMigrateBtn').disabled = !n;
}
async function migrateImages() {
  if (imageMigrating || me.role !== 'admin') return;
  const jobs = legacyImageJobs();
  if (!jobs.length) return;
  imageMigrating = true; $('imgMigrateBtn').disabled = true;
  let ok = 0, failed = 0, setupProblem = false;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    $('imgMigrateInfo').textContent = `Verschiebe Bild ${i + 1} von ${jobs.length} …`;
    const ref = await uploadImage(j.value, j.folder, j.id);
    if (!ref || !imageUrlCache.has(ref)) { // Upload oder Abruf nicht bestätigt: Original bleibt unverändert
      if (ref) removeStoredImage(ref);
      failed++;
      if (i === 0 && !ref) { setupProblem = true; break; }
      continue;
    }
    const { data, error } = await sb.from(j.table).update({ [j.col]: ref }).eq('id', j.id).select('id');
    if (error || !data || !data.length) { removeStoredImage(ref); failed++; continue; }
    ok++;
  }
  imageMigrating = false;
  await refresh();
  renderImageAdmin();
  if (setupProblem) toast('Der Speicher „images“ ist noch nicht eingerichtet. Bitte supabase-etappe5.sql im SQL Editor ausführen.', null, null, true);
  else toast(`${ok} Bild${ok === 1 ? '' : 'er'} verschoben${failed ? `, ${failed} nicht (bleiben unverändert)` : ''}.`, null, null, failed > 0);
}
async function saveSessionDefaults() {
  await mutate(sb.from('app_settings').update({ session_days_pwa: Number($('sessPwa').value), session_days_browser: Number($('sessBrowser').value), updated_by: me.id, updated_at: new Date().toISOString() }).eq('id', 'main'));
  toast('Sitzungsdauer gespeichert.');
}
async function saveVersion() {
  const v = $('versionInput').value.trim();
  if (!v) return;
  await mutate(sb.from('app_settings').update({ version: v, updated_by: me.id, updated_at: new Date().toISOString() }).eq('id', 'main'));
  toast('Version aktualisiert.');
}
function renderAllProjectsList() {
  const box = $('allProjectsList');
  if (!db.projects.length) { box.innerHTML = `<div style="color:var(--ink-faint); font-size:13.5px;">Noch keine Projekte.</div>`; return; }
  box.innerHTML = visibleProjects().map(p => {
    const mc = db.members.filter(m => m.project_id === p.id).length;
    const lc = activeLists(p.id).length;
    return `<div class="member-row">
      <span>${escapeHtml(p.name)} <span class="meta">— ${mc} Mitglied${mc === 1 ? '' : 'er'}, ${lc} Liste${lc === 1 ? '' : 'n'}</span></span>
      <button class="icon-btn del" onclick="deleteProjectGlobal('${p.id}')">Löschen</button>
    </div>`;
  }).join('');
}
function deleteProjectGlobal(id) {
  const p = findProject(id); if (!p) return;
  openConfirm(`Projekt „${p.name}“ inklusive aller Listen und Zutaten unwiderruflich löschen?`, () => mutate(sb.from('projects').delete().eq('id', id)));
}

/* ---------- Sichern / Übernehmen ---------- */
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function buildExportPayload() {
  const payload = {
    exportedAt: new Date().toISOString(),
    projects: db.projects.map(p => ({ id: p.id, name: p.name, description: p.description, persons: p.persons ?? null, features: p.features ?? {}, start_date: p.start_date ?? null, remind_days: p.remind_days ?? null })),
    lists: db.lists.filter(l => !l.deleted_at).map(l => ({ id: l.id, project_id: l.project_id, name: l.name, note: l.note, sort_order: l.sort_order, base_servings: l.base_servings ?? null, servings: l.servings ?? null })),
    items: db.items.filter(i => !i.deleted_at).map(i => ({ list_id: i.list_id, project_id: i.project_id, name: i.name, qty: i.qty, unit: i.unit, supplier: i.supplier, category: i.category, note: i.note }))
  };
  return payload;
}
function exportData() {
  const payload = buildExportPayload();
  downloadBlob(`kuechenplaner-daten-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
}
function importData(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); } catch (e) { toast('Das ist keine gültige Datendatei.', null, null, true); return; }
    if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.lists) || !Array.isArray(parsed.items)) {
      toast('Die Datei enthält keine erkennbaren Küchenplaner-Daten.', null, null, true); return;
    }
    openConfirm(`${parsed.projects.length} Projekt(e), ${parsed.lists.length} Liste(n) und ${parsed.items.length} Zutat(en) als neue Projekte anlegen?`,
      () => runImport(parsed), 'Importieren');
  };
  reader.readAsText(file);
}
async function runImport(parsed) {
  const projMap = new Map(), listMap = new Map();
  for (const p of parsed.projects) {
    const id = uuid(); projMap.set(p.id, id);
    const row = { id, name: String(p.name || 'Import'), description: String(p.description || ''), created_by: me.id };
    const persons = Math.round(Number(p.persons));
    if (portionsOk() && persons >= 1 && persons <= 100000) row.persons = persons;
    if (featuresOk() && p.features && typeof p.features === 'object') {
      const feats = {};
      ['categories', 'recipes', 'bulk'].forEach(k => { if (p.features[k] === false) feats[k] = false; });
      if (Object.keys(feats).length) row.features = feats;
    }
    if (startOk() && /^\d{4}-\d{2}-\d{2}$/.test(String(p.start_date || ''))) row.start_date = p.start_date;
    const rd = Math.round(Number(p.remind_days));
    if (startOk() && p.remind_days !== null && p.remind_days !== undefined && rd >= 0 && rd <= 90) row.remind_days = rd;
    const { error } = await sb.from('projects').insert(row);
    if (error) { toast('Import abgebrochen: ' + friendlyError(error), null, null, true); await refresh(); return; }
  }
  const listRows = [];
  parsed.lists.forEach(l => {
    const oldPid = l.project_id ?? l.projectId;
    if (!projMap.has(oldPid)) return;
    const id = uuid(); listMap.set(l.id, id);
    const row = { id, project_id: projMap.get(oldPid), name: String(l.name || 'Liste'), note: String(l.note || ''), sort_order: Math.round(Number(l.sort_order)) || 0 };
    ['base_servings', 'servings'].forEach(k => { const n = Math.round(Number(l[k])); if (portionsOk() && n >= 1 && n <= 100000) row[k] = n; });
    listRows.push(row);
  });
  if (listRows.length) {
    const { error } = await sb.from('lists').insert(listRows);
    if (error) { toast('Import abgebrochen: ' + friendlyError(error), null, null, true); await refresh(); return; }
  }
  const listToProject = new Map(listRows.map(r => [r.id, r.project_id]));
  const itemRows = [];
  parsed.items.forEach(i => {
    const nl = listMap.get(i.list_id ?? i.listId);
    if (!nl) return;
    const qty = Math.max(0, Number(i.qty) || 0);
    itemRows.push({ project_id: listToProject.get(nl), list_id: nl, name: String(i.name || ''), qty, unit: String(i.unit || ''), supplier: String(i.supplier || ''), category: String(i.category || ''), note: String(i.note || '') });
  });
  for (let k = 0; k < itemRows.length; k += 200) {
    const { error } = await sb.from('items').insert(itemRows.slice(k, k + 200));
    if (error) { toast('Import teilweise fehlgeschlagen: ' + friendlyError(error), null, null, true); break; }
  }
  await refresh();
  toast('Import abgeschlossen. Mitglieder bitte neu zuordnen.');
}

