// ── CHARTS PAGE ──────────────────────────────────────────────────────────────
// A hub of visualizations: a row of chips picks a chart, rendered lazily into the
// card below via the hand-rolled SVG helpers in chart-lib.js. Data is fetched on
// first view of a chart and cached for the session. Charts that need a not-yet-
// installed RPC degrade to a short "add this function" note.

// ── SHARED DATASETS (lazy + cached) ────────────────────────────────────────────

const _data = {};

// Per-character games/wins (character_stats view) joined with pace + box.
async function _characterStats() {
  if (_data.charStats) return _data.charStats;
  const [{ rows }, chars] = await Promise.all([
    _fetchAllRows(() => db.from('character_stats').select('*')),
    loadCharacters(),
  ]);
  const byName = Object.fromEntries(chars.map(c => [c.name, c]));
  _data.charStats = rows.map(r => ({
    name:  r.character,
    games: Number(r.games),
    wins:  Number(r.wins),
    pace:  byName[r.character]?.pace || null,
    box:   byName[r.character]?.box  || null,
  }));
  return _data.charStats;
}

// All games' played_at / duration / rounds (small rows, paged past the cap).
async function _gamesLite() {
  if (_data.games) return _data.games;
  const { rows } = await _fetchAllRows(() => db.from('games').select('played_at, duration_minutes, num_turns'));
  _data.games = rows;
  return _data.games;
}

// Games + avg duration per table size, via the existing game_stats RPC (one call
// per size, 2..6).
async function _sizeStats() {
  if (_data.sizeStats) return _data.sizeStats;
  const sizes = [2, 3, 4, 5, 6];
  const res = await Promise.all(sizes.map(n => db.rpc('game_stats', { player_count_filter: n })));
  _data.sizeStats = sizes.map((n, i) => {
    const row = (res[i].data || [])[0] || { games: 0, avg_duration: null };
    return { size: n, games: Number(row.games) || 0, avgDur: row.avg_duration };
  });
  return _data.sizeStats;
}

// Games-per-player counts (player_stats view); players with at least one game.
async function _playerStats() {
  if (_data.playerStats) return _data.playerStats;
  const { rows } = await _fetchAllRows(() => db.from('player_stats').select('games'));
  _data.playerStats = rows.map(r => Number(r.games)).filter(g => g > 0);
  return _data.playerStats;
}

// ── CHART REGISTRY ─────────────────────────────────────────────────────────────
// Each: { id, icon, label, desc, render() -> SVG/HTML string }.

const CHARTS = [
  {
    id: 'scatter', icon: '🎯', label: 'Win rate vs popularity',
    desc: 'Each villain by games played (x) and win rate (y); the axes zoom to the data. Up-left is strong but rarely picked, down-right is popular but weak. Tap a dot to open it.',
    async render() {
      const cs = (await _characterStats()).filter(c => c.games > 0);
      const points = cs.map(c => {
        const pct = Math.round(c.wins / c.games * 100);
        return {
          x: c.games,
          y: pct,
          label: c.name,
          color: c.pace ? `var(--pace-${c.pace})` : 'var(--accent)',
          href: `characters.html?char=${encodeURIComponent(c.name)}`,
          box: c.box || null,
          boxHref: c.box ? `characters.html?box=${boxAnchorId(c.box)}` : null,
          meta: `${c.games} games | ${pct}% win rate`,
        };
      });
      return Charts.scatter(points, { xLabel: 'Games played', yFmt: v => Math.round(v) + '%', yMax: 100 });
    },
  },
  {
    id: 'pace', icon: '🎨', label: 'Win rate by pace',
    desc: "Each pace band's overall win rate, pooling every villain of that colour (total wins over total games). The number in parentheses is the band's total games played.",
    async render() {
      const cs = await _characterStats();
      const bands = ['green', 'yellow', 'orange', 'red'];
      const data = bands.map(b => {
        const rows  = cs.filter(c => c.pace === b);
        const games = rows.reduce((a, c) => a + c.games, 0);
        const wins  = rows.reduce((a, c) => a + c.wins,  0);
        const pct   = games ? Math.round(wins / games * 100) : 0;
        return { label: b[0].toUpperCase() + b.slice(1), value: pct, games, color: `var(--pace-${b})`, meta: `${pct}% win rate | ${games} games | ${rows.length} villains` };
      }).filter(d => d.games > 0);
      return Charts.barsH(data, { fmt: (v, d) => `${v}% (${d.games})`, labelW: 60 });
    },
  },
  {
    id: 'box', icon: '📦', label: 'Win rate by box',
    desc: "Each expansion box's overall win rate, pooling every villain in the box (total wins over total games). The number in parentheses is the box's total games played; bars are sorted strongest first.",
    async render() {
      const [cs, boxInfo] = await Promise.all([_characterStats(), loadBoxInfo()]);
      const byBox = {};
      for (const c of cs) {
        if (!c.box) continue;
        (byBox[c.box] ||= { games: 0, wins: 0, villains: 0 });
        byBox[c.box].games += c.games;
        byBox[c.box].wins  += c.wins;
        byBox[c.box].villains++;
      }
      const data = Object.entries(byBox)
        .filter(([, v]) => v.games > 0)
        .map(([box, v]) => {
          const pct  = Math.round(v.wins / v.games * 100);
          const year = boxInfo[box]?.year;
          return {
            label: box,
            value: pct,
            games: v.games,
            href: `characters.html?box=${boxAnchorId(box)}`,
            meta: `${year ? year + ' | ' : ''}${pct}% win rate | ${v.games} games | ${v.villains} villains`,
          };
        })
        .sort((a, b) => b.value - a.value);
      return Charts.barsH(data, { fmt: (v, d) => `${v}% (${d.games})`, labelW: 152 });
    },
  },
  {
    id: 'boxpop', icon: '🔥', label: 'Box popularity',
    desc: "How often each box's villains are picked across all recorded games. Bars are sorted most-played first; tap one to open the box.",
    async render() {
      const byBox = {};
      let total = 0;
      for (const c of await _characterStats()) {
        if (!c.box) continue;
        (byBox[c.box] ||= { games: 0, villains: 0 });
        byBox[c.box].games += c.games;
        byBox[c.box].villains++;
        total += c.games;
      }
      const data = Object.entries(byBox)
        .filter(([, v]) => v.games > 0)
        .map(([box, v]) => ({
          label: box,
          value: v.games,
          href: `characters.html?box=${boxAnchorId(box)}`,
          meta: `${Math.round(v.games / (total || 1) * 100)}% of all picks | ${v.villains} villains`,
        }))
        .sort((a, b) => b.value - a.value);
      return Charts.barsH(data, { fmt: v => v, labelW: 152 });
    },
  },
  {
    id: 'duration', icon: '⏱️', label: 'Game duration',
    desc: 'How many games fall into each 15-minute band (0-15, 15-30, and so on); the band start in minutes is under each bar. Counts only games with a recorded duration.',
    async render() {
      const vals = (await _gamesLite()).map(g => g.duration_minutes).filter(v => v != null);
      if (!vals.length) return Charts.barsV([]);
      const SIZE = 15;   // 15-minute buckets
      const max = Math.max(...vals);
      const n = Math.floor(max / SIZE) + 1;
      const buckets = Array.from({ length: n }, (_, b) => ({ lo: b * SIZE, hi: (b + 1) * SIZE, value: 0 }));
      for (const v of vals) buckets[Math.min(n - 1, Math.floor(v / SIZE))].value++;
      for (const b of buckets) { b.name = `${b.lo}-${b.hi} min`; b.meta = `${b.value} game${b.value === 1 ? '' : 's'}`; }
      return Charts.barsV(buckets, {
        fmt: (v, d) => `${d.lo}-${d.hi} min: ${v}`,
        xTick: i => buckets[i].lo,
        xEvery: 1,
      });
    },
  },
  {
    id: 'avglen', icon: '⏳', label: 'Avg duration by players',
    desc: 'Average recorded game duration in minutes for each table size, from 2 to 6 players. Averaged only over games that recorded a duration.',
    async render() {
      const bySize = Object.fromEntries((await _sizeStats()).map(s => [s.size, s]));
      const data = [2, 3, 4, 5, 6].map(size => {              // always show every table size, even empty
        const s = bySize[size];
        const has = s && s.games > 0 && s.avgDur != null;
        const m = has ? Math.round(s.avgDur) : 0;
        return {
          label: `${size}p`,
          value: m,
          has,
          meta: has ? `${m} min average | ${s.games} games` : (s && s.games > 0 ? 'no duration recorded' : 'no games recorded'),
        };
      });
      return Charts.barsH(data, { fmt: (v, d) => d.has ? `${v} min` : '-', labelW: 48 });
    },
  },
  {
    id: 'rounds', icon: '🔁', label: 'Rounds per game',
    desc: 'How many games fall into each 3-round band, grouped to smooth out noise. Counts only games with a recorded round count.',
    async render() {
      const vals = (await _gamesLite()).map(g => g.num_turns).filter(v => v != null);
      if (!vals.length) return Charts.barsV([]);
      const SIZE = 3;   // group rounds into 3-round bands to smooth out noise
      const lo0 = Math.floor(Math.min(...vals) / SIZE) * SIZE;
      const hi0 = Math.floor(Math.max(...vals) / SIZE) * SIZE;
      const buckets = [];
      for (let b = lo0; b <= hi0; b += SIZE) buckets.push({ lo: b, hi: b + SIZE - 1, value: 0 });
      for (const v of vals) buckets[Math.floor((v - lo0) / SIZE)].value++;
      for (const b of buckets) { b.name = `${b.lo}-${b.hi} rounds`; b.meta = `${b.value} game${b.value === 1 ? '' : 's'}`; }
      return Charts.barsV(buckets, {
        fmt: (v, d) => `${d.lo}-${d.hi} rounds: ${v}`,
        xTick: i => `${buckets[i].lo}-${buckets[i].hi}`,
        xEvery: 1,
      });
    },
  },
  {
    id: 'tablesize', icon: '👥', label: 'Players per game',
    desc: 'Share of recorded games by table size, from 2 to 6 players. Tap a slice for its exact game count and percentage.',
    async render() {
      const ss = (await _sizeStats()).filter(s => s.games > 0);
      const total = ss.reduce((a, s) => a + s.games, 0) || 1;
      const segs = ss.map(s => ({ label: `${s.size}p`, value: s.games, meta: `${s.games} games | ${Math.round(s.games / total * 100)}%` }));
      return Charts.donut(segs);
    },
  },
  {
    id: 'perplayer', icon: '🎮', label: 'Games per player',
    desc: 'How many games each player has recorded, as a distribution. Most players appear in a few games; a few are very active.',
    async render() {
      const vals = await _playerStats();
      if (!vals.length) return Charts.barsV([]);
      const max = Math.max(...vals);
      const SIZE = Math.max(1, Math.ceil(max / 10));   // about 10 bands
      const n = Math.floor((max - 1) / SIZE) + 1;
      const buckets = Array.from({ length: n }, (_, b) => ({ lo: b * SIZE + 1, hi: (b + 1) * SIZE, value: 0 }));
      for (const p of vals) buckets[Math.min(n - 1, Math.floor((p - 1) / SIZE))].value++;
      for (const b of buckets) {
        b.name = SIZE === 1 ? `${b.lo} game${b.lo === 1 ? '' : 's'}` : `${b.lo}-${b.hi} games`;
        b.meta = `${b.value} player${b.value === 1 ? '' : 's'}`;
      }
      return Charts.barsV(buckets, { xTick: i => buckets[i].lo, xEvery: 1 });
    },
  },
  {
    id: 'time', icon: '📈', label: 'Games over time',
    desc: 'Games recorded per calendar month, by play date (labelled YYYY/MM). Includes imported historical games.',
    async render() {
      const byMonth = {};
      for (const g of await _gamesLite()) {
        if (!g.played_at) continue;
        const k = String(g.played_at).slice(0, 7);   // YYYY-MM
        byMonth[k] = (byMonth[k] || 0) + 1;
      }
      const pts = Object.keys(byMonth).sort().map(k => ({ label: k.replace('-', '/'), value: byMonth[k], meta: `${byMonth[k]} game${byMonth[k] === 1 ? '' : 's'}` }));  // YYYY/MM
      return Charts.line(pts);
    },
  },
  {
    id: 'weekday', icon: '📅', label: 'Games by weekday',
    desc: 'Number of games recorded on each weekday, by play date. Weekday is derived from your local time zone.',
    async render() {
      const counts = new Array(7).fill(0);   // 0 = Sunday
      for (const g of await _gamesLite()) {
        if (!g.played_at) continue;
        counts[new Date(g.played_at).getDay()]++;
      }
      const order  = [1, 2, 3, 4, 5, 6, 0];   // Monday first
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const full   = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const data = order.map((d, i) => ({ value: counts[d], name: full[i], meta: `${counts[d]} game${counts[d] === 1 ? '' : 's'}` }));
      return Charts.barsV(data, { xTick: i => labels[i], xEvery: 1 });
    },
  },
  {
    id: 'seatorder', icon: '🪑', label: 'Turn-order advantage',
    desc: "Win rate of each seat in play order (seat 1 plays first) per table size. Warmer cells are above the fair share (1 / players); the cell shows the win rate. Recorded-seating games only.",
    async render() {
      const { data, error } = await db.rpc('position_stats');
      if (error || !data || !data.length) return _needRpc('position_stats');
      const bySize = {};
      for (const r of data) {
        const size = Number(r.player_count), seat = Number(r.seat);
        (bySize[size] ||= {})[seat] = { games: Number(r.games), wins: Number(r.wins) };
      }
      const sizes = [2, 3, 4, 5, 6];              // always render the full grid; cells with no data show greyed
      const maxSeat = 6;
      const rowLabels = sizes.map(s => `${s}p`);
      const colLabels = Array.from({ length: maxSeat }, (_, i) => `Seat ${i + 1}`);
      return Charts.heatmap(rowLabels, colLabels, (ri, ci) => {
        const s = sizes[ri], seat = ci + 1;       // seats are 1-based (ranked play order)
        if (seat > s) return null;                // that seat does not exist for this size
        const cell = bySize[s] && bySize[s][seat];
        if (!cell || !cell.games) return null;
        const pct = cell.wins / cell.games, fair = 1 / s;
        const t = (pct / fair - 0.5) / 1.5;       // 0.5x..2x of fair -> 0..1 on the ramp
        return {
          value: t,
          label: `${Math.round(pct * 100)}%`,
          name:  `${s}p, seat ${seat}`,
          meta:  `${Math.round(pct * 100)}% win | fair ${Math.round(fair * 100)}% | ${cell.games} games`,
        };
      });
    },
  },
];

function _needRpc(name) {
  return `<div class="chart-note">This chart needs the <code>${_esc(name)}</code> function in Supabase. Add it, then refresh.</div>`;
}

// ── PICKER + RENDER ────────────────────────────────────────────────────────────

let _selected = null;

function _renderPicker() {
  document.getElementById('chartPicker').innerHTML =
    `<div class="chart-select-wrap"><select class="chart-select" aria-label="Choose a chart" onchange="selectChart(this.value)">` +
    CHARTS.map(c => `<option value="${c.id}"${c.id === _selected ? ' selected' : ''}>${c.icon} ${_esc(c.label)}</option>`).join('') +
    `</select><span class="chart-chevron">▾</span></div>`;
}

async function selectChart(id) {
  const c = CHARTS.find(x => x.id === id);
  if (!c) return;
  _selected = id;
  _renderPicker();
  document.getElementById('chartDesc').textContent = c.desc;
  const cap = document.getElementById('chartCaption');
  if (cap) cap.textContent = '';
  const stage = document.getElementById('chartStage');
  stage.innerHTML = `<div class="chart-note">Loading…</div>`;
  try {
    stage.innerHTML = await c.render();
  } catch (e) {
    console.error('chart render failed:', e);
    stage.innerHTML = `<div class="chart-note">Could not load this chart.</div>`;
  }
}

// ── INIT ───────────────────────────────────────────────────────────────────────

async function init() {
  setActiveNav('charts.html');
  await initAuth();
  _renderPicker();
  // Tap a chart element (bar, dot, slice, cell) to pin its stats in the caption;
  // tap anywhere else to clear it. Document-level so a tap outside the chart
  // deselects too.
  document.addEventListener('click', e => {
    if (e.target.closest('.chart-caption-link')) return;   // let the caption link navigate
    const hit = e.target.closest('.ch-hit');
    document.querySelectorAll('#chartStage .ch-hit.sel').forEach(d => d.classList.remove('sel'));
    const cap = document.getElementById('chartCaption');
    if (!hit) { if (cap) cap.textContent = ''; return; }   // tapped outside any element
    hit.classList.add('sel');
    // Donut slices overlap at their borders, so raise the selected slice to the
    // front for a clean outline. Only paths (donut arcs) need this; raising a
    // heatmap cell <rect> would cover its own % label drawn just after it.
    if (hit.tagName.toLowerCase() === 'path' && hit.parentNode) hit.parentNode.appendChild(hit);
    if (!cap) return;
    const name = hit.getAttribute('data-name') || '';
    const meta = hit.getAttribute('data-meta') || '';
    const link = (text, h) => h ? `<a class="chart-caption-link" href="${_esc(h)}">${_esc(text)}</a>` : _esc(text);
    const parts = [link(name, hit.getAttribute('data-href'))];
    const box = hit.getAttribute('data-box');
    if (box) parts.push(link(box, hit.getAttribute('data-boxhref')));   // secondary link, e.g. the scatter's box
    if (meta) parts.push(_esc(meta));
    cap.innerHTML = parts.join(' | ');
  });
  selectChart(CHARTS[0].id);
}

init();
