// ── STATE ─────────────────────────────────────────────────────────────────────

const OBJECTIVES = {
  'Maleficent':     'Start your turn with a Curse at each location.',
  'Jafar':          'Start your turn with the Magic Lamp at Sultan\'s Palace and the Genie under your control.',
  'Ursula':         'Start your turn with the Trident and the Crown at Ursula\'s Lair.',
  'Captain Hook':   'Defeat Peter Pan at the Jolly Roger.',
  'Queen of Hearts':'Have a Wicket at each location and successfully take a Shot.',
  'Prince John':    'Start your turn with at least 20 Power.',
  'Evil Queen':     'Find Snow White and defeat her.',
  'Dr. Facilier':   'Have the Talisman in your Realm and cast Rule New Orleans.',
  'Hades':          'Start your turn with at least three Titans at Mount Olympus.',
  'Scar':           'Defeat Mufasa, then have at least 15 Strength in your Succession pile.',
  'Ratigan':        'Have the Queen\'s Robot at Buckingham Palace (if the Robot is discarded, your objective changes to: Defeat Basil).',
  'Yzma':           'Find and defeat Kuzco using Kronk.',
  'Cruella de Vil': 'Start your turn with at least 99 Puppies captured.',
  'Mother Gothel':  'Start your turn with at least 10 Trust.',
  'Pete':           'Complete the four Goal tokens randomly assigned to your locations.',
  'Gaston':         'Remove all 8 Obstacle tokens from your board.',
  'Lady Tremaine':  'Have the Prince at your realm and marry him to Drizella or Anastasia.',
  'Horned King':    'Have Cauldron Born at each location.',
  'Syndrome':       'Defeat the Omnidroid v.10, then have no Heroes in your Realm.',
  'Lotso':          'Have 4 Heroes with 0 Strength and Buzz Lightyear in the Sunnyside Library.',
  'Madam Mim':      'Defeat all of Merlin\'s Transformations.',
  'King Candy':     'Win the Race (reach the finish line with a Glitch attached to an opponent).',
  'Shere Khan':     'Defeat Mowgli and ensure there is no Fire in your Realm.',
  'Oogie Boogie':   'Defeat Jack Skellington.',
  'Tamatoa':        'Have the Heart of Te Fiti and Maui\'s Hook at Tamatoa\'s Lair.',
  'Davy Jones':     'Collect all 5 Treasure tokens.',
};

let csMode    = 'pct';   // 'pct' | 'count' | 'games'
let csChar    = null;      // character record from DB
let csBuckets = null;      // computed stats per player count
let allChars  = [];        // full character list for search

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  setActiveNav('characters.html');
  await initAuth();

  const params   = new URLSearchParams(location.search);
  const charName = (params.get('char') || '').trim();

  if (!charName) {
    document.title = 'DiVilytics | Characters';

    allChars = await loadCharacters();
    document.getElementById('csSearchWrap').style.display = '';

    const byBox = groupByBox(allChars);
    const root = document.getElementById('csRoot');
    root.className = '';
    root.innerHTML = Object.entries(byBox).map(([box, chars]) => `
      <div class="char-roster-group">
        <div class="char-roster-group-name">${_esc(box)}</div>
        <div class="char-roster">${
          chars.map(c => `
            <a class="char-roster-item" href="characters.html?char=${encodeURIComponent(c.name)}">
              <img class="char-roster-portrait" src="${charImgSrc(c.name)}" alt="" onerror="this.src='asset/player.svg'">
              <div class="char-roster-name">${_esc(c.name)}</div>
            </a>`).join('')
        }</div>
      </div>`).join('');
    return;
  }

  document.title = `DiVilytics | ${charName}`;

  allChars = await loadCharacters();
  csChar   = allChars.find(c => c.name === charName);

  if (!csChar) {
    document.getElementById('csRoot').className = '';
    document.getElementById('csRoot').innerHTML =
      `<div class="empty"><h3>Character not found</h3><p>${_esc(charName)}</p></div>`;
    return;
  }

  // Update identity block
  const csIdentityEl = document.getElementById('csIdentity');
  const objective = OBJECTIVES[csChar.name];
  csIdentityEl.innerHTML =
    `<div class="pf-identity"><img class="char-portrait" style="width:40px;height:40px;flex-shrink:0" src="${charImgSrc(csChar.name)}" alt=""><span class="pf-name-block"><span class="pf-nick">${_esc(csChar.name)}</span><span class="pf-since">${_esc(csChar.box)}</span></span></div>${objective ? `<p class="char-objective">${_esc(objective)}</p>` : ''}`;
  document.getElementById('csSearchWrap').style.display = '';

  // Load bucketed stats via server-side aggregation (one RPC, no row-limit risk)
  const { data: buckets, error } = await db.rpc('character_bucket_stats', { char_name: charName });

  if (error) {
    document.getElementById('csRoot').className = '';
    document.getElementById('csRoot').innerHTML =
      `<div class="empty"><p>Error: ${_esc(error.message)}</p></div>`;
    return;
  }

  if (!buckets || !buckets.length) {
    document.getElementById('csRoot').className = '';
    document.getElementById('csRoot').innerHTML =
      `<div class="empty"><div class="empty-icon">🎭</div><h3>No games yet</h3><p>${_esc(csChar.name)} hasn't been played in any recorded games.</p></div>`;
    return;
  }

  // Build csBuckets from the returned rows
  csBuckets = {
    all: { games: 0, wins: 0 },
    2:   { games: 0, wins: 0 },
    3:   { games: 0, wins: 0 },
    4:   { games: 0, wins: 0 },
    5:   { games: 0, wins: 0 },
    6:   { games: 0, wins: 0 },
  };

  for (const b of buckets) {
    const n = b.player_count;
    const g = Number(b.games);
    const w = Number(b.wins);
    csBuckets.all.games += g;
    csBuckets.all.wins  += w;
    if (n >= 2 && n <= 6) {
      csBuckets[n] = { games: g, wins: w };
    }
  }

  render();
  renderFaq(charName);
}

// ── CONTROLS ──────────────────────────────────────────────────────────────────

function csSetMode(m) {
  csMode = m;
  render();
}

// ── SEARCH / AUTOCOMPLETE ─────────────────────────────────────────────────────

function csSearchInput(e) {
  const val      = e.target.value.trim().toLowerCase();
  const dropdown = document.getElementById('csDropdown');

  if (!val) { dropdown.classList.remove('open'); return; }

  const matches = allChars
    .filter(c => c.name.toLowerCase().includes(val))
    .slice(0, 8);

  if (!matches.length) { dropdown.classList.remove('open'); return; }

  populateSearchDropdown(
    dropdown,
    matches.map(c => `
      <div class="cs-option" data-name="${_esc(c.name)}">
        <img class="char-portrait" src="${charImgSrc(c.name)}" alt="">
        <span>${_esc(c.name)}</span>
        <span class="cs-option-box">${_esc(c.box)}</span>
      </div>`).join(''),
    opt => { location.href = `characters.html?char=${encodeURIComponent(opt.dataset.name)}`; }
  );
}

function csSearchBlur() {
  _handleSearchBlur(document.getElementById('csDropdown'));
}

function csSearchKeydown(e) {
  _handleSearchKeydown(
    e,
    document.getElementById('csDropdown'),
    document.getElementById('csSearchInput'),
    opt => { location.href = `characters.html?char=${encodeURIComponent(opt.dataset.name)}`; }
  );
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function render() {
  const root = document.getElementById('csRoot');
  root.className = '';

  const rows = [
    { label: 'Overall', key: 'all' },
    { label: '2p', key: 2 },
    { label: '3p', key: 3 },
    { label: '4p', key: 4 },
    { label: '5p', key: 5 },
    { label: '6p', key: 6 },
  ];

  const maxVal = Math.max(...rows.map(r => {
    const b = csBuckets[r.key];
    if (!b.games) return 0;
    return csMode === 'count' ? b.wins : csMode === 'games' ? b.games : b.wins / b.games;
  })) || 1;

  root.innerHTML = `
    <div class="controls" style="margin-bottom:1rem">
      <div class="seg">
        <button class="seg-btn ${csMode === 'pct'   ? 'on' : ''}" onclick="csSetMode('pct')">% Wins</button>
        <button class="seg-btn ${csMode === 'count' ? 'on' : ''}" onclick="csSetMode('count')"># Wins</button>
        <button class="seg-btn ${csMode === 'games' ? 'on' : ''}" onclick="csSetMode('games')"># Games</button>
      </div>
    </div>
    <div class="lb-table cs-table" style="margin-bottom:1.25rem">
      <div class="lb-head">
        <span>Players</span>
        <span></span>
        <span style="text-align:right">${csMode === 'count' ? '# Wins' : csMode === 'games' ? '# Games' : '% Wins'}</span>
        <span style="text-align:right">${csMode === 'games' ? '# Wins' : '# Games'}</span>
      </div>
      ${rows.map(r => {
        const b       = csBuckets[r.key];
        const pct     = b.games ? b.wins / b.games : 0;
        const barW    = b.games
          ? Math.round(((csMode === 'count' ? b.wins : csMode === 'games' ? b.games : pct) / maxVal) * 100)
          : 0;
        const dispVal = b.games
          ? (csMode === 'count' ? b.wins : csMode === 'games' ? b.games : Math.round(pct * 100) + '%')
          : '—';
        const secondary = csMode === 'games' ? b.wins : b.games;
        return `
          <div class="lb-row">
            <div class="row-label">${r.label}</div>
            <div class="bar-cell">
              <div class="bar-bg">
                <div class="bar-fill" style="width:${barW}%"></div>
              </div>
            </div>
            <div class="row-val">${dispVal}</div>
            <div class="row-games">${secondary}</div>
          </div>`;
      }).join('')}
    </div>`;
}

// ── CHARACTER FAQ ─────────────────────────────────────────────────────────────

const CHAR_FAQ = {
  'Maleficent': [
    { term: 'Fauna & Dreamless Sleep',          text: 'If Fauna is played to a location with two copies of Dreamless Sleep, only one is discarded.' },
    { term: 'Forest of Thorns & Dreamless Sleep', text: 'If both are present and a Hero with 4+ Strength is played, Forest of Thorns is discarded first, then the Hero takes -2 Strength from Dreamless Sleep.' },
  ],
  'Jafar': [
    { term: 'Abu & Aladdin',     text: 'Neither can take an Item already assigned to the other.' },
    { term: 'Deception',         text: 'Triggers if an opponent has two or more Items, including Fate Items; does not trigger Fate-based Conditions.' },
    { term: 'Hypnotize',         text: "Hypnotized Heroes count as Allies for other players' Conditions and move to the bottom of the board at their current location." },
    { term: "Sorcerer's Power",  text: 'Actions are optional; the card can be played without performing them.' },
  ],
  'Captain Hook': [
    { term: 'Peter Pan', text: 'If revealed first during a Fate action, both cards must be revealed simultaneously.' },
  ],
  'Queen of Hearts': [
    { term: 'Priority',       text: 'Size priority is Enlarged → Shrunken → Normal.' },
    { term: 'Action Coverage', text: 'Shrunken Heroes cover 1 action; Enlarged cover 3.' },
    { term: 'Normal Heroes',  text: 'Do not cover actions if a Shrunken Hero is present at the same location.' },
    { term: 'Fury',           text: 'Can only shrink normal-sized Heroes; cannot normalize Enlarged Heroes.' },
  ],
  'Prince John': [
    { term: 'Set a Trap',          text: 'Moving an Ally is optional, but the Vanquish action is mandatory.' },
    { term: 'Sir Hiss',            text: 'Grants access to a covered action once; cannot be repeated if the Hero is defeated later that turn.' },
    { term: 'Steal from the Rich', text: 'Power returns to Prince John and does not count as "gained" for trigger purposes.' },
    { term: 'Lady Marian',         text: 'If Robin Hood is present, stolen Power returns to the Cauldron, not Prince John.' },
    { term: 'Golden Arrow',        text: 'If the assigned Ally defeats Robin Hood, the player gains 2 Power because Robin Hood is removed before the effect triggers.' },
  ],
  'Evil Queen': [
    { term: 'Black of Night',            text: 'Allows an action at the current location even if it has already been performed.' },
    { term: "First Love's Kiss",         text: 'Playable even without Poison, provided a Hero is in the discard pile.' },
    { term: 'Magic Mirror & Mummy Dust', text: 'Cards/Poison are obtained only after the Fate action concludes.' },
    { term: 'I Will Crush You',          text: 'Can be used even if multiple Heroes occupy the location.' },
  ],
  'Dr. Facilier': [
    { term: 'Despair',        text: 'Triggers when an opponent discards 2+ cards from hand; Effect cards and Vanquished Allies do not count.' },
    { term: 'Shadow Spirits', text: 'Result in the loss of up to 2 Power.' },
    { term: 'Terror',         text: 'Required Power does not need to be gained all at once.' },
  ],
  'Hades': [
    { term: 'Titans',              text: 'Are not Allies and do not trigger Ally-based Conditions.' },
    { term: 'Get Ready to Rumble', text: 'Moving Titans skips intermediate locations and triggers abilities only once.' },
  ],
  'Scar': [
    { term: "I'll Be King",   text: 'Finishes in the discard pile only after the effect ends.' },
    { term: 'Injustice',      text: 'Fate cards can be both discarded, both kept, or one of each.' },
    { term: "Rafiki's Stick", text: "Prevents triggers like Ursula's Arrogance because the Hero is discarded by card effect." },
  ],
  'Ratigan': [
    { term: 'Airship', text: "The Item or Ally must be moved from the Airship's current location." },
  ],
  'Yzma': [
    { term: 'Fate Deck',    text: 'Fate cards can target the deck they were just drawn from.' },
    { term: 'Beauty Sleep', text: 'Yzma chooses to perform any, all, or none of the actions at the start of her next turn.' },
  ],
  'Mother Gothel': [
    { term: 'Egocentric',  text: 'Triggers if an Item, Ally, or Hero with an Item is moved during a Fate action.' },
    { term: 'Flynn Rider', text: 'Mother Gothel gains 2 Trust even if she currently has less than two to lose.' },
  ],
  'Pete': [
    { term: 'Bandit',                    text: 'Each Bandit played via ability must still be paid for individually.' },
    { term: 'Parrot',                    text: 'Retrieving a card from discard is optional.' },
    { term: 'Power Play & Mickey Mouse', text: 'Power Play cannot resolve if Mickey is present unless his removal is part of the Power spending sequence.' },
  ],
  'Gaston': [
    { term: 'As Handsome as Me',  text: 'Extra actions from opponents count toward the four required; must wait for Fate actions to conclude before playing.' },
    { term: 'Beast',              text: 'Forces the movement of any number of Allies to one and only one location.' },
    { term: 'Get Out!',           text: 'Must remove exactly 3 Obstacles.' },
    { term: 'LeFou',              text: 'Mandatory ability; Allies used in Vanquish return to hand.' },
    { term: "Maurice's Invention", text: 'Cannot be played if no Heroes are in the Realm.' },
    { term: 'Mrs. Potts & Chip',  text: 'Moves all Heroes.' },
    { term: 'Take Me Instead',    text: 'Non-Hero revealed cards are reshuffled into the Fate deck.' },
  ],
  'Lady Tremaine': [
    { term: 'Lucifer',         text: 'Heroes sharing his location are Trapped immediately; the Trap remains if Lucifer moves.' },
    { term: 'The Key',         text: 'Playable even if Cinderella is not in play.' },
    { term: 'Stupid Whispers', text: "Can target unplayable cards to cancel Fate; Lady Tremaine chooses the Hero's location, but the Fate-player resolves effects." },
  ],
  'Horned King': [
    { term: 'The Black Cauldron',   text: 'Discard a Cauldron Born from one and only one location.' },
    { term: 'Cauldron Born',        text: "Can only be played by replacing Ancient Soldiers if the Black Cauldron's power is visible." },
    { term: 'Doli',                 text: 'Moves each Hero to one and only one location.' },
    { term: 'The Witches of Morva', text: 'Results in the loss of exactly 2 Power.' },
  ],
  'Syndrome': [
    { term: 'Omnidroid v.10', text: 'Moves to the bottom of the Realm if a Hero takes the Remote; moves to the top and drops the Remote if the Hero is defeated.' },
    { term: 'Teamwork',       text: 'Discard before looking at the top six cards.' },
  ],
  'Lotso': [
    { term: "Woody's Hat", text: 'Applies -1 Strength to all Heroes except Woody; Rex only takes -1 if he is the sole Hero or others move away.' },
  ],
  'Madam Mim': [
    { term: "I'll Make the Rules", text: 'Defeats only one Transformation.' },
    { term: 'Archimedes',          text: "Cannot be played if Merlin's Transformation deck is empty." },
  ],
  'King Candy': [
    { term: 'Glitch',                 text: 'Turn ends immediately upon play.' },
    { term: 'Racing Token',           text: 'Covers actions and prevents their use.' },
    { term: 'Vanellope Von Schweetz', text: "Can only be played at Ralph's location if Ralph is defeated with his Medal assigned." },
  ],
  'Shere Khan': [
    { term: 'Fire Tokens', text: 'Multiple tokens can stack on a single action.' },
    { term: 'Bagheera',    text: 'Requires moving all Heroes and Allies at his location.' },
  ],
  'Oogie Boogie': [
    { term: "It's a Vacation", text: 'If Jack Skellington is discarded, he is treated as a Hero.' },
    { term: 'Sally',           text: "Can be played at Oogie's current location." },
  ],
  'Tamatoa': [
    { term: 'Shiny',       text: 'Conditions based on "Something Shiny" require the action to be covered only by a Hero for certain cards like Trapped to bypass it.' },
    { term: "Maui's Hour", text: 'If the Hook is in hand, it must be assigned to Maui when he is found.' },
  ],
  'Davy Jones': [
    { term: 'Treasure Tokens',  text: 'Heroes are limited to one token; unrevealed tokens return to the reserve if the Hero is defeated.' },
    { term: 'Crew Strength',    text: "Strength modifiers for the Flying Dutchman's Crew and Black Pearl's Crew are dynamic based on the presence of Allies or Heroes." },
    { term: 'Elizabeth Swann',  text: 'Strength increase is cumulative for each subsequent Hero played and does not decrease.' },
    { term: 'The Hunt',         text: 'Moves one and only one Hero.' },
    { term: 'Flying Dutchman',  text: 'Can be used to perform a covered action.' },
  ],
};

function renderFaq(charName) {
  const el = document.getElementById('csFaq');
  if (!el) return;
  const rules = CHAR_FAQ[charName];
  if (!rules || !rules.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="home-faq" style="margin-top:1.5rem">
      <h2 class="home-faq-title">F.A.Q. <span>${_esc(charName)}</span></h2>
      <div class="home-faq-list">
        ${rules.map(r => `<div class="home-faq-item"><strong>${_esc(r.term)}</strong><span>${_esc(r.text)}</span></div>`).join('')}
      </div>
    </div>`;
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();

