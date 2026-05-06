// ── THEME ─────────────────────────────────────────────────────────────────────

(function () {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else if (saved === 'auto') {
    if (!window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.setAttribute('data-theme', 'light');
  }
  // 'dark' or unset: no attribute needed
})();

let _autoMql = null;

function _onAutoChange(e) {
  if (e.matches) document.documentElement.removeAttribute('data-theme');
  else           document.documentElement.setAttribute('data-theme', 'light');
  _updateThemeBtn();
  _updateThemeIcons();
  if (typeof _updateHomeThemeBtns === 'function') _updateHomeThemeBtns();
}

function _applyTheme(state) {
  if (_autoMql) { _autoMql.removeEventListener('change', _onAutoChange); _autoMql = null; }
  if (state === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else if (state === 'dark') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    if (mql.matches) document.documentElement.removeAttribute('data-theme');
    else             document.documentElement.setAttribute('data-theme', 'light');
    _autoMql = mql;
    _autoMql.addEventListener('change', _onAutoChange);
  }
  localStorage.setItem('theme', state);
  _updateThemeBtn();
  _updateThemeIcons();
  if (typeof _updateHomeThemeBtns === 'function') _updateHomeThemeBtns();
}

// Re-attach auto listener on page load if theme was previously set to auto
if (localStorage.getItem('theme') === 'auto') {
  _autoMql = window.matchMedia('(prefers-color-scheme: dark)');
  _autoMql.addEventListener('change', _onAutoChange);
}

function _updateThemeIcons() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const asset = isLight ? 'asset/logo-w.svg' : 'asset/logo-b.svg';
  const navImg = document.querySelector('.nav-brand img');
  if (navImg) navImg.src = asset;
}

function _nextTheme(current) {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (current === 'auto') return systemDark ? 'light' : 'dark';
  if (systemDark)         return current === 'light' ? 'dark' : 'auto';
  return                         current === 'dark'  ? 'light' : 'auto';
}

function toggleTheme() {
  _applyTheme(_nextTheme(localStorage.getItem('theme') || 'dark'));
}

function _updateThemeBtn() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const current = localStorage.getItem('theme') || 'dark';
  const next    = _nextTheme(current);
  const icons   = { dark: '🌙', light: '☀️', auto: '🌗' };
  const titles  = { dark: 'Force dark', light: 'Force light', auto: 'Follow system' };
  btn.textContent = icons[current];
  btn.title       = titles[next];
}

// ── CHARACTER HELPERS ─────────────────────────────────────────────────────────

function charImgSrc(name) {
  return `asset/characters/${name.replace(/ /g, '_')}.webp`;
}

function charImgHTML(name) {
  return `<img class="char-portrait" src="${charImgSrc(name)}" alt="">`;
}

function resolveAvatar(profile) {
  return profile?.avatar_url || profile?.default_avatar || 'asset/player.svg';
}

function playerAvatarHTML(url, large, fallback = 'asset/player.svg') {
  const src = (url || '').trim() || fallback;
  const cls = large ? 'player-avatar-lg' : 'player-avatar';
  return `<img class="${cls}" src="${_esc(src)}" alt="" onerror="this.src='${_esc(fallback)}'">`;
}

// ── CHARACTER GRIDS ───────────────────────────────────────────────────────────

function groupByBox(chars) {
  const map = {};
  for (const c of chars) {
    if (!map[c.box]) map[c.box] = [];
    map[c.box].push(c);
  }
  return map;
}

function charSelectHTML(chars, selected = '') {
  const byBox = groupByBox(chars);
  let html = '<option value="">— Character —</option>';
  for (const [box, cs] of Object.entries(byBox)) {
    html += `<optgroup label="${box}">`;
    for (const c of cs) {
      html += `<option value="${c.name}"${c.name === selected ? ' selected' : ''}>${c.name}</option>`;
    }
    html += '</optgroup>';
  }
  return html;
}

function buildCharGrid(container, chars, selectedSet, onToggle) {
  const byBox = groupByBox(chars);
  container.innerHTML = '';
  for (const [box, cs] of Object.entries(byBox)) {
    const group = document.createElement('div');
    group.className = 'box-group';
    const pillsId = 'bp-' + box.replace(/\s+/g, '_');
    group.innerHTML = `<div class="box-name">${box}</div><div class="box-pills" id="${pillsId}"></div>`;
    container.appendChild(group);
    const pillsEl = group.querySelector('.box-pills');
    for (const c of cs) {
      const btn = document.createElement('button');
      btn.className = 'char-pill' + (selectedSet.has(c.name) ? ' on' : '');
      btn.innerHTML = charImgHTML(c.name) + _esc(c.name);
      btn.dataset.name = c.name;
      btn.onclick = () => {
        const isOn = selectedSet.has(c.name);
        if (isOn) { selectedSet.delete(c.name); btn.classList.remove('on'); }
        else       { selectedSet.add(c.name);    btn.classList.add('on');  }
        onToggle(c.name, !isOn);
      };
      pillsEl.appendChild(btn);
    }
  }
}

function buildExcludeGrid(container, chars, excludedSet, onChange) {
  const byBox = groupByBox(chars);
  container.innerHTML = '';
  for (const [box, cs] of Object.entries(byBox)) {
    const group = document.createElement('div');
    group.className = 'box-group';
    group.innerHTML = `<div class="box-name">${box}</div><div class="box-pills"></div>`;
    container.appendChild(group);
    const pillsEl = group.querySelector('.box-pills');
    for (const c of cs) {
      const btn = document.createElement('button');
      btn.className = 'char-pill' + (excludedSet.has(c.name) ? ' excluded' : '');
      btn.innerHTML = charImgHTML(c.name) + _esc(c.name);
      btn.dataset.name = c.name;
      btn.onclick = () => {
        if (excludedSet.has(c.name)) { excludedSet.delete(c.name); btn.classList.remove('excluded'); }
        else                          { excludedSet.add(c.name);    btn.classList.add('excluded');    }
        onChange();
      };
      pillsEl.appendChild(btn);
    }
  }
}

// ── FORMATTING ────────────────────────────────────────────────────────────────

function fmtDateTime(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

function fmtDuration(min) {
  if (!min) return null;
  if (min < 60) return min + 'm';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtDateShort(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function avg(arr) {
  const valid = arr.filter(x => x != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// ── OVERLAYS ──────────────────────────────────────────────────────────────────

function closeOverlay(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

function openOverlay(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function showQRModal(url, codeElId, overlayId) {
  document.getElementById('qrUrlText').textContent = url;
  const el = document.getElementById(codeElId);
  el.innerHTML = '';
  new QRCode(el, { text: url, width: 200, height: 200, colorDark: '#000000', colorLight: '#ffffff' });
  openOverlay(overlayId);
}

// ── FILTER HELPERS ────────────────────────────────────────────────────────────

function updateFilterPills(selector, value) {
  document.querySelectorAll(selector).forEach((btn, i) => {
    btn.classList.toggle('on', (i === 0 ? 'all' : i + 1) === value);
  });
}

function populateSearchDropdown(dropdown, html, onSelect) {
  dropdown.innerHTML = html;
  dropdown.querySelectorAll('.cs-option').forEach(opt => {
    opt.addEventListener('mousedown', ev => { ev.preventDefault(); onSelect(opt); });
  });
  dropdown.classList.add('open');
}

// ── STATS HELPERS ─────────────────────────────────────────────────────────────

function sortStatRows(rows, mode) {
  const sorted = [...rows];
  if (mode === 'count') return sorted.sort((a, b) => b.wins - a.wins || b.games - a.games);
  if (mode === 'games') return sorted.sort((a, b) => b.games - a.games || b.wins - a.wins);
  return sorted.sort((a, b) => {
    const pa = a.games ? a.wins / a.games : 0;
    const pb = b.games ? b.wins / b.games : 0;
    return pb - pa || b.wins - a.wins;
  });
}

function computeRanks(rows, mode) {
  const primaryVal = r =>
    mode === 'count' ? r.wins :
    mode === 'games' ? r.games :
    (r.games ? r.wins / r.games : 0);
  const ranks = [];
  for (let i = 0; i < rows.length; i++) {
    ranks.push(i === 0 || primaryVal(rows[i]) !== primaryVal(rows[i - 1]) ? i + 1 : ranks[i - 1]);
  }
  return ranks;
}

function statBarWidth(r, mode, maxWins, maxGames, maxPct) {
  if (mode === 'count') return Math.round((r.wins  / maxWins)  * 100);
  if (mode === 'games') return Math.round((r.games / maxGames) * 100);
  const pct = r.games ? r.wins / r.games : 0;
  return Math.round((pct / maxPct) * 100);
}

// ── SEARCH HELPERS ────────────────────────────────────────────────────────────

function _handleSearchBlur(dropdownEl) {
  setTimeout(() => dropdownEl.classList.remove('open'), 150);
}

function _handleSearchKeydown(e, dropdownEl, inputEl, onSelect, onDirectEnter) {
  const options = [...dropdownEl.querySelectorAll('.cs-option')];
  const active  = dropdownEl.querySelector('.cs-option.active');
  let idx = active ? options.indexOf(active) : -1;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    options.forEach(o => o.classList.remove('active'));
    options[(idx + 1) % options.length]?.classList.add('active');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    options.forEach(o => o.classList.remove('active'));
    options[(idx - 1 + options.length) % options.length]?.classList.add('active');
  } else if (e.key === 'Enter') {
    const target = active || (options.length === 1 ? options[0] : null);
    if (target) {
      e.preventDefault();
      onSelect(target);
    } else if (onDirectEnter) {
      const v = inputEl.value.trim();
      if (v) { e.preventDefault(); onDirectEnter(v); }
    }
  } else if (e.key === 'Escape') {
    dropdownEl.classList.remove('open');
    inputEl.blur();
  }
}

// ── QR URL COPY ───────────────────────────────────────────────────────────────

function copyQrUrl() {
  const url = document.getElementById('qrUrlText')?.textContent?.trim();
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('.qr-url-row .pf-btn');
    if (!btn) return;
    const prev = btn.textContent;
    btn.textContent = '✓';
    btn.style.color = '#4ade80';
    setTimeout(() => { btn.textContent = prev; btn.style.color = ''; }, 1500);
  });
}

// ── GAME CARD ─────────────────────────────────────────────────────────────────

function buildGameCard(g, gp, { isSelf = () => false, actions = '', onLocationClick = null } = {}) {
  const locationPart = g.location
    ? (onLocationClick ? `<button class="card-loc-btn">${_esc(g.location)}</button>` : _esc(g.location))
    : null;
  const meta = [
    fmtDuration(g.duration_minutes),
    g.num_turns ? `${g.num_turns} turns` : null,
    locationPart,
    `${gp.length}p`,
  ].filter(Boolean).join(' · ');

  const card = document.createElement('div');
  card.className = 'game-card';
  card.innerHTML = `
    <div class="card-body">
      <div class="card-top">
        <div class="card-date">${fmtDateTime(g.played_at)}</div>
        <div class="card-meta">${meta}</div>
      </div>
      <div class="card-players">
        ${gp.map(p => {
          const cls = `chip ${p.is_winner ? 'winner' : ''}${isSelf(p) ? ' self' : ''}`;
          return `<div class="${cls}">
            ${p.is_winner ? '<span class="win-star">👑</span>' : ''}
            <a class="char-link chip-img" href="character.html?char=${encodeURIComponent(p.character)}">${charImgHTML(p.character)}</a>
            <div class="chip-body">
              <div class="chip-char"><a class="char-link" href="character.html?char=${encodeURIComponent(p.character)}">${_esc(p.character)}</a></div>
              ${p.nickname ? `<div class="chip-nick"><a class="nick-link" href="player.html?nick=${encodeURIComponent(p.nickname)}">${_esc(p.nickname)}</a></div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
    ${actions}`;
  if (onLocationClick && g.location) {
    card.querySelector('.card-loc-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      onLocationClick(g.location);
    });
  }
  return card;
}
