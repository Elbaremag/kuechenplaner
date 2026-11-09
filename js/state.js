// ===== state.js: ZUSTAND: gemeinsame Datenstruktur (db), eigenes Profil, Oberflächen-Zustand.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= STATE ================= */
const db = { profiles: [], projects: [], members: [], lists: [], items: [], recipes: [], recipeItems: [], suppliers: [], categories: [], categoriesOk: false, settings: { version: '1.0' } };
let me = null;          // eigenes Profil {id, name, email, role}
let started = false;    // Sitzung vollständig geladen?
let startingFor = null; // verhindert doppelten Start
let recoveryMode = false;
let rtChannel = null;

