// ── PACE / EXCLUDE / MY-BOXES FILTER ───────────────────────────────────────────
// Shared character-filter controller used by both the New Game draw pool and the
// Game Log "included characters" filter. The two pages drive an identical model:
//
//   • a per-character `excluded` set (struck-through pills),
//   • a single-select pace colour that RESETS the pool to that colour's band
//     (Pace+ also covers the neighboring colours),
//   • a sticky "My boxes" toggle that further limits the pool to the user's boxes.
//
// createPaceFilter() owns that state and all the DOM sync (pills, pace swatches,
// the Pace/Pace+ toggle and the My-boxes button). The host page supplies the
// element ids and two callbacks:
//   onChange() — run after the excluded set changes (refresh the page's own
//                badge / action buttons / etc.); pace UI is handled here.
//   onError(msg) — surface a guard message (e.g. not signed in).
//
// Depends on getCurrentUser() (shared.js) and db (db.js).

const PACE_ORDER = ['green', 'yellow', 'orange', 'red'];

function createPaceFilter({
  getChars,
  gridId,
  paceColorsId,
  paceModeId,
  mineBtnId,
  mineTitles,
  onChange = () => {},
  onError  = () => {},
}) {
  const excluded     = new Set();
  let   ownedBoxes   = new Set();
  let   selectedPace = null;   // 'green' | 'yellow' | 'orange' | 'red' | null
  let   pacePlus     = false;
  let   mineOn       = false;

  // The paces a colour selection covers: just that colour, or it plus its
  // immediate neighbors when Pace+ is on.
  function paceBand(color) {
    if (!pacePlus) return new Set([color]);
    const i = PACE_ORDER.indexOf(color);
    return new Set(PACE_ORDER.slice(Math.max(0, i - 1), i + 2));
  }

  async function loadOwnedBoxes() {
    const user = getCurrentUser();
    if (!user) { ownedBoxes = new Set(); return; }
    const { data } = await db.from('profile_boxes').select('box').eq('user_id', user.id);
    ownedBoxes = new Set((data || []).map(r => r.box));
  }

  // Re-sync every pill's class from the current excluded set.
  function syncExcludePills() {
    document.querySelectorAll(`#${gridId} .char-pill`).forEach(btn => {
      btn.classList.toggle('excluded', excluded.has(btn.dataset.name));
    });
  }

  // Reflect the current selection: swatches in the selected band, the Pace/Pace+
  // toggle, and the My-boxes button (active + enabled state + tooltip).
  function updatePaceUI() {
    const band = selectedPace ? paceBand(selectedPace) : null;
    for (const color of PACE_ORDER) {
      const el = document.querySelector(`#${paceColorsId} .pace-color[data-pace="${color}"]`);
      if (!el) continue;
      el.classList.remove('sel-primary', 'sel-neighbor', 'sel-out');
      if (!band) continue;
      el.classList.add(color === selectedPace ? 'sel-primary' : band.has(color) ? 'sel-neighbor' : 'sel-out');
    }
    const modeBtns = document.querySelectorAll(`#${paceModeId} .seg-btn`);
    modeBtns[0]?.classList.toggle('on', !pacePlus);
    modeBtns[1]?.classList.toggle('on',  pacePlus);

    const mineBtn = document.getElementById(mineBtnId);
    if (!mineBtn) return;
    const enabled = !!getCurrentUser() && ownedBoxes.size > 0;
    mineBtn.classList.toggle('disabled', !enabled);
    mineBtn.classList.toggle('on', mineOn && enabled);
    mineBtn.title = !getCurrentUser()
      ? mineTitles.signIn
      : !ownedBoxes.size
        ? mineTitles.noBoxes
        : mineOn ? mineTitles.on : mineTitles.off;
  }

  // Rebuild the excluded set from the current pace + My-boxes selection:
  // everything outside the selected band (or, when My boxes is on, outside the
  // user's boxes) is excluded; everything else is included.
  function applyPaceSelection() {
    const band    = selectedPace ? paceBand(selectedPace) : null;
    const useMine = mineOn && !!getCurrentUser() && ownedBoxes.size > 0;
    excluded.clear();
    for (const c of getChars()) {
      if ((band && !band.has(c.pace)) || (useMine && !ownedBoxes.has(c.box))) {
        excluded.add(c.name);
      }
    }
    syncExcludePills();
    updatePaceUI();
    onChange();
  }

  // Clicking a colour resets the pool to that colour's band (not additive).
  function selectPace(color) {
    selectedPace = color;
    applyPaceSelection();
  }

  // "Pace" vs "Pace+" — whether a colour selection also covers the neighbors.
  function setPaceMode(plus) {
    pacePlus = plus;
    if (selectedPace) applyPaceSelection();  // re-apply with the wider/narrower band
    else updatePaceUI();
  }

  function toggleMine() {
    if (!getCurrentUser()) { onError('Sign in to filter by owned boxes.'); return; }
    if (!ownedBoxes.size)  { onError('Mark which boxes you own on the account page first.'); return; }
    mineOn = !mineOn;
    applyPaceSelection();
  }

  function excludeAll() {
    selectedPace = null;
    mineOn = false;
    for (const c of getChars()) excluded.add(c.name);
    syncExcludePills();
    updatePaceUI();
    onChange();
  }

  function clearExcluded() {
    selectedPace = null;
    mineOn = false;
    excluded.clear();
    syncExcludePills();
    updatePaceUI();
    onChange();
  }

  // Full reset (pace, Pace+ and My boxes too), e.g. discarding a draft.
  function reset() {
    excluded.clear();
    selectedPace = null;
    pacePlus = false;
    mineOn = false;
    syncExcludePills();
    updatePaceUI();
    onChange();
  }

  // Re-seed the whole selection from a saved snapshot (the New Game draft).
  function restoreState(s = {}) {
    selectedPace = s.selectedPace || null;
    pacePlus     = !!s.pacePlus;
    mineOn       = !!s.mineOn;
    excluded.clear();
    (s.excluded || []).forEach(n => excluded.add(n));
    syncExcludePills();
    updatePaceUI();
    onChange();
  }

  return {
    excluded,
    get ownedBoxes()   { return ownedBoxes; },
    get selectedPace() { return selectedPace; },
    get pacePlus()     { return pacePlus; },
    get mineOn()       { return mineOn; },
    loadOwnedBoxes,
    syncExcludePills,
    updatePaceUI,
    applyPaceSelection,
    selectPace,
    setPaceMode,
    toggleMine,
    excludeAll,
    clearExcluded,
    reset,
    restoreState,
  };
}
