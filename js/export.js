// ===== export.js: EXPORT: CSV, Excel, Druck, JSON.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= EXPORT: CSV & EXCEL ================= */
function buildTables(project) {
  const lists = activeLists(project.id);
  const listsT = { name: 'Listen', head: ['Liste', 'Bezeichnung', 'Anzahl', 'Einheit', 'Einkaufsliste', 'Gekauft'], rows: [] };
  lists.forEach(l => itemsOfList(l.id).forEach(i => listsT.rows.push([l.name, i.name, effQty(i), i.unit || '', i.supplier || '', i.bought ? 'ja' : 'nein'])));
  const aggT = {
    name: 'Gesamtliste',
    head: ['Bezeichnung', 'Gesamtmenge', 'Einkaufslisten', ...lists.map(l => l.name)],
    rows: aggregateProject(project.id).map(g => [g.name, formatGroupTotal(g), [...g.suppliers].join(', '), ...lists.map(l => g.listIds.has(l.id) ? 'x' : '')])
  };
  const supT = { name: 'Einkaufslisten', head: ['Einkaufsliste', 'Bezeichnung', 'Gesamtmenge', 'Listen', 'Gekauft'], rows: [] };
  aggregateBySupplier(project.id, projectFeature(project, 'categories')).forEach(g => g.entries.forEach(e => supT.rows.push([g.supplier, e.name, formatGroupTotal(e), [...e.listNames].join(', '), e.bought ? 'ja' : 'nein'])));
  return { lists: listsT, aggregate: aggT, suppliers: supT };
}
function safeFileName(s) { return String(s).replace(/[^\p{L}\p{N}\-_]+/gu, '_').replace(/^_+|_+$/g, '') || 'projekt'; }
function csvCell(c) {
  let s = typeof c === 'number' ? String(c).replace('.', ',') : String(c ?? '');
  if (typeof c !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // Formel-Einschleusung verhindern
  return '"' + s.replace(/"/g, '""') + '"';
}
function exportCsv() {
  const project = findProject(ui.projectId); if (!project) return;
  const tables = buildTables(project);
  const key = ui.tab === 'aggregate' ? 'aggregate' : ui.tab === 'suppliers' ? 'suppliers' : 'lists';
  const t = tables[key];
  const csv = '\ufeff' + [t.head, ...t.rows].map(r => r.map(csvCell).join(';')).join('\r\n');
  downloadBlob(`${safeFileName(project.name)}-${t.name.toLowerCase()}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}
/* ---------- Rezeptbild: client-seitig verkleinern, als Data-URL speichern ---------- */
let rcImageData = null;
function handleRecipeImage(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const img = new Image();
  const reader = new FileReader();
  reader.onload = () => {
    img.onload = () => {
      const maxSide = 900;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      rcImageData = canvas.toDataURL('image/jpeg', 0.8);
      showRecipeImagePreview(rcImageData);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function showRecipeImagePreview(dataUrl) {
  if (dataUrl) { $('rcImagePreview').src = dataUrl; $('rcImagePreviewWrap').style.display = 'block'; }
  else { $('rcImagePreviewWrap').style.display = 'none'; }
}
function removeRecipeImage() { rcImageData = null; showRecipeImagePreview(null); }

function loadSheetJs() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve();
    const urls = [
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
    ];
    const tryNext = () => {
      const url = urls.shift();
      if (!url) return reject(new Error('Excel-Bibliothek konnte nicht geladen werden'));
      const s = document.createElement('script');
      s.src = url; s.onload = () => resolve(); s.onerror = () => { s.remove(); tryNext(); };
      document.head.appendChild(s);
    };
    tryNext();
  });
}
async function exportExcel() {
  const project = findProject(ui.projectId); if (!project) return;
  try { await loadSheetJs(); } catch (e) { toast(e.message, null, null, true); return; }
  const tables = buildTables(project);
  const wb = XLSX.utils.book_new();
  ['aggregate', 'suppliers', 'lists'].forEach(k => {
    const t = tables[k];
    const ws = XLSX.utils.aoa_to_sheet([t.head, ...t.rows]);
    ws['!cols'] = t.head.map((h, idx) => ({ wch: Math.min(40, Math.max(String(h).length, ...t.rows.map(r => String(r[idx] ?? '').length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, t.name);
  });
  XLSX.writeFile(wb, `${safeFileName(project.name)}.xlsx`);
}

