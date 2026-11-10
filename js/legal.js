// ===== legal.js: DATENSCHUTZ & IMPRESSUM: Informationsseite mit Betreiberangaben aus config.js.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* Vorlage, keine Rechtsberatung. Sie beschreibt, was die App tatsächlich speichert. Betreiber prüft/ergänzt den Text selbst. */
function openLegal() {
  const val = (v) => v ? escapeHtml(v) : '<mark class="legal-missing">bitte in js/config.js ausfüllen</mark>';
  $('legalBody').innerHTML = `
    <h4>Verantwortlich</h4>
    <p>${val(OPERATOR.name)}<br>${val(OPERATOR.address)}<br>E-Mail: ${val(OPERATOR.email)}</p>
    <h4>Was gespeichert wird</h4>
    <ul>
      <li><b>Konto:</b> E-Mail-Adresse (oder Benutzername), Anzeigename, optional Profilbild, Rolle, Zeitpunkt der Registrierung.</li>
      <li><b>Inhalte:</b> Projekte, Listen, Zutaten, Rezepte (auch mit Bildern), Kategorien, Einkaufslisten und wer etwas angelegt hat.</li>
      <li><b>Auf deinem Gerät:</b> Die Anmeldung (Sitzung), die gewählte Sitzungsdauer und ein Zwischenspeicher der App. Es gibt keine Werbung, keine Analyse und kein Tracking.</li>
    </ul>
    <h4>Wo und durch wen</h4>
    <ul>
      <li><b>Supabase</b> speichert Anmeldung, Datenbank und Bilder als Auftragsverarbeiter (Rechenzentrum in der gewählten Region).</li>
      <li><b>GitHub Pages</b> liefert die App aus. Dabei verarbeitet GitHub technisch bedingt IP-Adressen.</li>
      <li>Passwörter werden nicht im Klartext gespeichert; sie liegen nur verschlüsselt (gehasht) bei Supabase.</li>
    </ul>
    <h4>Wozu</h4>
    <p>Zur gemeinsamen Planung von Küche und Einkauf in geschlossenem Nutzerkreis. Zugriff erhalten nur freigeschaltete Konten.</p>
    <h4>Deine Rechte</h4>
    <p>Du kannst Auskunft über deine Daten, Berichtigung und Löschung verlangen. Wende dich dazu an die oben genannte Person; Konten und zugehörige Daten lassen sich von einem Admin löschen. Ein Datensicherungs-Archiv (wöchentliche Sicherung) wird nach 90 Tagen automatisch verworfen.</p>
    <p class="legal-note">Diese Seite ist eine Vorlage und ersetzt keine Rechtsberatung.</p>`;
  legalDialog.showModal();
}
