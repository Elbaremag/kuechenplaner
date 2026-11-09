// ===== merge.js: GESAMTLISTE: Zeilen zusammenführen.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= GESAMTLISTE: ZEILEN ZUSAMMENFÜHREN ================= */
// Vereinheitlicht den Namen der betroffenen Zutaten, damit die Gesamtliste sie als eine Zeile zusammenrechnet.
// Die einzelnen Zutaten in den Listen bleiben dabei erhalten (es wird nichts gelöscht).
let selectedAggKeys = new Set();
let mergeState = null;
function toggleAggSelect(key, checked) { if (checked) selectedAggKeys.add(key); else selectedAggKeys.delete(key); renderMain(); }
function clearAggSelection() { selectedAggKeys.clear(); renderMain(); }
function mergeItems(st) {
  const keys = new Set(st.keys);
  return activeItems(st.pid).filter(i => keys.has(groupKey(i.name, i.unit)));
}
function openMerge() {
  const project = findProject(ui.projectId);
  if (!project || !canEdit(project)) return;
  const groups = aggregateProject(project.id).filter(g => selectedAggKeys.has(g.key));
  if (groups.length < 2) { toast('Bitte mindestens zwei Zeilen auswählen.', null, null, true); return; }
  const best = [...groups].sort((a, b) => b.items - a.items || b.total - a.total || a.name.localeCompare(b.name, 'de'))[0];
  mergeState = { pid: project.id, keys: groups.map(g => g.key), name: best.name };
  renderMergeDialog();
  mergeDialog.showModal();
}
function renderMergeDialog() {
  const st = mergeState;
  const groups = aggregateProject(st.pid).filter(g => st.keys.includes(g.key));
  const items = mergeItems(st);
  const listNames = new Map(activeLists(st.pid).map(l => [l.id, l.name]));
  const compatible = new Set(items.map(i => unitKind(i.unit))).size === 1;
  const units = [...new Set(items.map(i => (i.unit || '').trim() || '(ohne Einheit)'))];
  const sum = groups.reduce((s, g) => s + g.total, 0);
  const allLists = new Set(groups.flatMap(g => [...g.listIds]));
  st.total = compatible ? formatGroupTotal({ fam: groups[0].fam, total: sum, unit: groups[0].unit }) : '';
  st.itemCount = items.length; st.listCount = allLists.size;
  $('mergeBody').innerHTML = `
    <p class="meta" style="margin:0 0 10px;">Diese ${groups.length} Zeilen werden zu einer zusammengeführt. Die einzelnen Zutaten in den Listen bleiben erhalten, nur ihr Name wird vereinheitlicht.</p>
    <div class="overflow-wrap"><table>
      <thead><tr><th>Bezeichnung</th><th class="num">Menge</th><th>Zutaten</th><th>Listen</th></tr></thead>
      <tbody>${groups.map(g => `<tr><td>${escapeHtml(g.name)}</td><td class="num">${escapeHtml(formatGroupTotal(g))}</td><td>${g.items}</td><td class="supplier-list">${[...g.listIds].map(id => escapeHtml(listNames.get(id) || '')).join(', ')}</td></tr>`).join('')}</tbody>
    </table></div>
    ${compatible ? `
      <div class="field" style="margin:14px 0 0;"><label for="mergeName">Name nach dem Zusammenführen</label>
        <input id="mergeName" type="text" list="mergeNames" value="${escapeHtml(st.name)}" oninput="mergeState.name = this.value; updateMergePreview()">
        <datalist id="mergeNames">${groups.map(g => `<option value="${escapeHtml(g.name)}"></option>`).join('')}</datalist>
      </div>
      <div class="merge-result" id="mergePreview"></div>` : `
      <div class="merge-warn"><b>Die Einheiten lassen sich nicht zusammenrechnen</b> (${units.map(escapeHtml).join(', ')}). Es wird nichts addiert und nichts verändert. Bitte nur Zeilen auswählen, deren Einheiten zusammenpassen (Gewicht: g/kg, Volumen: ml/l, sonst dieselbe Einheit).</div>`}`;
  $('mergeYes').disabled = !compatible;
  if (compatible) updateMergePreview();
}
function updateMergePreview() {
  const st = mergeState; const el = $('mergePreview');
  if (!st || !el) return;
  el.innerHTML = `Ergebnis: <b>${escapeHtml(st.name.trim() || '…')}</b> — ${escapeHtml(st.total)} <span class="meta">(${st.itemCount} Zutaten in ${st.listCount} Liste${st.listCount === 1 ? '' : 'n'})</span>`;
}
async function runMerge() {
  const st = mergeState;
  if (!st) return;
  const name = st.name.trim();
  if (!name) { $('mergeName').focus(); return; }
  const items = mergeItems(st);
  // Sicherheitsnetz: nie Mengen mit unpassenden Einheiten zusammenführen
  if (!items.length || new Set(items.map(i => unitKind(i.unit))).size !== 1) { toast('Die Einheiten lassen sich nicht zusammenrechnen.', null, null, true); return; }
  const before = items.map(i => ({ id: i.id, name: i.name }));
  $('mergeYes').disabled = true;
  const { data, error } = await sb.from('items').update({ name }).in('id', before.map(b => b.id)).select('id');
  if (error) { $('mergeYes').disabled = false; toast('Zusammenführen fehlgeschlagen: ' + friendlyError(error), null, null, true); return; }
  mergeDialog.close();
  mergeState = null;
  selectedAggKeys.clear();
  await refresh();
  const changed = new Set((data || []).map(d => d.id));
  const undoRows = before.filter(b => changed.has(b.id));
  const undo = () => undoMerge(undoRows);
  if (changed.size !== before.length) toast(`Nur ${changed.size} von ${before.length} Zutaten konnten umbenannt werden (fehlende Berechtigung).`, 'Rückgängig', undo, true);
  else toast(`${before.length} Zutaten zu „${name}“ zusammengeführt.`, 'Rückgängig', undo);
}
async function undoMerge(rows) {
  const byName = new Map();
  rows.forEach(r => { if (!byName.has(r.name)) byName.set(r.name, []); byName.get(r.name).push(r.id); });
  for (const [oldName, ids] of byName) {
    const { error } = await sb.from('items').update({ name: oldName }).in('id', ids);
    if (error) { toast('Rückgängig fehlgeschlagen: ' + friendlyError(error), null, null, true); await refresh(); return; }
  }
  await refresh();
  toast('Zusammenführung rückgängig gemacht.');
}

