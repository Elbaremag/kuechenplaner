// ===== render.js: DARSTELLUNG: Seitenleiste, Hauptbereich, Tabs (Listen, Gesamtliste, Einkaufslisten, Papierkorb, Mitglieder).
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= RENDER: RAHMEN ================= */
function visibleProjects() { return [...db.projects].sort((a, b) => a.name.localeCompare(b.name, 'de')); }
function ensureProject() {
  const ps = visibleProjects();
  if (!ps.find(p => p.id === ui.projectId)) { ui.projectId = ps[0] ? ps[0].id : null; ui.tab = 'lists'; saveUi(); }
}
function renderApp() {
  if (!me) return;
  $('curUserName').textContent = me.name || me.username || me.email || '';
  const rb = $('curUserRole'); rb.textContent = roleLabel(me.role); rb.className = 'role-badge ' + me.role;
  $('curUserRoleDesc').textContent = roleDescription(me.role);
  $('curUserAvatar').outerHTML = avatarHtml(me).replace('class="avatar', 'id="curUserAvatar" class="avatar');
  $('adminBtn').style.display = me.role === 'admin' ? 'inline-flex' : 'none';
  const v = db.settings && db.settings.version ? db.settings.version : '';
  $('versionLine').innerHTML = v ? `Kombüse v${escapeHtml(v)}` : '';
  ensureProject();
  renderCategoryDatalist();
  renderSidebar();
  renderMain();
  refreshDialogs();
}
function refreshDialogs() {
  if ($('userAdminDialog').open) { renderUserAdminList(); renderAllProjectsList(); renderSupplierAdminList(); renderCategoryAdminList(); renderRoleLegend(); $('versionInput').value = (db.settings && db.settings.version) || ''; renderSessionAdmin(); }
}

function renderSidebar() {
  const list = $('projectList');
  const projects = visibleProjects();
  list.innerHTML = projects.length
    ? projects.map(p => `<button class="project-item ${ui.view === 'project' && p.id === ui.projectId ? 'active' : ''}" onclick="selectProject('${p.id}')">${escapeHtml(p.name)}${reminderDays(p) !== null ? `<span class="proj-badge" title="Projektstart">${escapeHtml(whenText(reminderDays(p)))}</span>` : ''}</button>`).join('')
    : `<div style="font-size:13px; color:var(--ink-faint); padding:6px 10px;">Noch keine Projekte.</div>`;
  $('newProjectSlot').innerHTML = canCreateProject()
    ? `<button class="btn secondary small" style="width:100%; margin-top:8px;" onclick="promptNewProject()">+ Neues Projekt</button>`
    : '';
  $('recipesNavBtn').classList.toggle('active', ui.view === 'recipes');
  const showLibrary = recipesAvailable();
  $('recipesNavBtn').style.display = showLibrary ? '' : 'none';
  $('recipesNavBtn').previousElementSibling.style.display = showLibrary ? '' : 'none';
}
function selectProject(id) { ui.view = 'project'; ui.projectId = id; ui.tab = 'lists'; saveUi(); renderSidebar(); renderMain(); closeMobileNav(); }
function openRecipesView() { ui.view = 'recipes'; saveUi(); renderSidebar(); renderMain(); closeMobileNav(); }
function setTab(t) { ui.tab = t; saveUi(); renderMain(); }

function toggleMobileNav() { $('sidebar').classList.toggle('mobile-open'); $('sidebarBackdrop').classList.toggle('active'); }
function closeMobileNav() { $('sidebar').classList.remove('mobile-open'); $('sidebarBackdrop').classList.remove('active'); }

/* ================= RENDER: HAUPTBEREICH ================= */
let pendingFocusListId = null;

function renderMain() {
  if (ui.view === 'recipes' && !recipesAvailable()) { ui.view = 'project'; saveUi(); renderSidebar(); }
  if (ui.view === 'recipes') { renderRecipesView(); return; }
  const main = $('main');
  const project = findProject(ui.projectId);
  if (!project) {
    main.innerHTML = `<div class="empty-state"><h3>Noch kein Projekt vorhanden</h3><p>${canCreateProject() ? 'Lege links ein neues Projekt an.' : 'Bitte einen Projektleiter oder Admin, dich zu einem Projekt hinzuzufügen.'}</p></div>`;
    return;
  }
  const editable = canEdit(project);
  const admin = isProjectAdmin(project);
  if (ui.tab === 'members' && !admin) ui.tab = 'lists';
  if (ui.tab === 'trash' && !editable) ui.tab = 'lists';
  const tab = ui.tab;
  const trashCount = editable
    ? db.lists.filter(l => l.project_id === project.id && l.deleted_at).length + trashedItems(project.id).length
    : 0;

  main.innerHTML = `
    <div class="topbar">
      <div>
        <h1>${escapeHtml(project.name)} ${admin ? `<button class="icon-btn no-print" style="font-size:15px; vertical-align:middle;" onclick="openEditProject('${project.id}')" title="Projekt bearbeiten">✎</button>` : ''}</h1>
        ${project.description ? `<div class="desc">${escapeHtml(project.description)}</div>` : ''}
        ${project.start_date ? `<div class="start-meta">Start: ${escapeHtml(fmtStart(project))}${daysUntilStart(project) >= 0 ? ' · ' + escapeHtml(whenText(daysUntilStart(project))) : ' · bereits gestartet'}</div>` : ''}
      </div>
      <div class="no-print"><button class="btn secondary" onclick="exportDialog.showModal()">Export &amp; Druck</button></div>
    </div>
    ${reminderDays(project) !== null ? `<div class="reminder-card no-print">⏰ Erinnerung: Das Projekt startet ${escapeHtml(whenText(reminderDays(project)))} (${escapeHtml(fmtStart(project))}).</div>` : ''}
    <div class="tabs no-print">
      <button class="tab ${tab === 'lists' ? 'active' : ''}" onclick="setTab('lists')">Listen</button>
      <button class="tab ${tab === 'aggregate' ? 'active' : ''}" onclick="setTab('aggregate')">Gesamtliste</button>
      <button class="tab ${tab === 'suppliers' ? 'active' : ''}" onclick="setTab('suppliers')">Einkaufslisten</button>
      ${admin ? `<button class="tab ${tab === 'members' ? 'active' : ''}" onclick="setTab('members')">Mitglieder</button>` : ''}
      ${editable ? `<button class="tab ${tab === 'trash' ? 'active' : ''}" onclick="setTab('trash')">Papierkorb${trashCount ? ' (' + trashCount + ')' : ''}</button>` : ''}
    </div>
    <div id="tabContent"></div>
  `;

  if (tab === 'lists') renderListsTab(project, editable);
  else if (tab === 'aggregate') renderAggregateTab(project, editable);
  else if (tab === 'suppliers') renderSuppliersTab(project, editable);
  else if (tab === 'members') renderMembersTab(project);
  else if (tab === 'trash') renderTrashTab(project);

  if (pendingFocusListId) {
    const f = document.querySelector(`form[data-list="${pendingFocusListId}"] input[name="name"]`);
    if (f) f.focus();
    pendingFocusListId = null;
  }
}

function setSearch(v) {
  ui.search = v; saveUi();
  renderMain();
  const el = document.querySelector('#tabContent input[data-role="search"]');
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}
let collapsedLists = new Set();
let selectedItemIds = new Set();
function toggleListCollapse(id) {
  if (collapsedLists.has(id)) collapsedLists.delete(id); else collapsedLists.add(id);
  renderMain();
}
function toggleItemSelect(id, checked) {
  if (checked) selectedItemIds.add(id); else selectedItemIds.delete(id);
  renderMain();
}
function clearSelection() { selectedItemIds.clear(); renderMain(); }

function onListDragStart(ev, id) { ev.dataTransfer.setData('text/plain', id); ev.dataTransfer.effectAllowed = 'move'; ev.target.closest('.panel').classList.add('dragging'); }
function onListDragEnd(ev) { ev.target.closest('.panel') && ev.target.closest('.panel').classList.remove('dragging'); }
function onListDragOver(ev) { ev.preventDefault(); }
async function onListDrop(ev, targetId) {
  ev.preventDefault();
  const draggedId = ev.dataTransfer.getData('text/plain');
  document.querySelectorAll('.panel.dragging').forEach(p => p.classList.remove('dragging'));
  if (!draggedId || draggedId === targetId) return;
  const project = findProject(ui.projectId);
  const ids = activeLists(project.id).map(l => l.id);
  const from = ids.indexOf(draggedId), to = ids.indexOf(targetId);
  if (from === -1 || to === -1) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  await persistListOrder(project.id, ids, draggedId);
}
async function sortListsByName(pid) {
  const lists = [...activeLists(pid)].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  await persistListOrder(pid, lists.map(l => l.id), null);
}
// Speichert die Reihenfolge dauerhaft (Spalte lists.sort_order, pro Projekt).
// Schreibt nur Zeilen, deren Wert sich ändert; zeigt die neue Reihenfolge sofort an
// und lädt bei einem Fehler den gespeicherten Stand zurück.
let reorderBusy = false;
async function persistListOrder(pid, ids, focusId) {
  if (reorderBusy) return false;
  reorderBusy = true;
  try {
    const current = new Map(activeLists(pid).map(l => [l.id, l.sort_order]));
    const changed = ids.map((id, idx) => ({ id, order: idx * 10 })).filter(x => current.get(x.id) !== x.order);
    if (!changed.length) return true;
    changed.forEach(x => { const l = db.lists.find(l2 => l2.id === x.id); if (l) l.sort_order = x.order; });
    renderMain();
    if (focusId) scrollListIntoView(focusId);
    const results = await Promise.all(changed.map(x => sb.from('lists').update({ sort_order: x.order }).eq('id', x.id)));
    const failed = results.find(r => r.error);
    if (failed) toast('Reihenfolge konnte nicht gespeichert werden: ' + friendlyError(failed.error), null, null, true);
    await refresh();
    if (focusId) scrollListIntoView(focusId);
    return !failed;
  } finally {
    reorderBusy = false;
  }
}
function scrollListIntoView(id) {
  const el = document.querySelector(`.panel[data-list-id="${id}"]`);
  if (el) el.scrollIntoView({ block: 'nearest' });
}
// Pfeile: genau eine Position nach oben (-1) oder unten (+1)
async function moveList(id, dir) {
  const project = findProject(ui.projectId);
  if (!project) return;
  const ids = activeLists(project.id).map(l => l.id);
  const from = ids.indexOf(id), to = from + dir;
  if (from === -1 || to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  await persistListOrder(project.id, ids, id);
}

function renderListsTab(project, editable) {
  const q = normName(ui.search);
  let lists = activeLists(project.id);
  let html = '';
  const featCat = projectFeature(project, 'categories');
  const featBulk = editable && projectFeature(project, 'bulk');
  const showPortions = portionsOk();
  html += `
    <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; margin-bottom:18px;">
      <div class="field no-print" style="max-width:320px; margin-bottom:0; flex:1; min-width:200px;">
        <input type="text" data-role="search" placeholder="🔍 Zutat suchen …" value="${escapeHtml(ui.search)}" oninput="setSearch(this.value)">
      </div>
      ${editable && lists.length > 1 ? `<button class="btn secondary small no-print" onclick="sortListsByName('${project.id}')">A–Z sortieren</button>` : ''}
    </div>`;
  if (featBulk && selectedItemIds.size) {
    html += `
    <div class="bulk-bar no-print">
      <span>${selectedItemIds.size} Zutat${selectedItemIds.size === 1 ? '' : 'en'} ausgewählt</span>
      <select id="bulkSupplier">${supplierSelectOptions('')}</select>
      <button class="btn secondary small" onclick="bulkSetSupplier()">Einkaufsliste setzen</button>
      ${featCat ? `<select id="bulkCategory">${categorySelectOptions()}</select>
      <button class="btn secondary small" onclick="bulkSetCategory()">Kategorie setzen</button>` : ''}
      <input type="text" id="bulkNote" placeholder="Notiz" style="width:140px;">
      <button class="btn secondary small" onclick="bulkSetNote()">Notiz setzen</button>
      <button class="btn secondary small" onclick="clearSelection()">Auswahl aufheben</button>
    </div>`;
  }
  if (!lists.length) {
    html += `<div class="empty-state"><h3>Noch keine Liste angelegt</h3><p>Lege eine Liste für ein Gericht oder eine Mahlzeit an, um Zutaten zu sammeln.</p></div>`;
  }
  let anyMatch = !q;
  lists.forEach((list, listIdx) => {
    const allItems = itemsOfList(list.id);
    const items = q ? allItems.filter(i => normName(i.name).includes(q)) : allItems;
    if (q && !items.length) return;
    if (q) anyMatch = true;
    const creator = list.created_by ? profileName(list.created_by) : '';
    const collapsed = collapsedLists.has(list.id) && !q;
    html += `
      <div class="panel" data-list-id="${list.id}" ondragover="onListDragOver(event)" ondrop="onListDrop(event, '${list.id}')">
        <div class="panel-head">
          <div style="display:flex; align-items:center; gap:6px; min-width:0;">
            ${editable ? `<span class="drag-handle no-print" draggable="true" ondragstart="onListDragStart(event, '${list.id}')" ondragend="onListDragEnd(event)" title="Ziehen zum Sortieren">⠿</span>` : ''}
            ${editable && !q && lists.length > 1 ? `<span class="move-btns no-print">
              <button class="move-btn" onclick="moveList('${list.id}', -1)" ${listIdx === 0 ? 'disabled' : ''} aria-label="Liste nach oben" title="Nach oben">▲</button>
              <button class="move-btn" onclick="moveList('${list.id}', 1)" ${listIdx === lists.length - 1 ? 'disabled' : ''} aria-label="Liste nach unten" title="Nach unten">▼</button>
            </span>` : ''}
            <button class="chevron-btn no-print ${collapsed ? '' : 'open'}" onclick="toggleListCollapse('${list.id}')" title="${collapsed ? 'Aufklappen' : 'Einklappen'}">▶</button>
            <div style="min-width:0;">
              <h3 ${creator ? `title="angelegt von ${escapeHtml(creator)}"` : ''}>${escapeHtml(list.name)}</h3>
              <div class="meta">${items.length}${q && items.length !== allItems.length ? ' von ' + allItems.length : ''} Zutat${items.length === 1 ? '' : 'en'}${list.note ? ' · ' + escapeHtml(list.note) : ''}${creator ? ' · von ' + escapeHtml(creator) : ''}${scaleBadge(list)}</div>
            </div>
          </div>
          ${editable ? `<div class="no-print" style="white-space:nowrap;">
            ${showPortions ? `<button class="icon-btn" onclick="openEditList('${list.id}', true)" title="Portionsrechner" aria-label="Portionsrechner">👥</button>` : ''}
            <button class="icon-btn" onclick="openEditList('${list.id}')" title="Liste bearbeiten">✎</button>
            <button class="icon-btn" onclick="openCopyList('${list.id}')" title="Liste kopieren">⧉</button>
            <button class="icon-btn del" onclick="deleteList('${list.id}')" title="Liste löschen">✕</button>
          </div>` : ''}
        </div>
        ${collapsed ? '' : `
        <div class="panel-body">
          ${scaleNote(list)}
          ${items.length ? `
          <div class="overflow-wrap">
          <table class="item-table">
            <thead><tr>${featBulk ? '<th style="width:30px;"></th>' : ''}<th>Bezeichnung</th><th class="num">Anzahl</th><th>Einheit</th><th class="num">Gesamtmenge</th>${featCat ? '<th>Kategorie</th>' : ''}<th>Einkaufsliste</th>${editable ? '<th></th>' : ''}</tr></thead>
            <tbody>
              ${items.map(i => {
                const who = i.created_by ? profileName(i.created_by) : '';
                const tip = i.note ? `Notiz: ${i.note}` : '';
                return `
                <tr class="${selectedItemIds.has(i.id) ? 'selected' : ''}">
                  ${featBulk ? `<td class="no-print"><input type="checkbox" ${selectedItemIds.has(i.id) ? 'checked' : ''} onchange="toggleItemSelect('${i.id}', this.checked)" aria-label="auswählen"></td>` : ''}
                  <td${tip ? ` title="${escapeHtml(tip)}"` : ''}>${escapeHtml(i.name)}${i.note ? ' 📝' : ''}${who ? `<div class="added-by">von ${escapeHtml(who)}</div>` : ''}</td>
                  <td class="num" data-l="Anzahl">${fmtNum(Number(i.qty))}</td>
                  <td data-l="Einheit">${escapeHtml(i.unit || '')}</td>
                  <td class="num" data-l="Gesamt">${escapeHtml(formatAmount(effQty(i), i.unit))}</td>
                  ${featCat ? `<td data-l="Kategorie">${escapeHtml(i.category || '')}</td>` : ''}
                  <td data-l="Einkaufsliste">${escapeHtml(i.supplier || '')}</td>
                  ${editable ? `<td class="no-print" style="white-space:nowrap;"><button class="icon-btn" onclick="openEditItem('${i.id}')" title="Zutat bearbeiten">✎</button><button class="icon-btn del" onclick="deleteItem('${i.id}')" title="Zutat löschen">✕</button></td>` : ''}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          </div>` : `<div style="color:var(--ink-faint); font-size:13.5px;">${q ? 'Keine Treffer.' : 'Noch keine Zutaten.'}</div>`}

          ${editable && !q ? `
          <form class="add-row-form no-print" data-list="${list.id}" onsubmit="return addItem(event, '${list.id}')">
            <div class="field f-name">
              <label>Bezeichnung</label>
              <input type="text" required autocomplete="off" name="name" oninput="handleSuggest(this, '${project.id}', 'name')">
              <div class="suggest-slot"></div>
            </div>
            <div class="field f-qty"><label>Anzahl</label><input type="number" step="any" min="0" required name="qty" inputmode="decimal"></div>
            <div class="field f-unit"><label>Einheit</label><input type="text" list="unitOptions" placeholder="g, kg, Stk …" name="unit"></div>
            ${featCat ? `<div class="field f-unit"><label>Kategorie</label><input type="text" list="categoryOptions" name="category"></div>` : ''}
            <div class="field f-supplier">
              <label>Einkaufsliste</label>
              <select name="supplier" onchange="handleSupplierSelect(this)">${supplierSelectOptions('')}</select>
            </div>
            <div class="field f-supplier"><label>Notiz</label><input type="text" name="note" placeholder="optional"></div>
            <button class="btn small" type="submit">Hinzufügen</button>
          </form>` : ''}
        </div>`}
      </div>`;
  });
  if (q && !anyMatch) html += `<div class="empty-state"><h3>Keine Treffer</h3><p>Keine Zutat passt zu „${escapeHtml(ui.search)}“.</p></div>`;
  if (editable && !q) {
    html += `
      <form class="add-row-form no-print" onsubmit="return addList(event, '${project.id}')" style="margin-top:4px;">
        <div class="field f-name"><label>Neue Liste (Gericht/Mahlzeit)</label><input type="text" required name="listName" placeholder="z. B. Mittagessen Tag 2"></div>
        <button class="btn small" type="submit">Liste anlegen</button>
      </form>`;
  }
  $('tabContent').innerHTML = html;
}
// Ändert alle ausgewählten Zutaten mit einer einzigen Abfrage und prüft, dass wirklich alle betroffen waren
// (Zeilen ohne Schreibrecht würden von den Zugriffsregeln stillschweigend übersprungen).
async function bulkUpdate(patch, okMsg) {
  const ids = [...selectedItemIds];
  if (!ids.length) return;
  const { data, error } = await sb.from('items').update(patch).in('id', ids).select('id');
  if (error) { toast('Fehler: ' + friendlyError(error), null, null, true); return; }
  await refresh();
  const n = (data || []).length;
  if (n !== ids.length) { toast(`Nur ${n} von ${ids.length} Zutaten konnten geändert werden (fehlende Berechtigung).`, null, null, true); return; }
  clearSelection();
  toast(okMsg(n));
}
async function bulkSetSupplier() {
  const sel = $('bulkSupplier');
  if (sel.value === '__new__') return; // Inline-Neuanlage macht hier keinen Sinn, einfach erneut wählen
  const supplier = sel.value;
  await bulkUpdate({ supplier }, n => supplier ? `Einkaufsliste „${supplier}“ für ${n} Zutat(en) gesetzt.` : `Einkaufsliste für ${n} Zutat(en) entfernt.`);
}
async function bulkSetCategory() {
  const v = $('bulkCategory').value;
  if (!v) { toast('Bitte zuerst eine Kategorie wählen.', null, null, true); return; }
  const category = v === '__none__' ? '' : v;
  await bulkUpdate({ category }, n => category ? `Kategorie „${category}“ für ${n} Zutat(en) gesetzt.` : `Kategorie für ${n} Zutat(en) entfernt.`);
}
async function bulkSetNote() {
  const note = $('bulkNote').value.trim();
  await bulkUpdate({ note }, n => `Notiz für ${n} Zutat(en) gesetzt.`);
}

function renderAggregateTab(project, editable) {
  const lists = activeLists(project.id);
  const agg = aggregateProject(project.id);
  const canMerge = editable && agg.length > 1;
  const validKeys = new Set(agg.map(g => g.key));
  selectedAggKeys = new Set([...selectedAggKeys].filter(k => validKeys.has(k)));
  const nSel = selectedAggKeys.size;
  const mergeToolbar = canMerge ? `
    <div class="no-print" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
      ${nSel >= 2
        ? `<button class="btn small" onclick="openMerge()">Zeilen zusammenführen (${nSel})</button><button class="btn secondary small" onclick="clearAggSelection()">Auswahl aufheben</button>`
        : `<span class="meta" style="margin:0;">Zeilen ankreuzen, um gleiche Zutaten (z. B. „Tomate“ und „Tomaten“) zusammenzuführen.</span>`}
    </div>` : '';
  $('tabContent').innerHTML = `
    <div class="panel">
      <div class="panel-head"><div>
        <h3>Gesamtliste</h3>
        <div class="meta">Alle Zutaten aus allen Listen, zusammengerechnet (g/kg und ml/l werden umgerechnet). Kreuze zeigen, in welcher Mahlzeit eine Zutat vorkommt.</div>
      </div></div>
      <div class="panel-body">
        ${mergeToolbar}
        ${agg.length ? `
        <div class="overflow-wrap"><table>
          <thead><tr>
            ${canMerge ? '<th class="no-print" style="width:30px;"></th>' : ''}<th>Bezeichnung</th><th class="num">Gesamtmenge</th><th>Einkaufslisten</th>
            ${lists.map(l => `<th class="mark-head" title="${escapeHtml(l.name)}">${escapeHtml(l.name)}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${agg.map(g => `<tr class="${selectedAggKeys.has(g.key) ? 'selected' : ''}">
              ${canMerge ? `<td class="no-print"><input type="checkbox" data-key="${escapeHtml(g.key)}" ${selectedAggKeys.has(g.key) ? 'checked' : ''} onchange="toggleAggSelect(this.dataset.key, this.checked)" aria-label="Zeile auswählen"></td>` : ''}
              <td>${escapeHtml(g.name)}</td>
              <td class="num aggregate-total">${escapeHtml(formatGroupTotal(g))}</td>
              <td class="supplier-list">${[...g.suppliers].map(escapeHtml).join(', ') || '—'}</td>
              ${lists.map(l => `<td class="mark-col">${g.listIds.has(l.id) ? '✕' : ''}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table></div>` : `<div class="empty-state"><h3>Noch keine Zutaten</h3><p>Sobald Listen mit Zutaten gefüllt sind, erscheint hier die zusammengefasste Einkaufsliste.</p></div>`}
      </div>
    </div>`;
}

function renderSuppliersTab(project, editable) {
  const featCat = projectFeature(project, 'categories');
  const groups = aggregateBySupplier(project.id, featCat);
  const anyBought = groups.some(g => g.entries.some(e => e.bought));
  $('tabContent').innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Einkaufslisten</h3>
          <div class="meta">Alle Zutaten je Einkaufsliste. ${editable ? 'Beim Einkaufen einfach abhaken — alle sehen den Stand sofort.' : ''}</div>
        </div>
        ${editable && anyBought ? `<button class="btn secondary small no-print" onclick="resetBought('${project.id}')">Häkchen zurücksetzen</button>` : ''}
      </div>
      <div class="panel-body">
        ${groups.length ? groups.map(g => {
          const done = g.entries.filter(e => e.bought).length;
          let lastCat = null;
          return `
          <div style="margin-bottom:22px;">
            <div class="sup-title"><span class="name">${escapeHtml(g.supplier)}${supplierEditButton(g.supplier, editable)}</span><span class="progress">${done} / ${g.entries.length} gekauft</span></div>
            ${supplierNoteHtml(g.supplier)}
            <div class="overflow-wrap"><table>
              <thead><tr><th style="width:34px;"></th><th>Bezeichnung</th><th class="num">Gesamtmenge</th><th>Liste(n)</th></tr></thead>
              <tbody>
                ${g.entries.map(e => {
                  const cat = e.category || 'Ohne Kategorie';
                  const header = featCat && cat !== lastCat ? (lastCat = cat, `<tr><td colspan="4" style="background:var(--paper); font-size:11.5px; font-weight:600; color:var(--ink-soft); padding:6px 8px;">${escapeHtml(cat)}</td></tr>`) : '';
                  const noteTip = [...e.notes].join(' · ');
                  return header + `
                  <tr class="${e.bought ? 'done' : ''}">
                    <td><input type="checkbox" ${e.bought ? 'checked' : ''} ${editable ? '' : 'disabled'} onchange="toggleBought('${e.itemIds.join(',')}', this.checked)" aria-label="gekauft"></td>
                    <td${noteTip ? ` title="Notiz: ${escapeHtml(noteTip)}"` : ''}>${escapeHtml(e.name)}${noteTip ? ' 📝' : ''}</td>
                    <td class="num">${escapeHtml(formatGroupTotal(e))}</td>
                    <td class="supplier-list">${[...e.listNames].map(escapeHtml).join(', ')}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table></div>
          </div>`;
        }).join('') : `<div class="empty-state"><h3>Noch keine Zutaten</h3><p>Sobald Zutaten einer Einkaufsliste zugeordnet sind, erscheinen sie hier.</p></div>`}
      </div>
    </div>`;
}

function renderMembersTab(project) {
  const members = db.members.filter(m => m.project_id === project.id);
  const memberIds = new Set(members.map(m => m.user_id));
  const candidates = db.profiles.filter(p => p.role !== 'pending' && !memberIds.has(p.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
  $('tabContent').innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Mitglieder &amp; Rechte</h3></div>
      <div class="panel-body">
        ${members.map(m => `
          <div class="member-row">
            <span style="display:flex; align-items:center; gap:10px;">${avatarHtml(profileById(m.user_id), 'small')}${escapeHtml(profileName(m.user_id))}</span>
            <span style="display:flex; align-items:center; gap:8px;">
              <select onchange="setMemberRole('${project.id}', '${m.user_id}', this.value)">
                <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Betrachter</option>
                <option value="editor" ${m.role === 'editor' ? 'selected' : ''}>Bearbeiter</option>
                <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Projekt-Admin</option>
              </select>
              <button class="icon-btn del" onclick="removeMember('${project.id}', '${m.user_id}')" title="Entfernen">✕</button>
            </span>
          </div>`).join('') || `<div style="color:var(--ink-faint); font-size:13.5px;">Noch keine Mitglieder.</div>`}
        <div class="add-row-form" style="margin-top:16px;">
          <div class="field f-name"><label>Benutzer hinzufügen</label>
            <select id="addMemberSelect">${candidates.length ? candidates.map(u => `<option value="${u.id}">${escapeHtml(u.name || u.email)}</option>`).join('') : '<option value="">Alle Benutzer sind bereits Mitglied</option>'}</select>
          </div>
          <button class="btn small" onclick="addMember('${project.id}')">Hinzufügen</button>
        </div>
        <div class="meta" style="margin-top:12px;">Hinzufügen kann man nur Personen, die der Admin bereits im Programm angelegt und freigeschaltet hat.</div>
      </div>
    </div>`;
}

function trashedItems(pid) {
  const activeIds = new Set(activeLists(pid).map(l => l.id));
  return db.items.filter(i => i.project_id === pid && i.deleted_at && activeIds.has(i.list_id));
}
function trashLeft(deletedAt) {
  const left = Math.max(0, trashDays() - (daysAgo(deletedAt) || 0));
  return left === 0 ? 'wird heute gelöscht' : `noch ${left} Tag${left === 1 ? '' : 'e'}`;
}
function renderTrashTab(project) {
  const dl = db.lists.filter(l => l.project_id === project.id && l.deleted_at);
  const di = trashedItems(project.id);
  const listName = id => { const l = findList(id); return l ? l.name : ''; };
  $('tabContent').innerHTML = `
    <div class="panel">
      <div class="panel-head"><div><h3>Papierkorb</h3><div class="meta">Gelöschte Listen und Zutaten lassen sich hier wiederherstellen. Nach ${trashDays()} Tagen werden sie automatisch endgültig gelöscht.</div></div></div>
      <div class="panel-body">
        ${!dl.length && !di.length ? `<div style="color:var(--ink-faint); font-size:13.5px;">Der Papierkorb ist leer.</div>` : ''}
        ${dl.length ? `<div class="meta" style="margin-bottom:6px;">Listen</div>` + dl.map(l => `
          <div class="member-row">
            <span>${escapeHtml(l.name)} <span class="meta">— ${db.items.filter(i => i.list_id === l.id && !i.deleted_at).length} Zutaten · ${trashLeft(l.deleted_at)}</span></span>
            <span><button class="icon-btn" onclick="restoreList('${l.id}')">Wiederherstellen</button><button class="icon-btn del" onclick="purgeList('${l.id}')">Endgültig löschen</button></span>
          </div>`).join('') : ''}
        ${di.length ? `<div class="meta" style="margin:16px 0 6px;">Zutaten</div>` + di.map(i => `
          <div class="member-row">
            <span>${escapeHtml(i.name)} <span class="meta">— ${escapeHtml(formatAmount(i.qty, i.unit))} · aus „${escapeHtml(listName(i.list_id))}“ · ${trashLeft(i.deleted_at)}</span></span>
            <span><button class="icon-btn" onclick="restoreItem('${i.id}')">Wiederherstellen</button><button class="icon-btn del" onclick="purgeItem('${i.id}')">Endgültig löschen</button></span>
          </div>`).join('') : ''}
      </div>
    </div>`;
}

