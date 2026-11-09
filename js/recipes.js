// ===== recipes.js: REZEPTBIBLIOTHEK: Rezepte anzeigen, bearbeiten, in Projekte übernehmen, Rezeptbilder.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= REZEPTBIBLIOTHEK ================= */
function canManageRecipes() { return !!me && ['admin', 'lead', 'editor'].includes(me.role); }
let expandedRecipes = new Set();
function toggleRecipeExpand(id) {
  if (expandedRecipes.has(id)) expandedRecipes.delete(id); else expandedRecipes.add(id);
  renderRecipesView();
}
function setRecipeSearch(v) {
  ui.recipeSearch = v; saveUi();
  renderRecipesView();
  const el = document.querySelector('[data-role="recipe-search"]');
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}
function renderRecipesView() {
  const q = normName(ui.recipeSearch || '');
  const all = [...db.recipes].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const recipes = q ? all.filter(r => normName(r.name).includes(q) || db.recipeItems.some(i => i.recipe_id === r.id && normName(i.name).includes(q))) : all;
  const canManage = canManageRecipes();
  $('main').innerHTML = `
    <div class="topbar">
      <div><h1>Rezeptbibliothek</h1><div class="desc">Projektübergreifend — für alle sichtbar, kann in jede Liste übernommen werden.</div></div>
      ${canManage ? `<button class="btn" onclick="openRecipeDialog(null)">+ Neues Rezept</button>` : ''}
    </div>
    <div class="field no-print" style="max-width:320px; margin-bottom:18px;">
      <input type="text" data-role="recipe-search" placeholder="🔍 Rezept oder Zutat suchen …" value="${escapeHtml(ui.recipeSearch || '')}" oninput="setRecipeSearch(this.value)">
    </div>
    ${recipes.length ? recipes.map(r => {
      const items = db.recipeItems.filter(x => x.recipe_id === r.id).sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, 'de'));
      const who = r.created_by ? profileName(r.created_by) : '';
      const open = expandedRecipes.has(r.id);
      const tagLine = [r.recipe_category, r.servings ? `${r.servings} Portion${r.servings === 1 ? '' : 'en'}` : ''].filter(Boolean).join(' · ');
      return `
      <div class="panel">
        <div class="panel-head" style="cursor:pointer;" onclick="toggleRecipeExpand('${r.id}')">
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            <button class="chevron-btn no-print ${open ? 'open' : ''}" onclick="event.stopPropagation(); toggleRecipeExpand('${r.id}')">▶</button>
            ${imgSrc(r.image) ? `<img src="${imgSrc(r.image)}" style="width:40px; height:40px; border-radius:8px; object-fit:cover; flex-shrink:0;">` : ''}
            <div style="min-width:0;">
              <h3 ${who ? `title="angelegt von ${escapeHtml(who)}"` : ''}>${escapeHtml(r.name)}</h3>
              <div class="meta">${items.length} Zutat${items.length === 1 ? '' : 'en'}${tagLine ? ' · ' + escapeHtml(tagLine) : ''}${r.note ? ' · ' + escapeHtml(r.note) : ''}</div>
            </div>
          </div>
          <div class="no-print" style="white-space:nowrap;" onclick="event.stopPropagation()">
            ${recipeTargets().length ? `<button class="btn secondary small" onclick="openAddRecipeToProject('${r.id}')">In Projekt übernehmen</button>` : ''}
            <button class="icon-btn" onclick="printRecipe('${r.id}')" title="Drucken / als PDF">🖨</button>
            ${canManage ? `<button class="icon-btn" onclick="openRecipeDialog('${r.id}')" title="Bearbeiten">✎</button><button class="icon-btn del" onclick="deleteRecipe('${r.id}')" title="Löschen">✕</button>` : ''}
          </div>
        </div>
        ${open ? `<div class="panel-body">
          ${imgSrc(r.image) ? `<img src="${imgSrc(r.image)}" style="max-width:100%; max-height:260px; border-radius:var(--radius-sm); margin-bottom:14px; display:block;">` : ''}
          ${items.length ? `<div class="overflow-wrap"><table>
            <thead><tr><th>Bezeichnung</th><th class="num">Menge</th><th>Kategorie</th></tr></thead>
            <tbody>${items.map(i => `<tr><td>${escapeHtml(i.name)}</td><td class="num">${escapeHtml(formatAmount(i.qty, i.unit))}</td><td>${escapeHtml(i.category || '')}</td></tr>`).join('')}</tbody>
          </table></div>` : `<div class="meta">Keine Zutaten hinterlegt.</div>`}
          ${r.instructions ? `<div class="meta" style="margin:16px 0 4px;">Anleitung</div><div style="white-space:pre-wrap; font-size:14px;">${escapeHtml(r.instructions)}</div>` : ''}
        </div>` : ''}
      </div>`;
    }).join('') : `<div class="empty-state"><h3>${q ? 'Keine Treffer' : 'Noch keine Rezepte'}</h3><p>${q ? 'Keine Rezepte oder Zutaten passen zur Suche.' : (canManage ? 'Lege oben ein neues Rezept an.' : 'Sobald jemand ein Rezept anlegt, erscheint es hier.')}</p></div>`}
  `;
}

let recipeEditId = null;
function readRecipeRows() {
  return [...document.querySelectorAll('#rcRows .rc-row')].map(row => ({
    name: row.querySelector('[data-f="name"]').value.trim(),
    qty: parseFloat(row.querySelector('[data-f="qty"]').value) || 0,
    unit: row.querySelector('[data-f="unit"]').value.trim(),
    category: row.querySelector('[data-f="category"]').value.trim()
  })).filter(r => r.name);
}
function recipeRowHtml(v) {
  v = v || { name: '', qty: '', unit: '', category: '' };
  return `<div class="add-row-form rc-row" style="margin-top:8px;">
    <div class="field f-name" style="margin:0;"><input type="text" placeholder="Bezeichnung" data-f="name" value="${escapeHtml(v.name)}"></div>
    <div class="field f-qty" style="margin:0;"><input type="number" step="any" min="0" placeholder="Menge" data-f="qty" value="${v.qty || ''}"></div>
    <div class="field f-unit" style="margin:0;"><input type="text" list="unitOptions" placeholder="Einheit" data-f="unit" value="${escapeHtml(v.unit)}"></div>
    <div class="field f-unit" style="margin:0;"><input type="text" list="categoryOptions" placeholder="Kategorie" data-f="category" value="${escapeHtml(v.category)}"></div>
    <button type="button" class="icon-btn del" onclick="this.closest('.rc-row').remove()" title="Zeile entfernen">✕</button>
  </div>`;
}
function addRecipeRow(v) { $('rcRows').insertAdjacentHTML('beforeend', recipeRowHtml(v)); }
function openRecipeDialog(id) {
  if (!canManageRecipes()) return;
  recipeEditId = id;
  const r = id ? db.recipes.find(x => x.id === id) : null;
  $('recipeDialogTitle').textContent = r ? 'Rezept bearbeiten' : 'Rezept anlegen';
  $('rcName').value = r ? r.name : '';
  $('rcNote').value = r ? r.note || '' : '';
  $('rcCategory').value = r ? r.recipe_category || '' : '';
  $('rcServings').value = r && r.servings ? r.servings : '';
  $('rcInstructions').value = r ? r.instructions || '' : '';
  rcImageData = undefined;
  showRecipeImagePreview(r ? imgSrc(r.image) || null : null);
  $('rcPaste').value = '';
  $('rcRows').innerHTML = '';
  const items = r ? db.recipeItems.filter(x => x.recipe_id === r.id) : [];
  (items.length ? items : [null]).forEach(addRecipeRow);
  recipeDialog.showModal(); $('rcName').focus();
}
// Erkennt Zeilen wie "400 g Hackfleisch", "2 Zwiebeln" oder "1 Dose Kidneybohnen"
function parseIngredientLine(line) {
  const knownUnits = new Set([...Object.keys(UNITS), 'el', 'tl', 'stk', 'bund', 'prise', 'dose', 'glas', 'packung', 'scheibe', 'zehe', 'blatt', 'würfel', 'tasse', 'flasche']);
  const m = line.trim().match(/^([\d.,]+)\s*([a-zA-ZäöüÄÖÜß]*)\s*(.*)$/);
  if (!m || !m[1]) return { name: line.trim(), qty: 1, unit: '', category: '' };
  const qty = parseFloat(m[1].replace(',', '.')) || 0;
  const maybeUnit = m[2] || '';
  const isUnit = knownUnits.has(maybeUnit.toLowerCase());
  const name = (isUnit ? m[3] : [maybeUnit, m[3]].filter(Boolean).join(' ')).trim();
  return { name: name || line.trim(), qty: qty || 1, unit: isUnit ? maybeUnit : '', category: '' };
}
function importPastedIngredients() {
  const lines = $('rcPaste').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return;
  lines.forEach(l => addRecipeRow(parseIngredientLine(l)));
  $('rcPaste').value = '';
}
async function saveRecipe() {
  const name = $('rcName').value.trim();
  if (!name) { $('rcName').focus(); return; }
  const patch = {
    name,
    note: $('rcNote').value.trim(),
    recipe_category: $('rcCategory').value.trim(),
    servings: $('rcServings').value ? parseInt($('rcServings').value, 10) : null,
    instructions: $('rcInstructions').value.trim()
  };
  const newId = recipeEditId ? null : uuid();
  const oldImage = recipeEditId ? ((db.recipes.find(r => r.id === recipeEditId) || {}).image || null) : null;
  const imageChanged = rcImageData !== undefined; // undefined = unverändert, null = entfernt
  const rows = readRecipeRows();
  recipeDialog.close();
  if (imageChanged) patch.image = await prepareImageValue(rcImageData, 'recipes', recipeEditId || newId);
  const dropNewImage = () => { if (imageChanged && patch.image !== oldImage) removeStoredImage(patch.image); };
  if (recipeEditId) {
    const r1 = await sb.from('recipes').update(patch).eq('id', recipeEditId);
    if (r1.error) { dropNewImage(); toast('Fehler: ' + friendlyError(r1.error), null, null, true); return; }
    if (imageChanged && oldImage !== patch.image) removeStoredImage(oldImage);
    const r2 = await sb.from('recipe_items').delete().eq('recipe_id', recipeEditId);
    if (r2.error) { toast('Fehler: ' + friendlyError(r2.error), null, null, true); await refresh(); return; }
    if (rows.length) {
      const r3 = await sb.from('recipe_items').insert(rows.map(x => ({ ...x, recipe_id: recipeEditId })));
      if (r3.error) { toast('Fehler: ' + friendlyError(r3.error), null, null, true); }
    }
  } else {
    const id = newId;
    const r1 = await sb.from('recipes').insert({ id, ...patch });
    if (r1.error) { dropNewImage(); toast('Fehler: ' + friendlyError(r1.error), null, null, true); return; }
    if (rows.length) {
      const r2 = await sb.from('recipe_items').insert(rows.map(x => ({ ...x, recipe_id: id })));
      if (r2.error) { toast('Fehler: ' + friendlyError(r2.error), null, null, true); }
    }
  }
  await refresh();
}
function deleteRecipe(id) {
  const r = db.recipes.find(x => x.id === id); if (!r) return;
  openConfirm(`Rezept „${r.name}“ endgültig löschen?`, async () => {
    const { error } = await sb.from('recipes').delete().eq('id', id);
    if (error) { toast('Fehler: ' + friendlyError(error), null, null, true); return; }
    removeStoredImage(r.image);
    await refresh();
  }, 'Endgültig löschen');
}

function printRecipe(id) {
  const r = db.recipes.find(x => x.id === id);
  if (!r) return;
  const items = db.recipeItems.filter(x => x.recipe_id === r.id).sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, 'de'));
  const tagLine = [r.recipe_category, r.servings ? `${r.servings} Portionen` : ''].filter(Boolean).join(' · ');
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${escapeHtml(r.name)}</title>
  <style>
    body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #14171F; max-width: 700px; margin: 32px auto; padding: 0 20px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 13px; margin-bottom: 22px; }
    img { max-width: 100%; max-height: 260px; object-fit: cover; border-radius: 10px; margin-bottom: 18px; }
    h2 { font-size: 15px; margin: 22px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th { text-align: left; font-size: 11px; color: #555; border-bottom: 1px solid #999; padding: 5px 6px; }
    td { padding: 6px; border-bottom: 1px solid #ddd; }
    .instructions { white-space: pre-wrap; font-size: 14px; line-height: 1.6; }
  </style></head><body>
  <h1>${escapeHtml(r.name)}</h1>
  <div class="meta">${escapeHtml(tagLine)}${r.note ? (tagLine ? ' · ' : '') + escapeHtml(r.note) : ''}</div>
  ${imgSrc(r.image) ? `<img src="${imgSrc(r.image)}">` : ''}
  ${items.length ? `<h2>Zutaten</h2><table><thead><tr><th>Bezeichnung</th><th>Menge</th><th>Kategorie</th></tr></thead>
    <tbody>${items.map(i => `<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(formatAmount(i.qty, i.unit))}</td><td>${escapeHtml(i.category || '')}</td></tr>`).join('')}</tbody>
  </table>` : ''}
  ${r.instructions ? `<h2>Anleitung</h2><div class="instructions">${escapeHtml(r.instructions)}</div>` : ''}
  </body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0; visibility:hidden;';
  document.body.appendChild(iframe);
  iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close();
  iframe.onload = () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 1000);
  };
}

let addRecipeSourceId = null;
function openAddRecipeToProject(id) {
  const r = db.recipes.find(x => x.id === id); if (!r) return;
  addRecipeSourceId = id;
  $('rpListName').value = r.name;
  if (r.servings) {
    $('rpServingsField').style.display = '';
    $('rpServings').value = r.servings;
    $('rpServings').dataset.base = r.servings;
  } else {
    $('rpServingsField').style.display = 'none';
  }
  const targets = recipeTargets();
  $('rpProject').innerHTML = targets.length
    ? targets.map(p => `<option value="${p.id}" ${p.id === ui.projectId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')
    : '';
  if (!targets.length) { toast('Dafür brauchst du Bearbeiter-Rechte in einem Projekt, in dem die Rezeptbibliothek aktiviert ist.', null, null, true); return; }
  onRecipeProjectChange();
  addRecipeToProjectDialog.showModal(); $('rpListName').focus(); $('rpListName').select();
}
// Hat das gewählte Projekt eine Personenzahl, wird sie als Zielportionen vorgeschlagen
function onRecipeProjectChange() {
  const p = findProject($('rpProject').value);
  if ($('rpServingsField').style.display !== 'none' && p && p.persons) $('rpServings').value = p.persons;
}
async function saveAddRecipeToProject() {
  const name = $('rpListName').value.trim();
  const pid = $('rpProject').value;
  if (!name || !pid) { $('rpListName').focus(); return; }
  const items = db.recipeItems.filter(x => x.recipe_id === addRecipeSourceId);
  const base = parseFloat($('rpServings').dataset.base || '0');
  const target = parseFloat($('rpServings').value || '0');
  const factor = (base > 0 && target > 0) ? target / base : 1;
  addRecipeToProjectDialog.close();
  const newId = uuid();
  // Die Mengen sind jetzt für die gewählten Portionen berechnet; das merkt sich die Liste für den Portionsrechner.
  const listRow = { id: newId, project_id: pid, name };
  if (portionsOk() && $('rpServingsField').style.display !== 'none' && target > 0) listRow.base_servings = Math.round(target);
  const r1 = await sb.from('lists').insert(listRow);
  if (r1.error) { toast('Fehler: ' + friendlyError(r1.error), null, null, true); return; }
  if (items.length) {
    const r2 = await sb.from('items').insert(items.map(i => ({ project_id: pid, list_id: newId, name: i.name, qty: roundNice(Number(i.qty) * factor), unit: i.unit, category: i.category })));
    if (r2.error) { toast('Liste angelegt, Zutaten aber nicht: ' + friendlyError(r2.error), null, null, true); }
  }
  ui.view = 'project'; ui.projectId = pid; ui.tab = 'lists'; saveUi();
  await refresh();
  toast(factor !== 1 ? `Rezept für ${target} Portionen als Liste hinzugefügt.` : 'Rezept als Liste hinzugefügt.');
}


function handleSuggest(input, pid, field) {
  const slot = input.closest('.field').querySelector('.suggest-slot');
  const s = field === 'name' ? findSimilarIngredient(pid, input.value) : findSimilarSupplier(pid, input.value);
  slot.innerHTML = s
    ? `<div class="suggest-chip">Meinst du „${escapeHtml(s)}“? <button type="button" data-value="${escapeHtml(s)}" onclick="applySuggestion(this, '${field}')">Übernehmen</button></div>`
    : '';
}
function applySuggestion(btn, field) {
  const input = btn.closest('.field').querySelector(`input[name="${field}"]`);
  input.value = btn.dataset.value;
  btn.closest('.suggest-slot').innerHTML = '';
  input.focus();
}

