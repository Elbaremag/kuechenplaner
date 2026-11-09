// ===== helpers.js: HILFSFUNKTIONEN: kleine Werkzeuge (Escape, Toast, Fehlertexte, Rollen, Berechtigungen).
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= HELPERS ================= */
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}
function escapeJs(str) { return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function $(id) { return document.getElementById(id); }
function normName(n) { return String(n || '').trim().toLowerCase(); }

function roleLabel(role) {
  return { admin: 'Admin', lead: 'Projektleiter', editor: 'Bearbeiter', viewer: 'Betrachter', pending: 'Gesperrt / wartet' }[role] || role;
}
function roleDescription(role) {
  return {
    admin: 'Verwaltet das gesamte Programm: legt Benutzer an, schaltet sie frei, sieht und verwaltet alle Projekte.',
    lead: 'Kann eigene Projekte anlegen und dort Mitglieder aus bereits freigeschalteten Benutzern hinzufügen.',
    editor: 'Kann in zugewiesenen Projekten Listen und Zutaten anlegen, bearbeiten und abhaken.',
    viewer: 'Kann zugewiesene Projekte nur ansehen, nichts bearbeiten.',
    pending: 'Konto existiert, wartet aber noch auf Freischaltung durch einen Admin.'
  }[role] || '';
}
function findProject(id) { return db.projects.find(p => p.id === id); }
function findList(id) { return db.lists.find(l => l.id === id); }
function profileName(id) { const p = db.profiles.find(x => x.id === id); return p ? (p.name || p.username || p.email || '—') : '—'; }
function profileById(id) { return db.profiles.find(x => x.id === id) || null; }
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
const AVATAR_PALETTE = ['#4F46E5', '#0EA5E9', '#16A34A', '#D97706', '#DB2777', '#7C3AED', '#0D9488'];
function avatarColor(seed) {
  let h = 0; for (const c of String(seed || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
// Liefert HTML für einen Avatar: Bild falls vorhanden, sonst farbiges Kürzel aus den Initialen.
function avatarHtml(profile, size) {
  const cls = size === 'small' ? 'avatar small' : 'avatar';
  const name = profile ? (profile.name || profile.username || profile.email || '?') : '?';
  if (profile && imgSrc(profile.avatar)) return `<img class="${cls}" src="${imgSrc(profile.avatar)}" alt="">`;
  return `<div class="${cls}" style="background:${avatarColor(profile ? profile.id : name)}22; color:${avatarColor(profile ? profile.id : name)};">${escapeHtml(initials(name))}</div>`;
}
function slugifyUsername(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, ''); }
function localEmailFor(username) { return `local-${slugifyUsername(username)}@kombuese.local`; }
function isLocalEmail(email) { return /@kombuese\.local$/i.test(String(email || '')); }

function roleInProject(project) {
  if (!me || !project) return null;
  if (me.role === 'admin') return 'admin';
  const m = db.members.find(x => x.project_id === project.id && x.user_id === me.id);
  return m ? m.role : null;
}
function canEdit(project) { const r = roleInProject(project); return r === 'admin' || r === 'editor'; }
function isProjectAdmin(project) { return roleInProject(project) === 'admin'; }
function canCreateProject() { return !!me && (me.role === 'admin' || me.role === 'lead'); }

function activeLists(pid) {
  return db.lists.filter(l => l.project_id === pid && !l.deleted_at)
    .sort((a, b) => (a.sort_order - b.sort_order) || (new Date(a.created_at) - new Date(b.created_at)));
}
function itemsOfList(lid) { return db.items.filter(i => i.list_id === lid && !i.deleted_at); }
function activeItems(pid) {
  const ids = new Set(activeLists(pid).map(l => l.id));
  return db.items.filter(i => i.project_id === pid && !i.deleted_at && ids.has(i.list_id));
}

/* ---------- Toasts (mit optionalem „Rückgängig") ---------- */
function toast(msg, actionLabel, actionFn, isError) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const host = document.querySelector('dialog[open]') || document.body;
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  const span = document.createElement('span'); span.textContent = msg; el.appendChild(span);
  if (actionLabel) {
    const b = document.createElement('button'); b.textContent = actionLabel;
    b.onclick = () => { el.remove(); if (actionFn) actionFn(); };
    el.appendChild(b);
  }
  host.appendChild(el);
  setTimeout(() => el.remove(), actionLabel ? 7000 : 3800);
}
function friendlyError(err) {
  const m = (err && err.message) || String(err);
  if (err && (err.code === '42501' || /row-level security/i.test(m))) return 'Dafür fehlt die Berechtigung.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Keine Verbindung zum Server.';
  return m;
}

