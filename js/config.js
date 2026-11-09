// ===== config.js: KONFIGURATION: Supabase-Adresse und Schlüssel. Das ist die EINZIGE Datei, die du bei einem neuen Supabase-Projekt anpassen musst.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* =====================================================================
   KONFIGURATION — hier stehen die beiden Werte aus Supabase
   (Project Settings → API). Der "anon public"-Key darf öffentlich sein,
   der Schutz kommt von den Zugriffsregeln (RLS) in der Datenbank.
   ===================================================================== */
const SUPABASE_URL = 'https://vuixgbitqsaygkxdisgi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xtYJbLWI2eFx2pW70Rh-gg_Mguij_ls';

if (!window.supabase) {
  document.getElementById('loadingText').textContent =
    'Die Verbindungs-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen und Seite neu laden.';
  throw new Error('supabase-js nicht geladen');
}
