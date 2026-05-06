// ── STATE ─────────────────────────────────────────────────────────────────────

let chars         = [];
let excluded      = new Set();
let spinTimer     = null;
let orderSlots    = [];
let orderNextId   = 0;

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  setActiveNav('draw.html');
  await initAuth();
  chars = await loadCharacters();
  buildExcludeGrid(
    document.getElementById('excludeGrid'),
    chars,
    excluded,
    updateExcludeUI
  );
  addOrderSlot();
  addOrderSlot();
}

// ── EXCLUDE CONTROLS ─────────────────────────────────────────────────────────

function toggleExclude() {
  const body   = document.getElementById('excludeBody');
  const chevron = document.getElementById('exChevron');
  const open   = body.classList.toggle('open');
  chevron.classList.toggle('open', open);
}

function updateExcludeUI() {
  const badge = document.getElementById('exBadge');
  const n = excluded.size;
  badge.textContent = n;
  badge.classList.toggle('visible', n > 0);
}

function excludeAll() {
  chars.forEach(c => {
    excluded.add(c.name);
    const btn = document.querySelector(`#excludeGrid .char-pill[data-name="${CSS.escape(c.name)}"]`);
    btn?.classList.add('excluded');
  });
  updateExcludeUI();
}

function clearExcluded() {
  excluded.clear();
  document.querySelectorAll('#excludeGrid .char-pill').forEach(b => b.classList.remove('excluded'));
  updateExcludeUI();
}

function applyExclude() {
  const body = document.getElementById('excludeBody');
  const chevron = document.getElementById('exChevron');
  body.classList.remove('open');
  chevron.classList.remove('open');
}

// ── ROLL ──────────────────────────────────────────────────────────────────────

function roll() {
  const pool = chars.filter(c => !excluded.has(c.name));

  const placeholder = document.getElementById('placeholder');
  const nameEl      = document.getElementById('resultName');

  if (!pool.length) {
    placeholder.textContent = 'No characters available — clear some exclusions.';
    placeholder.style.display = '';
    nameEl.style.display = 'none';
    return;
  }

  placeholder.style.display = 'none';
  nameEl.style.display = '';
  nameEl.classList.add('spinning');

  clearInterval(spinTimer);

  let ticks = 0;
  const total = 20;

  spinTimer = setInterval(() => {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    nameEl.textContent = pick.name;
    ticks++;

    if (ticks >= total) {
      clearInterval(spinTimer);
      const final = pool[Math.floor(Math.random() * pool.length)];
      nameEl.innerHTML = `${charImgHTML(final.name)}<div><div>${_esc(final.name)}</div><div class="result-box">${_esc(final.box)}</div></div>`;
      nameEl.classList.remove('spinning');
    }
  }, 55);
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();

// ── PLAY ORDER ────────────────────────────────────────────────────────────────

function addOrderSlot() {
  if (orderSlots.length >= 6) return;
  orderSlots.push({ id: orderNextId++, char: '' });
  renderOrderSlots();
}

function removeOrderSlot(id) {
  orderSlots = orderSlots.filter(s => s.id !== id);
  renderOrderSlots();
}

function updateOrderSlot(id, char) {
  const slot = orderSlots.find(s => s.id === id);
  if (slot) slot.char = char;
  renderOrderSlots();
}

function randomizeOrderSlot(id) {
  const slot = orderSlots.find(s => s.id === id);
  if (!slot) return;
  const taken = new Set(orderSlots.filter(o => o.id !== id && o.char).map(o => o.char));
  const pool = chars.filter(c => !taken.has(c.name));
  if (!pool.length) return;
  slot.char = pool[Math.floor(Math.random() * pool.length)].name;
  renderOrderSlots();
}

function renderOrderSlots() {
  const container = document.getElementById('orderSlots');

  container.innerHTML = orderSlots.map((s, i) => {
    const taken = new Set(orderSlots.filter(o => o.id !== s.id && o.char).map(o => o.char));
    const available = chars.filter(c => !taken.has(c.name));
    const src = s.char ? charImgSrc(s.char) : 'asset/player.svg';
    return `
      <div class="order-slot">
        <span class="row-num">${i + 1}.</span>
        <img class="order-slot-portrait" src="${src}" onerror="this.src='asset/player.svg'" alt="">
        <button class="pf-btn rand" onclick="randomizeOrderSlot(${s.id})" title="Random character">🎲</button>
        <select class="order-slot-select" onchange="updateOrderSlot(${s.id}, this.value)">
          ${charSelectHTML(available, s.char)}
        </select>
        ${orderSlots.length > 2
          ? `<button class="pf-btn del" onclick="removeOrderSlot(${s.id})">×</button>`
          : ''}
      </div>`;
  }).join('');

  document.getElementById('orderAddBtn').style.display = orderSlots.length >= 6 ? 'none' : '';
  document.getElementById('groupBtn').disabled = orderSlots.length < 2;
}

function randomizeGroup() {
  for (let i = orderSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [orderSlots[i], orderSlots[j]] = [orderSlots[j], orderSlots[i]];
  }
  renderOrderSlots();
}
