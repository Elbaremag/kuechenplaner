// ===== profile.js: PROFIL und HILFS-DIALOGE: Mein Profil, Passwort, Bestätigungsdialog.
// Alle js-Dateien teilen sich einen globalen Gültigkeitsbereich; die Reihenfolge steht in index.html.
/* ================= HILFS-DIALOGE ================= */
let pendingConfirm = null;
function openConfirm(message, onYes, label) {
  $('confirmBody').textContent = message;
  $('confirmYes').textContent = label || 'Löschen';
  pendingConfirm = onYes;
  confirmDialog.showModal();
}
function runConfirm() {
  confirmDialog.close();
  const cb = pendingConfirm; pendingConfirm = null;
  if (cb) cb();
}
/* ================= MEIN PROFIL ================= */
let profileAvatarData = undefined; // undefined = unverändert, null = entfernt, string = neues Bild
function openProfileDialog() {
  closeMobileNav();
  profileAvatarData = undefined;
  $('pfName').value = me.name || '';
  $('pfAvatarPreview').outerHTML = avatarHtml(me).replace('class="avatar', 'id="pfAvatarPreview" class="avatar');
  $('pfAvatarPreview').style.width = '56px'; $('pfAvatarPreview').style.height = '56px'; $('pfAvatarPreview').style.fontSize = '18px';
  $('pfLoginInfo').value = me.username ? `@${me.username} (lokales Konto)` : me.email;
  $('pfAvatarRemoveBtn').style.display = me.avatar ? '' : 'none';
  const own = ownSessionPref();
  $('pfSession').innerHTML = `<option value="" ${own === null ? 'selected' : ''}>Standard (${escapeHtml(sessionLabel(defaultSessionDays()))})</option>` +
    SESSION_OPTIONS.map(d => `<option value="${d}" ${own === d ? 'selected' : ''}>${escapeHtml(sessionLabel(d))}</option>`).join('');
  $('pfAppVersion').textContent = '';
  requestSwVersion();
  profileDialog.showModal(); $('pfName').focus();
}
function handleProfileAvatar(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  resizeImageToDataUrl(file, 300, 0.85, dataUrl => {
    profileAvatarData = dataUrl;
    $('pfAvatarPreview').outerHTML = `<img id="pfAvatarPreview" class="avatar" style="width:56px; height:56px;" src="${dataUrl}">`;
    $('pfAvatarRemoveBtn').style.display = '';
  });
}
function removeProfileAvatar() {
  profileAvatarData = null;
  const initialsHtml = avatarHtml({ ...me, avatar: null }).replace('class="avatar', 'id="pfAvatarPreview" class="avatar');
  $('pfAvatarPreview').outerHTML = initialsHtml;
  $('pfAvatarPreview').style.width = '56px'; $('pfAvatarPreview').style.height = '56px'; $('pfAvatarPreview').style.fontSize = '18px';
  $('pfAvatarRemoveBtn').style.display = 'none';
}
async function saveProfile() {
  const name = $('pfName').value.trim();
  if (!name) { $('pfName').focus(); return; }
  const patch = { name };
  const oldAvatar = me.avatar || null;
  const avatarChanged = profileAvatarData !== undefined;
  profileDialog.close();
  if (avatarChanged) patch.avatar = await prepareImageValue(profileAvatarData, 'avatars', me.id);
  const { error } = await sb.from('profiles').update(patch).eq('id', me.id);
  if (error) {
    if (avatarChanged && patch.avatar !== oldAvatar) removeStoredImage(patch.avatar);
    toast('Fehler: ' + friendlyError(error), null, null, true);
    return;
  }
  if (avatarChanged && oldAvatar !== patch.avatar) removeStoredImage(oldAvatar);
  await refresh();
}
// Verkleinert ein Bild client-seitig und liefert es als komprimierte JPEG-Data-URL zurück.
function resizeImageToDataUrl(file, maxSide, quality, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale) || 1;
      canvas.height = Math.round(img.height * scale) || 1;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      cb(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function openPasswordDialog(recovery) {
  if (passwordDialog.open) return;
  $('pwTitle').textContent = recovery ? 'Neues Passwort festlegen' : 'Passwort ändern';
  $('pwCancel').style.display = recovery ? 'none' : '';
  $('pwInput').value = '';
  closeMobileNav();
  passwordDialog.showModal(); $('pwInput').focus();
}
async function savePassword() {
  const v = $('pwInput').value;
  if (v.length < 6) { toast('Mindestens 6 Zeichen.', null, null, true); return; }
  const { error } = await sb.auth.updateUser({ password: v });
  if (error) { toast('Fehler: ' + friendlyError(error), null, null, true); return; }
  passwordDialog.close();
  toast('Passwort geändert.');
}

