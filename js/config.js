// ===== config.js: KONFIGURATION: Supabase-Adresse und Schlüssel. Das ist die EINZIGE Datei, die du bei einem neuen Supabase-Projekt anpassen musst.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* =====================================================================
   KONFIGURATION — hier stehen die beiden Werte aus Supabase
   (Project Settings → API). Der "anon public"-Key darf öffentlich sein,
   der Schutz kommt von den Zugriffsregeln (RLS) in der Datenbank.
   ===================================================================== */
const SUPABASE_URL = 'https://beyjqguprnskldbnluby.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJleWpxZ3Vwcm5za2xkYm5sdWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMjA3NzYsImV4cCI6MjEwNTg5Njc3Nn0.u5JaeMYcYxme8NFBSUi5fKRQPMw17ba5X8R55wostRI';

if (!window.supabase) {
  document.getElementById('loadingText').textContent =
    'Die Verbindungs-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen und Seite neu laden.';
  throw new Error('supabase-js nicht geladen');
}
