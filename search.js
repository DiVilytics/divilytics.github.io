// ── SEARCH BOX ─────────────────────────────────────────────────────────────────
// Typeahead input + dropdown wiring shared by the player, character and location
// search boxes. Depends on `_esc` and `db` (db.js).

function populateSearchDropdown(dropdown, html, onSelect) {
  dropdown.innerHTML = html;
  dropdown.querySelectorAll('.cs-option').forEach(opt => {
    opt.addEventListener('mousedown', ev => { ev.preventDefault(); onSelect(opt); });
  });
  dropdown.classList.add('open');
}

// Wrap a Supabase query-builder as a per-keystroke fetchOptions source for
// attachSearchBox. `buildQuery(term)` runs server-side on every keystroke and
// resolves to { data }; we return the rows (or []). Used by both the player and
// location search boxes so matching/limiting happens in the DB, not the browser.
function dbSearchSource(buildQuery) {
  return async term => {
    const { data } = await buildQuery(term);
    return data || [];
  };
}

// Attach location autocomplete to a free-text input: typing suggests existing
// locations (via the search_locations RPC); picking one fills the input. The
// user can still type a brand-new location. Requires a sibling .cs-dropdown
// inside a position:relative wrapper.
function attachLocationAutocomplete(inputId, dropdownId) {
  attachSearchBox({
    inputId,
    dropdownId,
    debounceMs: 200,
    fetchOptions: dbSearchSource(q => db.rpc('search_locations', { q })),
    renderOption: l => `<div class="cs-option" data-loc="${_esc(l)}">${_esc(l)}</div>`,
    onSelect: opt => {
      const input = document.getElementById(inputId);
      if (input) input.value = opt.dataset.loc;
      document.getElementById(dropdownId)?.classList.remove('open');
    },
  });
}

// Wires up a typeahead input + dropdown. Every page that has a search box
// previously had three near-identical wrappers (input/blur/keydown), this
// helper replaces them with a single registration call.
//
// Required opts:
//   inputId, dropdownId
//   fetchOptions(query)  : sync or async, returns an array of "option" data
//   renderOption(item)   : returns the inner HTML string for one .cs-option
//   onSelect(optionEl)   : called with the chosen .cs-option element
// Optional:
//   onDirectEnter(query) : Enter w/ no active option fires this with raw text
//   onEmpty()            : called when query goes blank (e.g. clear filters)
//   debounceMs           : 0 = instant; >0 debounces fetchOptions
function attachSearchBox(opts) {
  const {
    inputId, dropdownId,
    fetchOptions, renderOption,
    onSelect, onDirectEnter, onEmpty,
    debounceMs = 0,
  } = opts;
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  let timer = null;

  async function _runQuery(val) {
    const trimmed = val.trim();
    if (!trimmed) {
      dropdown.classList.remove('open');
      onEmpty?.();
      return;
    }
    const matches = await fetchOptions(trimmed);
    if (!matches || !matches.length) { dropdown.classList.remove('open'); return; }
    populateSearchDropdown(dropdown, matches.map(renderOption).join(''), onSelect);
  }

  input.addEventListener('input', e => {
    const v = e.target.value;
    if (debounceMs > 0) {
      clearTimeout(timer);
      timer = setTimeout(() => _runQuery(v), debounceMs);
    } else {
      _runQuery(v);
    }
  });
  input.addEventListener('blur',    () => _handleSearchBlur(dropdown));
  input.addEventListener('keydown', e  => _handleSearchKeydown(e, dropdown, input, onSelect, onDirectEnter));
}

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
