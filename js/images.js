// ===== images.js: BILDER: Supabase Storage (Hochladen, signierte Links, Entfernen).
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= BILDER (Supabase Storage) =================
   In recipes.image / profiles.avatar steht entweder eine alte Data-URL ("data:image/…") oder ein Verweis
   "storage:<pfad>" auf eine Datei im privaten Bucket "images". Angezeigt wird über kurzlebige signierte Links. */
const IMAGE_BUCKET = 'images';
const SIGNED_URL_SECONDS = 24 * 3600;
const imageUrlCache = new Map();   // 'storage:pfad' -> signierte URL
let imageUrlsFetchedAt = 0;
const isStorageRef = v => typeof v === 'string' && v.startsWith('storage:');
const isDataUrl = v => typeof v === 'string' && v.startsWith('data:');
function imgSrc(v) { if (!v) return ''; return isStorageRef(v) ? (imageUrlCache.get(v) || '') : v; }
async function resolveImageUrls() {
  const refs = new Set();
  db.recipes.forEach(r => { if (isStorageRef(r.image)) refs.add(r.image); });
  db.profiles.forEach(p => { if (isStorageRef(p.avatar)) refs.add(p.avatar); });
  const stale = Date.now() - imageUrlsFetchedAt > 6 * 3600 * 1000;
  const need = [...refs].filter(r => stale || !imageUrlCache.has(r));
  if (!need.length) return;
  try {
    const { data, error } = await sb.storage.from(IMAGE_BUCKET).createSignedUrls(need.map(r => r.slice(8)), SIGNED_URL_SECONDS);
    if (error) throw error;
    (data || []).forEach(d => { if (d && d.signedUrl && d.path) imageUrlCache.set('storage:' + d.path, d.signedUrl); });
    imageUrlsFetchedAt = Date.now();
  } catch (e) { /* Bilder fehlen dann nur; die App läuft weiter */ }
}
function dataUrlToBlob(u) {
  const [head, body] = u.split(',');
  const mime = (head.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(body); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
// Lädt ein Bild hoch und liefert 'storage:pfad' – oder null, wenn das nicht geklappt hat
async function uploadImage(dataUrl, folder, name) {
  const path = `${folder}/${name}-${Date.now().toString(36)}.jpg`;
  try {
    const { error } = await sb.storage.from(IMAGE_BUCKET).upload(path, dataUrlToBlob(dataUrl), { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (error) return null;
    const { data } = await sb.storage.from(IMAGE_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (data && data.signedUrl) imageUrlCache.set('storage:' + path, data.signedUrl);
    return 'storage:' + path;
  } catch (e) { return null; }
}
async function removeStoredImage(ref) {
  if (!isStorageRef(ref)) return;
  try { await sb.storage.from(IMAGE_BUCKET).remove([ref.slice(8)]); } catch (e) { /* bleibt dann als Waise liegen */ }
}
// Neue Bilder (Data-URL) kommen nach Möglichkeit in den Storage; sonst bleibt es wie bisher eine Data-URL
async function prepareImageValue(value, folder, name) {
  if (!isDataUrl(value)) return value;
  return (await uploadImage(value, folder, name)) || value;
}

let ui = (() => {
  try { return Object.assign({ view: 'project', projectId: null, tab: 'lists', search: '', recipeSearch: '' }, JSON.parse(localStorage.getItem('kombuese-ui') || '{}')); }
  catch (e) { return { view: 'project', projectId: null, tab: 'lists', search: '', recipeSearch: '' }; }
})();
function saveUi() { try { localStorage.setItem('kombuese-ui', JSON.stringify(ui)); } catch (e) { /* ignore */ } }

// Kategorien werden zentral in der Datenbank verwaltet (Tabelle "categories", Reihenfolge = Einkaufsroute).
// Rückfall, solange die Tabelle noch nicht eingerichtet ist: diese Standardliste.
const DEFAULT_CATEGORIES = ['Obst & Gemüse', 'Brot & Backwaren', 'Fleisch & Fisch', 'Kühlregal', 'Tiefkühl', 'Konserven & Fertiggerichte',
  'Gewürze, Öle & Saucen', 'Trockenware & Vorrat', 'Süßes & Snacks', 'Getränke', 'Haushalt & Reinigung', 'Drogerie & Sonstiges'];
let categoryNamesCache = null;
function sortedCategories() {
  return [...db.categories].sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name, 'de'));
}
function categoryNames() {
  if (!categoryNamesCache) categoryNamesCache = db.categories.length ? sortedCategories().map(c => c.name) : DEFAULT_CATEGORIES.slice();
  return categoryNamesCache;
}
// Alles Unbekannte landet hinten, "ohne Kategorie" ganz am Ende.
function categoryRank(cat) {
  const names = categoryNames();
  const c = String(cat || '').trim().toLowerCase();
  if (!c) return names.length + 1;
  const i = names.findIndex(n => n.toLowerCase() === c);
  return i === -1 ? names.length : i;
}
function renderCategoryDatalist() {
  const dl = document.getElementById('categoryOptions');
  if (dl) dl.innerHTML = categoryNames().map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
}
function categorySelectOptions() {
  return `<option value="">— Kategorie wählen —</option><option value="__none__">(ohne Kategorie)</option>` +
    categoryNames().map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
}

