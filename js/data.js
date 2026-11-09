// ===== data.js: DATEN LADEN: lädt alle Tabellen aus Supabase.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= DATEN LADEN ================= */
async function fetchAll(table, orderCols) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    let q = sb.from(table).select('*');
    orderCols.forEach(c => { q = q.order(c, { ascending: true }); });
    const { data, error } = await q.range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}
async function loadAll() {
  const [profiles, projects, members, lists, items, recipes, recipeItems, suppliers, categoriesRes, settingsRes] = await Promise.all([
    fetchAll('profiles', ['created_at', 'id']),
    fetchAll('projects', ['created_at', 'id']),
    fetchAll('project_members', ['project_id', 'user_id']),
    fetchAll('lists', ['created_at', 'id']),
    fetchAll('items', ['created_at', 'id']),
    fetchAll('recipes', ['name']),
    fetchAll('recipe_items', ['name']),
    fetchAll('suppliers', ['name']),
    // Tabelle kann in älteren Datenbanken fehlen: dann läuft die App mit der Standardliste weiter
    fetchAll('categories', ['sort_order', 'name']).then(rows => ({ ok: true, rows })).catch(() => ({ ok: false, rows: [] })),
    sb.from('app_settings').select('*').eq('id', 'main').maybeSingle()
  ]);
  db.profiles = profiles; db.projects = projects; db.members = members; db.lists = lists; db.items = items;
  db.recipes = recipes; db.recipeItems = recipeItems; db.suppliers = suppliers;
  db.categories = categoriesRes.rows; db.categoriesOk = categoriesRes.ok; categoryNamesCache = null;
  if (settingsRes.data) db.settings = settingsRes.data;
  applyAdminSessionDefault();
  await resolveImageUrls();
  const mine = profiles.find(p => p.id === me.id);
  if (mine) me = mine;
}

