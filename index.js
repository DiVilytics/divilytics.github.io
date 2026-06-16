function setTheme(t) {
  _applyTheme(t);
  _updateHomeThemeBtns();
}

function _updateHomeThemeBtns() {
  const row = document.getElementById('homeThemeRow');
  if (!row) return;
  const current = localStorage.getItem('theme') || 'auto';
  const btns = row.querySelectorAll('.btn');
  btns[0].disabled = current === 'dark';
  btns[1].disabled = current === 'light';
  btns[2].disabled = current === 'auto';
  document.getElementById('homeThemeIcon').textContent = { dark: '🌙', light: '☀️', auto: '🌗' }[current];
}

// Show a QR (and copyable link) pointing at the app's home page, so someone at
// the table can scan to open DiVilytics, or you can copy the link to share remotely.
function shareApp() {
  showQRModal(location.origin + '/', 'shareAppQrCode', 'shareAppOverlay');
}

function _updateHomeAuthBtns() {
  const loggedIn = !!getCurrentUser();
  document.querySelector('#homeAuthRow .btn:nth-child(1)').disabled = loggedIn;
  document.querySelector('#homeAuthRow .btn:nth-child(2)').disabled = !loggedIn;
}

_updateHomeThemeBtns();
initAuth(_updateHomeAuthBtns).then(_updateHomeAuthBtns);
