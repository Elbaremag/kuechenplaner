// ===== actions.js: AKTIONEN: Projekte, Listen, Zutaten und Mitglieder anlegen/ändern/löschen.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= AKTIONEN: PROJEKTE ================= */
function promptNewProject() {
  if (!canCreateProject()) return;
  closeMobileNav();
  $('npName').value = ''; $('npDesc').value = '';
  newProjectDialog.showModal(); $('npName').focus();
}
async function createProject() {
  if (!canCreateProject()) { newProjectDialog.close(); return; }
  const name = $('npName').value.trim();
  if (!name) { $('npName').focus(); return; }
  const description = $('npDesc').value.trim();
  const id = uuid();
  newProjectDialog.close();
  const ok = await mutate(sb.from('projects').insert({ id, name, description, created_by: me.id }));
  if (ok) { ui.projectId = id; ui.tab = 'lists'; saveUi(); renderApp(); }
}
let editProjectTargetId = null;
function openEditProject(pid) {
  const p = findProject(pid);
  if (!p || !isProjectAdmin(p)) return;
  editProjectTargetId = pid;
  $('epName').value = p.name; $('epDesc').value = p.description || '';
  const fOk = featuresOk(), pOk = portionsOk();
  $('epPersons').value = p.persons || '';
  $('epPersons').disabled = !pOk;
  const sOk = startOk();
  $('epStart').value = p.start_date || ''; $('epRemind').value = sOk ? (p.remind_days ?? 7) : '';
  $('epStart').disabled = $('epRemind').disabled = !sOk;
  [['epFeatCategories', 'categories'], ['epFeatRecipes', 'recipes'], ['epFeatBulk', 'bulk']].forEach(([id, key]) => {
    $(id).checked = projectFeature(p, key);
    $(id).disabled = !fOk;
  });
  $('epMigrationHint').style.display = (fOk && pOk && sOk) ? 'none' : '';
  editProjectDialog.showModal(); $('epName').focus();
}
async function saveEditProject() {
  const p = findProject(editProjectTargetId);
  if (!p || !isProjectAdmin(p)) { editProjectDialog.close(); return; }
  const name = $('epName').value.trim();
  if (!name) { $('epName').focus(); return; }
  const description = $('epDesc').value.trim();
  const patch = { name, description };
  if (portionsOk()) {
    const raw = $('epPersons').value.trim();
    const persons = raw === '' ? null : parseInt(raw, 10);
    if (raw !== '' && !(persons >= 1 && persons <= 100000)) { toast('Die Personenzahl muss eine ganze Zahl zwischen 1 und 100000 sein.', null, null, true); $('epPersons').focus(); return; }
    if ((p.persons || null) !== persons) patch.persons = persons;
  }
  if (startOk()) {
    const start = $('epStart').value || null;
    const rawR = $('epRemind').value.trim();
    const remind = rawR === '' ? 7 : parseInt(rawR, 10);
    if (!(remind >= 0 && remind <= 90)) { toast('Die Erinnerung muss zwischen 0 und 90 Tagen liegen.', null, null, true); $('epRemind').focus(); return; }
    const startChanged = (p.start_date || null) !== start, remindChanged = Number(p.remind_days ?? 7) !== remind;
    if (startChanged) patch.start_date = start;
    if (remindChanged) patch.remind_days = remind;
    // geänderter Termin: die (optionale) E-Mail-Erinnerung darf erneut verschickt werden
    if ((startChanged || remindChanged) && 'reminder_sent_at' in p) patch.reminder_sent_at = null;
  }
  if (featuresOk()) {
    const feats = { categories: $('epFeatCategories').checked, recipes: $('epFeatRecipes').checked, bulk: $('epFeatBulk').checked };
    if (Object.keys(feats).some(k => projectFeature(p, k) !== feats[k])) patch.features = feats;
  }
  editProjectDialog.close();
  await mutate(sb.from('projects').update(patch).eq('id', p.id));
}

/* ================= AKTIONEN: LISTEN ================= */
function addList(ev, pid) {
  ev.preventDefault();
  const name = ev.target.elements['listName'].value.trim();
  if (!name) return false;
  mutate(sb.from('lists').insert({ project_id: pid, name }));
  return false;
}
let editListTargetId = null;
function openEditList(id, focusPortions) {
  const l = findList(id); const p = l && findProject(l.project_id);
  if (!l || !p || !canEdit(p)) return;
  editListTargetId = id;
  $('elName').value = l.name; $('elNote').value = l.note || '';
  const pOk = portionsOk();
  $('elBase').value = l.base_servings || ''; $('elServings').value = l.servings || '';
  $('elBase').disabled = $('elServings').disabled = !pOk;
  updatePortionInfo();
  editListDialog.showModal();
  (focusPortions && pOk ? $('elBase') : $('elName')).focus();
}
function updatePortionInfo() {
  const l = findList(editListTargetId);
  if (!l) return;
  const p = findProject(l.project_id);
  const info = $('elPortionInfo'), bake = $('elBake');
  if (!portionsOk()) {
    info.textContent = 'Der Portionsrechner ist noch nicht eingerichtet. Bitte einmal supabase-etappe3.sql im Supabase SQL Editor ausführen.';
    bake.style.display = 'none';
    return;
  }
  const base = parseInt($('elBase').value, 10) || 0;
  const typed = parseInt($('elServings').value, 10) || 0;
  if (!base) {
    info.textContent = 'Ohne „Mengen gelten für“ werden die Mengen dieser Liste nicht umgerechnet.';
    bake.style.display = 'none';
    return;
  }
  const target = typed || (p && p.persons) || base;
  const f = target / base;
  const fromProject = !typed && p && p.persons ? ' (Personenzahl des Projekts)' : '';
  info.textContent = f === 1
    ? `Keine Umrechnung: Die Mengen gelten für ${base} Portionen, benötigt werden ${target}${fromProject}.`
    : `Die Mengen gelten für ${base} Portionen und werden auf ${target}${fromProject} umgerechnet (${fmtFactor(f)}). Gespeichert bleiben die Ausgangsmengen.`;
  bake.style.display = f === 1 ? 'none' : '';
}
// Schreibt die umgerechneten Mengen dauerhaft in die Zutaten (ausdrücklich, mit Rückfrage; atomar in der Datenbank)
function bakeListScaling() {
  const l = findList(editListTargetId);
  if (!l) return;
  const p = findProject(l.project_id);
  const base = parseInt($('elBase').value, 10) || 0;
  const target = parseInt($('elServings').value, 10) || (p && p.persons) || base;
  if (!(base > 0) || !(target > 0) || base === target) { toast('Es gibt nichts umzurechnen.', null, null, true); return; }
  const f = target / base;
  editListDialog.close();
  openConfirm(`Alle Mengen in „${l.name}“ von ${base} auf ${target} Portionen (${fmtFactor(f)}) fest umrechnen? Die gespeicherten Mengen werden dabei überschrieben.`, async () => {
    const { data, error } = await sb.rpc('apply_list_scaling', { p_list_id: l.id, p_base: base, p_target: target });
    if (error) { toast('Umrechnen fehlgeschlagen: ' + friendlyError(error), null, null, true); return; }
    await refresh();
    toast(`${data} Zutat${data === 1 ? '' : 'en'} auf ${target} Portionen umgerechnet.`);
  }, 'Umrechnen');
}
async function saveEditList() {
  const l = findList(editListTargetId);
  if (!l) { editListDialog.close(); return; }
  const name = $('elName').value.trim();
  if (!name) { $('elName').focus(); return; }
  const note = $('elNote').value.trim();
  const patch = { name, note };
  if (portionsOk()) {
    const parse = id => { const raw = $(id).value.trim(); if (raw === '') return null; const n = parseInt(raw, 10); return n >= 1 && n <= 100000 ? n : undefined; };
    const base = parse('elBase'), servings = parse('elServings');
    if (base === undefined || servings === undefined) { toast('Portionen müssen ganze Zahlen zwischen 1 und 100000 sein.', null, null, true); return; }
    if ((l.base_servings || null) !== base) patch.base_servings = base;
    if ((l.servings || null) !== servings) patch.servings = servings;
  }
  editListDialog.close();
  await mutate(sb.from('lists').update(patch).eq('id', l.id));
}
async function deleteList(id) {
  const l = findList(id); if (!l) return;
  const ok = await mutate(sb.from('lists').update({ deleted_at: new Date().toISOString() }).eq('id', id));
  if (ok) toast(`Liste „${l.name}“ gelöscht`, 'Rückgängig', () => restoreList(id));
}
async function restoreList(id) {
  const ok = await mutate(sb.from('lists').update({ deleted_at: null }).eq('id', id));
  if (ok) toast('Liste wiederhergestellt');
}
function purgeList(id) {
  const l = findList(id); if (!l) return;
  openConfirm(`Liste „${l.name}“ mit allen Zutaten endgültig löschen? Das kann nicht rückgängig gemacht werden.`,
    () => mutate(sb.from('lists').delete().eq('id', id)), 'Endgültig löschen');
}

let copyListSourceId = null;
function openCopyList(id) {
  const l = findList(id); if (!l) return;
  copyListSourceId = id;
  $('clName').value = `${l.name} (Kopie)`;
  const targets = visibleProjects().filter(p => { const r = roleInProject(p); return r === 'admin' || r === 'editor'; });
  $('clProject').innerHTML = targets.map(p => `<option value="${p.id}" ${p.id === l.project_id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  copyListDialog.showModal(); $('clName').focus(); $('clName').select();
}
async function saveCopyList() {
  const src = findList(copyListSourceId); if (!src) { copyListDialog.close(); return; }
  const name = $('clName').value.trim();
  const pid = $('clProject').value;
  if (!name || !pid) { $('clName').focus(); return; }
  const rows = itemsOfList(src.id);
  copyListDialog.close();
  const newId = uuid();
  const listRow = { id: newId, project_id: pid, name };
  if (portionsOk()) {
    if (src.base_servings) listRow.base_servings = src.base_servings;
    if (src.servings) listRow.servings = src.servings;
  }
  const r1 = await sb.from('lists').insert(listRow);
  if (r1.error) { toast('Fehler: ' + friendlyError(r1.error), null, null, true); return; }
  if (rows.length) {
    const r2 = await sb.from('items').insert(rows.map(i => ({ project_id: pid, list_id: newId, name: i.name, qty: i.qty, unit: i.unit, supplier: i.supplier, category: i.category, note: i.note, bought: false })));
    if (r2.error) { toast('Liste kopiert, aber Zutaten nicht: ' + friendlyError(r2.error), null, null, true); }
  }
  await refresh();
  const target = findProject(pid);
  if (!r1.error) toast(pid === ui.projectId ? 'Liste kopiert' : `Kopiert nach „${target ? target.name : ''}“`);
}

/* ================= AKTIONEN: ZUTATEN ================= */
function addItem(ev, listId) {
  ev.preventDefault();
  const f = ev.target;
  const name = f.elements['name'].value.trim();
  const qty = parseFloat(f.elements['qty'].value);
  const list = findList(listId);
  if (!name || isNaN(qty) || !list) return false;
  if (qty < 0) { toast('Die Anzahl darf nicht negativ sein.', null, null, true); return false; }
  pendingFocusListId = listId;
  mutate(sb.from('items').insert({
    project_id: list.project_id, list_id: listId, name, qty,
    unit: f.elements['unit'].value.trim(), supplier: f.elements['supplier'].value.trim(),
    category: f.elements['category'] ? f.elements['category'].value.trim() : '', note: f.elements['note'].value.trim()
  }));
  return false;
}
let editItemTargetId = null;
function openEditItem(id) {
  const it = db.items.find(i => i.id === id);
  const p = it && findProject(it.project_id);
  if (!it || !p || !canEdit(p)) return;
  editItemTargetId = id;
  $('eiName').value = it.name; $('eiQty').value = it.qty; $('eiUnit').value = it.unit || '';
  $('eiSupplier').innerHTML = supplierSelectOptions(it.supplier || ''); $('eiSupplier').dataset.prev = it.supplier || '';
  $('eiCategory').value = it.category || ''; $('eiNote').value = it.note || '';
  $('eiCategory').closest('.field').style.display = projectFeature(p, 'categories') ? '' : 'none';
  editItemDialog.showModal(); $('eiName').focus();
}
async function saveEditItem() {
  const it = db.items.find(i => i.id === editItemTargetId);
  if (!it) { editItemDialog.close(); return; }
  const name = $('eiName').value.trim();
  const qty = parseFloat($('eiQty').value);
  if (!name) { $('eiName').focus(); return; }
  if (isNaN(qty) || qty < 0) { $('eiQty').focus(); toast('Die Anzahl muss eine Zahl von 0 oder größer sein.', null, null, true); return; }
  const patch = { name, qty, unit: $('eiUnit').value.trim(), supplier: $('eiSupplier').value.trim(), category: $('eiCategory').value.trim(), note: $('eiNote').value.trim() };
  editItemDialog.close();
  await mutate(sb.from('items').update(patch).eq('id', it.id));
}
async function deleteItem(id) {
  const it = db.items.find(i => i.id === id); if (!it) return;
  const ok = await mutate(sb.from('items').update({ deleted_at: new Date().toISOString() }).eq('id', id));
  if (ok) toast(`„${it.name}“ gelöscht`, 'Rückgängig', () => restoreItem(id));
}
async function restoreItem(id) {
  const ok = await mutate(sb.from('items').update({ deleted_at: null }).eq('id', id));
  if (ok) toast('Zutat wiederhergestellt');
}
function purgeItem(id) {
  const it = db.items.find(i => i.id === id); if (!it) return;
  openConfirm(`„${it.name}“ endgültig löschen?`, () => mutate(sb.from('items').delete().eq('id', id)), 'Endgültig löschen');
}

// „Gekauft"-Häkchen: sofort sichtbar (optimistisch), dann speichern
async function toggleBought(idsCsv, checked) {
  const ids = idsCsv.split(',');
  db.items.forEach(i => { if (ids.includes(i.id)) i.bought = checked; });
  renderMain();
  const { error } = await sb.from('items').update({ bought: checked }).in('id', ids);
  if (error) { toast('Fehler: ' + friendlyError(error), null, null, true); await refresh(); }
}
async function resetBought(pid) {
  await mutate(sb.from('items').update({ bought: false }).eq('project_id', pid).eq('bought', true));
}

/* ================= AKTIONEN: MITGLIEDER ================= */
async function addMember(pid) {
  const uid = $('addMemberSelect').value;
  if (!uid) return;
  await mutate(sb.from('project_members').insert({ project_id: pid, user_id: uid, role: 'viewer' }));
}
async function setMemberRole(pid, uid, role) {
  await mutate(sb.from('project_members').update({ role }).eq('project_id', pid).eq('user_id', uid));
}
function removeMember(pid, uid) {
  const doIt = () => mutate(sb.from('project_members').delete().eq('project_id', pid).eq('user_id', uid));
  if (uid === me.id && me.role !== 'admin') openConfirm('Dich selbst aus diesem Projekt entfernen? Du verlierst damit den Zugriff.', doIt, 'Entfernen');
  else doIt();
}

