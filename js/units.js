// ===== units.js: EINHEITEN, KATEGORIEN, AGGREGATION: Umrechnung, Gesamtliste, Einkaufslisten, Portionsrechner, Projekt-Funktionen.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= EINHEITEN ================= */
// g/kg/mg werden als Gewicht, ml/cl/dl/l als Volumen zusammengerechnet.
const UNITS = { mg: ['mass', 0.001], g: ['mass', 1], kg: ['mass', 1000], ml: ['vol', 1], cl: ['vol', 10], dl: ['vol', 100], l: ['vol', 1000] };
function unitInfo(u) {
  const x = UNITS[String(u || '').trim().toLowerCase()];
  return x ? { fam: x[0], f: x[1] } : null;
}
function roundNice(n) { return Math.round(n * 100) / 100; }
function fmtNum(n) { return (Math.round(n * 100) / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 }); }
function fmtBase(fam, base) {
  if (fam === 'mass') {
    if (base >= 1000) return fmtNum(base / 1000) + ' kg';
    if (base >= 1 || base === 0) return fmtNum(base) + ' g';
    return fmtNum(base * 1000) + ' mg';
  }
  if (base >= 1000) return fmtNum(base / 1000) + ' l';
  return fmtNum(base) + ' ml';
}
function formatAmount(qty, unit) {
  const q = Number(qty) || 0;
  const info = unitInfo(unit);
  if (info) return fmtBase(info.fam, q * info.f);
  return unit ? `${fmtNum(q)} ${unit}` : fmtNum(q);
}
// Gewicht (g/kg), Volumen (ml/l) oder sonst die Einheit selbst: nur gleiche Arten werden zusammengerechnet
function unitKind(unit) {
  const info = unitInfo(unit);
  return info ? info.fam : 'u:' + String(unit || '').trim().toLowerCase();
}
function groupKey(name, unit) {
  return normName(name) + '|' + unitKind(unit);
}

/* ---------- Projekt-Funktionen & Portionsrechner ---------- */
// Fehlt ein Eintrag in projects.features, ist die Funktion AN (bestehende Projekte behalten alles).
function projectFeature(p, key) { return !(p && p.features && p.features[key] === false); }
function featuresOk() { return db.projects.length > 0 && 'features' in db.projects[0]; }
function portionsOk() { return db.projects.length > 0 && 'persons' in db.projects[0]; }
function recipeTargets() { return visibleProjects().filter(p => canEdit(p) && projectFeature(p, 'recipes')); }
// Die Rezeptbibliothek ist projektübergreifend: Sie bleibt sichtbar, solange sie in mindestens einem Projekt aktiv ist.
function recipesAvailable() { const ps = visibleProjects(); return !ps.length || ps.some(p => projectFeature(p, 'recipes')); }
/* ---------- Startdatum & Erinnerung ---------- */
function startOk() { return db.projects.length > 0 && 'start_date' in db.projects[0]; }
function parseLocalDate(iso) { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); }
function daysUntilStart(p) {
  if (!p || !p.start_date) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((parseLocalDate(p.start_date) - t) / 86400000);
}
function fmtStart(p) { return parseLocalDate(p.start_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function whenText(n) { return n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`; }
// Erinnerung fällig: Startdatum gesetzt, nicht vorbei und innerhalb der eingestellten Tage
function reminderDays(p) {
  const n = daysUntilStart(p);
  return n !== null && n >= 0 && Number(p.remind_days) > 0 && n <= Number(p.remind_days) ? n : null;
}
function startReminderToast() {
  const today = new Date().toISOString().slice(0, 10);
  let stamp = null; try { stamp = localStorage.getItem('kombuese-remind'); } catch (e) { /* ignore */ }
  if (stamp === today) return;
  const due = visibleProjects().map(p => ({ p, n: reminderDays(p) })).filter(x => x.n !== null).sort((a, b) => a.n - b.n);
  if (!due.length) return;
  try { localStorage.setItem('kombuese-remind', today); } catch (e) { /* ignore */ }
  const first = due[0];
  toast(`Erinnerung: „${first.p.name}“ startet ${whenText(first.n)}${due.length > 1 ? ` (+${due.length - 1} weitere)` : ''}.`, 'Öffnen', () => selectProject(first.p.id));
}
function roundQty(n) { return Math.round(n * 1000) / 1000; }
function listTargetServings(list) {
  const p = findProject(list.project_id);
  return list.servings || (p && p.persons) || list.base_servings;
}
// Faktor = benötigte Portionen / Portionen, für die die gespeicherten Mengen gelten
function listFactor(list) {
  if (!list || !list.base_servings) return 1;
  return listTargetServings(list) / list.base_servings;
}
// Wirksame Menge einer Zutat: gespeicherte Menge x Faktor ihrer Liste (gespeichert wird nichts verändert)
function effQty(i) { return roundQty((Number(i.qty) || 0) * listFactor(findList(i.list_id))); }
function fmtFactor(f) { return '×' + f.toLocaleString('de-DE', { maximumFractionDigits: 2 }); }
function scaleBadge(list) {
  const f = listFactor(list);
  return f !== 1 ? ` · <span class="factor-badge" title="Mengen gelten für ${list.base_servings} Portionen">${list.base_servings} → ${listTargetServings(list)} Portionen (${fmtFactor(f)})</span>` : '';
}
function scaleNote(list) {
  const f = listFactor(list);
  return f !== 1 ? `<div class="meta" style="margin:0 0 10px;">„Anzahl“ gilt für ${list.base_servings} Portionen. „Gesamtmenge“ ist auf ${listTargetServings(list)} Portionen umgerechnet (${fmtFactor(f)}), ebenso Gesamtliste und Einkaufslisten.</div>` : '';
}
function formatGroupTotal(g) {
  if (g.fam) return fmtBase(g.fam, g.total);
  return g.unit ? `${fmtNum(g.total)} ${g.unit}` : fmtNum(g.total);
}

function aggregateProject(pid) {
  const map = new Map();
  activeItems(pid).forEach(i => {
    const info = unitInfo(i.unit);
    const key = groupKey(i.name, i.unit);
    if (!map.has(key)) map.set(key, { key, name: i.name, unit: i.unit, fam: info ? info.fam : null, total: 0, items: 0, suppliers: new Set(), listIds: new Set() });
    const g = map.get(key);
    g.total += effQty(i) * (info ? info.f : 1);
    g.items++;
    if (i.supplier) g.suppliers.add(i.supplier);
    g.listIds.add(i.list_id);
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function aggregateBySupplier(pid, useCategories = true) {
  const listNames = new Map(activeLists(pid).map(l => [l.id, l.name]));
  const sup = new Map();
  activeItems(pid).forEach(i => {
    const s = (i.supplier || '').trim();
    const skey = s ? s.toLowerCase() : '\0none';
    if (!sup.has(skey)) sup.set(skey, { supplier: s || 'Ohne Einkaufsliste', map: new Map() });
    const g = sup.get(skey);
    const info = unitInfo(i.unit);
    const key = groupKey(i.name, i.unit);
    if (!g.map.has(key)) g.map.set(key, { name: i.name, unit: i.unit, fam: info ? info.fam : null, total: 0, listNames: new Set(), itemIds: [], bought: true, category: i.category || '', notes: new Set() });
    const e = g.map.get(key);
    e.total += effQty(i) * (info ? info.f : 1);
    e.listNames.add(listNames.get(i.list_id) || '');
    e.itemIds.push(i.id);
    if (!e.category && i.category) e.category = i.category;
    if (i.note) e.notes.add(i.note);
    if (!i.bought) e.bought = false;
  });
  const groups = [...sup.values()].map(g => ({
    supplier: g.supplier,
    entries: [...g.map.values()].sort((a, b) => (useCategories ? categoryRank(a.category) - categoryRank(b.category) : 0) || a.name.localeCompare(b.name, 'de'))
  }));
  groups.sort((a, b) => {
    if (a.supplier === 'Ohne Einkaufsliste') return 1;
    if (b.supplier === 'Ohne Einkaufsliste') return -1;
    return a.supplier.localeCompare(b.supplier, 'de');
  });
  return groups;
}

/* ---------- Tippfehler-Abgleich ---------- */
function levenshtein(a, b) {
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    // Buchstabendreher („Melh" statt „Mehl") zählt nur als ein Fehler
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}
function projectNames(pid, field) {
  const s = new Set();
  activeItems(pid).forEach(i => { if (i[field]) s.add(i[field]); });
  return [...s];
}
function fuzzyMatch(names, q, usePrefix) {
  q = q.trim();
  if (q.length < 2) return null;
  const ql = q.toLowerCase();
  let best = null, bestDist = Infinity;
  names.forEach(n => {
    if (n.toLowerCase().trim() === ql) return;
    const dist = levenshtein(n, q);
    const threshold = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
    if (dist <= threshold && dist < bestDist) { best = n; bestDist = dist; }
  });
  if (best || !usePrefix || ql.length < 3) return best;
  const prefix = ql.slice(0, 3);
  let pm = null, pd = Infinity;
  names.forEach(n => {
    const nl = n.toLowerCase().trim();
    if (nl === ql || nl.slice(0, 3) !== prefix) return;
    const dist = levenshtein(n, q);
    if (dist < pd) { pm = n; pd = dist; }
  });
  return pm;
}
function findSimilarIngredient(pid, name) { return fuzzyMatch(projectNames(pid, 'name'), name, false); }
function findSimilarSupplier(pid, name) { return fuzzyMatch(projectNames(pid, 'supplier'), name, true); }
function projectSupplierNames(pid) { return projectNames(pid, 'supplier').sort((a, b) => a.localeCompare(b, 'de')); }

/* ---------- Lieferanten-Auswahl (Stammliste statt Freitext) ---------- */
function supplierSelectOptions(current) {
  const names = db.suppliers.map(s => s.name);
  if (current && !names.some(n => n.toLowerCase() === current.toLowerCase())) names.push(current);
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'de'));
  return `<option value="">— keine Einkaufsliste —</option>` +
    sorted.map(n => `<option value="${escapeHtml(n)}" ${n === current ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('') +
    `<option value="__new__">+ Neue Einkaufsliste …</option>`;
}
let pendingSupplierSelectEl = null;
function handleSupplierSelect(sel) {
  if (sel.value === '__new__') {
    pendingSupplierSelectEl = sel;
    sel.value = sel.dataset.prev || '';
    $('newSupplierInlineName').value = '';
    $('newSupplierInlineNote').value = '';
    newSupplierInlineDialog.showModal();
    $('newSupplierInlineName').focus();
  } else {
    sel.dataset.prev = sel.value;
  }
}
function cancelNewSupplierInline() { pendingSupplierSelectEl = null; newSupplierInlineDialog.close(); }
async function saveNewSupplierInline() {
  const name = $('newSupplierInlineName').value.trim();
  const note = $('newSupplierInlineNote').value.trim();
  const sel = pendingSupplierSelectEl;
  if (!name || !sel) { cancelNewSupplierInline(); return; }
  newSupplierInlineDialog.close();
  pendingSupplierSelectEl = null;
  // Sofort in diesem einen Auswahlfeld ergänzen, ohne das Formular neu zu zeichnen
  // (sonst gingen bereits eingetippte Werte wie Bezeichnung/Menge verloren).
  if (![...sel.options].some(o => o.value.toLowerCase() === name.toLowerCase())) {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    sel.insertBefore(opt, sel.querySelector('option[value="__new__"]'));
  }
  sel.value = name; sel.dataset.prev = name;
  const { error } = await sb.from('suppliers').insert(note ? { name, note } : { name });
  if (error && !/duplicate|unique/i.test(error.message)) {
    toast('Einkaufsliste konnte nicht dauerhaft gespeichert werden: ' + friendlyError(error), null, null, true);
  }
  // db.suppliers wird spätestens beim nächsten Speichern automatisch aktualisiert.
}

