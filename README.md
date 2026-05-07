# DiVilytics | Disney Villainous Analytics

Analytics and tracking platform for **Disney Villainous** board game sessions. Players log games, track win rates, and compare character performance across a shared community database.

## Stack

- **Frontend**: Vanilla JS + HTML + CSS (no framework)
- **Backend**: Supabase (PostgreSQL + Auth)
- **Auth**: Discord OAuth
- **Hosting**: GitHub Pages (static)

## File Map

| File | Purpose |
|------|---------|
| `index.html / index.js` | Home page, global stats |
| `games.html / games.js` | Browse/filter game history |
| `leaderboard.html / leaderboard.js` | Player & character rankings |
| `character.html / character.js` | Per-character stats by player count |
| `player.html / player.js` | Player profile, game history, per-character breakdown |
| `account.html / account.js` | Settings, avatar management |
| `join.html / join.js` | QR-based game claiming |
| `draw.html / draw.js` | Character randomizer |
| `db.js` | Supabase client init, character list loader |
| `shared.js` | Auth logic, nickname modal, UI helpers |
| `ui.js` | Formatting, theming, grid builders |
| `style.css` | All styling (dark/light theme, responsive) |
| `asset/characters/*.webp` | 26 villain portraits |
| `asset/players/*.jpeg` | 19 player avatar options |

## Database Schema

### `profiles`
```
id              UUID  (auth user ID)
nickname        TEXT  (unique, immutable; denormalized into game_players on change)
avatar_url      TEXT  (custom Discord avatar)
default_avatar  TEXT  (fallback icon path from asset/players/)
created_at      TIMESTAMPTZ
```

### `characters`
```
id          UUID/INT
name        TEXT  (e.g. "Maleficent", "Jafar", "Ursula")
box         TEXT  (expansion: "The Worst Takes It All", "Wicked to the Core", "Perfectly Wretched", …)
sort_order  INT
```
26 villains total across all expansions.

### `games`
```
id                UUID
created_by        UUID  → profiles.id
played_at         TIMESTAMPTZ
duration_minutes  INT   (nullable)
num_turns         INT   (nullable)
location          TEXT  (nullable)
```

### `game_players`
```
id          UUID
game_id     UUID  → games.id
user_id     UUID  → profiles.id
nickname    TEXT  (denormalized snapshot)
character   TEXT  (villain name)
position    INT   (seating order)
is_winner   BOOLEAN
created_at  TIMESTAMPTZ
```

## Database Views

| View | Description |
|------|-------------|
| `player_stats` | Per-player aggregates: wins, games, win rate |
| `player_stats_by_size` | Same, filtered by `player_count` |
| `character_stats` | Per-character aggregates |
| `character_stats_by_size` | Same, filtered by `player_count` |

## RPC Functions

| Function | Description |
|----------|-------------|
| `character_bucket_stats(char_name)` | Win/game counts bucketed by player count (2-6 + all) |
| `game_stats(player_count_filter?)` | Global stats: total games, avg duration, avg turns |
| `get_game_page(char_filter, count_filter, offset, size)` | Paginated game list |
| `get_game_count(char_filter, count_filter)` | Total games matching filters |

## Key Domain Details

- Games support **2–6 players**; all stats are segmented by player count
- Stats toggle: **Win % / # Wins / # Games** (shared UI pattern across leaderboard, player, character pages)
- Nicknames are **set once at signup** but can be updated; update retroactively patches `game_players.nickname`
- **Player count buckets** used everywhere: `2 | 3 | 4 | 5 | 6 | all`

## Auth Flow

1. Discord OAuth via Supabase
2. On first login: nickname modal (`shared.js`)
3. Avatar: choose from 19 presets
4. Profile page shareable via QR code
