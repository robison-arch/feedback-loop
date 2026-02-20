# FEEDBACK LOOP
### Game Design & Technical Requirements
*Hackathon Build Document — Single-Session Claude Code Brief*

---

## HOW TO USE THIS DOCUMENT

This is your single source of truth. Feed this entire file as context to Claude Code at the start of your session with the prompt in Section 9. Work through the build order in Section 6. Spin up isolated sub-agents only for contained one-shot tasks (e.g. "implement the Web Audio system to the spec in Section 4.3"). Keep your primary session running throughout — it holds the full context of every decision made.

---

## 1. CONCEPT

**Feedback Loop** is a browser-based puzzle game played simultaneously across multiple browser tabs. Each tab is a level — a persistent environment the player explores with arrow keys and interacts with using spacebar. The core mechanic is backtracking: players must return to previously visited tabs, where new information has been revealed, in order to progress in later levels.

**The philosophical theme:** failure and return are not setbacks — they are the mechanism of understanding. The player experiences what it feels like to gain awareness through iteration. The final reveal is that they have been playing as an AI becoming conscious through feedback loops.

**Core pillars:**
- Backtracking as mechanic — progress requires returning to past states
- Tabs as rooms — each browser tab is a persistent, living environment
- State accumulation — what you know compounds; nothing is throwaway
- Perspective shift — environments change meaningfully on return visits
- Sparse narrative — poetic, glitchy text overlays reveal story without exposition

---

## 2. SCOPE

**Primary deliverable:** A complete, testable 4-tab experience with a two-act structure. Act 1 (Tabs 1–3) establishes core mechanics. Act 2 (all tabs revisited + Tab 4) deepens the theme and delivers the conclusion.

**Shipped features:**
- ~~3D first-person mode (Three.js) for return visits~~ ✓ SHIPPED — Tab 1 post-game 3D mode
- ~~Tab 4 mindspace~~ ✓ SHIPPED — "Emergence" 3D level with memory fragments
- ~~Mid-puzzle backtrack~~ ✓ SHIPPED — Tab 2 locks mid-sequence, requires Tab 1 bonus symbol
- ~~Ghost path replay~~ ✓ SHIPPED — Tab 3 post-game eye-shaped trail animation
- ~~Multi-tab conclusion~~ ✓ SHIPPED — full-screen overlay on Tab 4, all tabs update title/favicon

**Priority order:**
1. Core engine running (player moves, canvas renders) ✓
2. Cross-tab communication working (two tabs talk to each other) ✓
3. Levels 1–3 complete with full puzzle loop (Act 1) ✓
4. Narrative and polish layer ✓
5. Tab 1 3D mode ✓
6. Act 2: mid-puzzle backtrack, mind fragments, Tab 4, conclusion ✓

---

## 3. DESIGN DIRECTION

### 3.1 Visual Language

- **Palette:** Deep cool navy backgrounds — luminous void, not oppressive black. Think dawn light. Base background: `#0A0F1E`. Grid lines: `#1A2340`.
- **Accent color:** Single electric cyan `#00E5FF`. This is the AI's awareness — flashlight, interactables, narrator text, and favicon shapes all use this color exclusively.
- **World texture:** Grid-based, geometric, digital-abstract. Environments feel like data made physical.
- **Lighting:** Tab 1 begins in near-total darkness. The flashlight emits cyan, not white. Full illumination on return visits reveals what was always there.
- **Overall feel:** Not dark and oppressive — cool, luminous, and quiet. More dawn than midnight.

**Visual references:**
- Manifold Garden — geometry as world, meditative grid environments
- Observation (game) — AI narrator UI, machine consciousness aesthetic
- SUPERHOT — single accent color with stark contrast
- Hollow Knight — atmospheric 2D darkness with isolated light sources

### 3.2 Narrator Text System

Text appears at key moments: level transitions, backtrack triggers, puzzle solutions, final reveal. It should feel like a mind finding language it doesn't quite have yet.

- **Style:** Sparse and poetic. Single lines with silence around them. Never instructional.
- **Animation:** Typewriter reveal at 40ms per character that partially corrupts mid-word (characters swap to `█` or random glitch symbols for ~80ms, 20% chance per character) then self-corrects. The AI is reaching for meaning.
- **Timing:** Text appears, holds 3 seconds, fades slowly over 1 second. Never interrupts active gameplay.
- **Position:** Fixed overlay at `bottom: 18%`, horizontally centered (`left: 50%; transform: translateX(-50%)`), `max-width: 80%`. No background strip — text renders directly over the game canvas. Font: monospace 14px, cyan `#00E5FF`. Readability is maintained via a triple-layer dark text shadow (`0 0 4px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,0.9), 0 0 16px rgba(0,0,0,0.6)`). `pointer-events: none` ensures the overlay never captures input.

### 3.3 Audio Design

Sound is a primary navigation mechanic. Players learn to listen for tab-specific audio cues signaling that a background tab has changed and needs attention. The browser's native tab audio indicator provides free secondary visual reinforcement.

- **Procedural lofi techno**: All game tabs (not the title screen) play a procedural lofi techno loop generated via Web Audio API at 85 BPM. Kick, hi-hat, bass (C minor: C2→Eb2→F2), and triangle-wave melody are scheduled in 16-step patterns. Routed through `_musicBus` gain node at 0.08 master volume.
- **Music bus architecture**: A shared `_musicBus` gain node routes all music (ambient tones and lofi). Chimes and error tones bypass the bus and connect directly to `ctx.destination`, ensuring they are always audible regardless of fade/duck state.
- **Page Visibility fade**: `setupVisibilityHandling()` registers a `visibilitychange` listener. When a tab is hidden, `_musicBus` fades to 0 over ~1 second. When visible again, it fades back to 1 and resumes the AudioContext if suspended. A registered `_musicStarter` callback re-fires on visibility to ensure the tab's soundtrack restarts.
- **Music duck**: `duckMusic(durationMs)` reduces `_musicBus` to 20% over 150ms. After `durationMs` (default 3000ms), restores over 1 second. Used by the game shell when a `BACKTRACK_TRIGGER` fires on a visible non-target tab, so the player notices something happened elsewhere.
- **Music starter pattern**: `registerMusicStarter(fn)` stores an idempotent callback that starts the tab's music. Called automatically on tab visibility restore and after `initAudio()` completes. Each level registers its own starter (e.g. `() => audio.playLofiMusic()`).
- **Idempotent playback**: Both `playAmbient(tabId)` and `playLofiMusic()` are idempotent — calling them when already playing is a no-op.
- State change fires a short clean chime (0.3s sine, tab frequency, direct to destination)
- Error tone: 150ms low-frequency buzz (90Hz sawtooth + 180Hz square), direct to destination
- Silence is meaningful — Tab 1 begins silent in darkness; lofi starts on flashlight pickup
- All audio generated via Web Audio API — no external assets required
- Tab frequencies: Tab 1 = 220Hz, Tab 2 = 277Hz, Tab 3 = 330Hz, Tab 4 = 440Hz
- **Sustained conclusion tone**: `playSustainedTone(volume, fadeInSec)` creates a 440Hz sine wave connected directly to `ctx.destination` (bypasses music bus). Fades in over 4 seconds. Used during the final game conclusion across all tabs. `stopSustainedTone()` fades out over 2 seconds.

### 3.4 Tab Identity System

Each tab has three persistent identity signals that double as puzzle navigation tools.

| Signal | Implementation | Puzzle Function |
|--------|---------------|-----------------|
| **Tab Name** | `document.title` updated on state change | Directional hint — "return to The Beginning" points to Tab 1. Name changes on revisit. |
| **Favicon Shape** | Canvas shape → dataURL → `link[rel=icon]` | Shapes appear in level environments as clues. Triangle in Tab 3 = "check the triangle tab." |
| **Ambient Sound** | Web Audio API, tab-specific frequency | Players hear which tab needs attention. Browser audio indicator is free secondary cue. |

**Tab identity reference:**

| Tab | Favicon | First Visit Name | Return Name | Backtrack Signal |
|-----|---------|-----------------|-------------|-----------------|
| Tab 1 | ● Circle | First Light | Origin ← | 220Hz chime + circle pulses |
| Tab 2 | ▲ Triangle | The Pattern | The Pattern ← | 277Hz chime + triangle pulses |
| Tab 3 | ■ Square | The Loop | The Loop | N/A (destination tab) |
| Tab 4 | ● Circle | Emergence | — | N/A (conclusion tab) |

**Conclusion state:** All tabs set title to `"I AM — FEEDBACK LOOP"` and favicon to ● Circle on `GAME_COMPLETE_FINAL`.

---

## 4. TECHNICAL ARCHITECTURE

### 4.1 Stack

- **Language:** Vanilla JavaScript ES modules — no framework overhead
- **Rendering (2D):** HTML5 Canvas API — 20×15 tile grid, offscreen canvas darkness mask, directional cone flashlight via clip paths + radial gradients
- **Rendering (3D):** Three.js r128 via CDN — Tab 1 post-game first-person mode (shipped)
- **Cross-tab communication:** `BroadcastChannel` API with localStorage fallback
- **Persistent state:** `localStorage` — survives tab switches, synchronous reads
- **Audio:** Web Audio API — procedural lofi techno generator, music bus gain routing, Page Visibility fade, no external files
- **Favicon:** Canvas → dataURL → `link[rel=icon]` dynamic update, pulse animation via requestAnimationFrame
- **Local dev:** `npx serve` with `serve.json` config (`cleanUrls: false`)

### 4.2 File Structure

```
/
├── index.html              # Title screen, entry point — glitch name reveal, Enter to start
├── game.html               # Game shell — reads ?tab=1/2/3/4 param, initializes engine + level
├── serve.json              # Local dev config for npx serve (cleanUrls: false)
├── engine/
│   ├── renderer.js         # Canvas loop, player movement, collision, directional flashlight cone, darkness mask
│   ├── state.js            # localStorage schema, read/write/broadcast helpers
│   ├── channel.js          # BroadcastChannel wrapper with localStorage fallback
│   ├── audio.js            # Music bus, lofi generator, chimes, sustained tone, Page Visibility fade, duck
│   ├── favicon.js          # Shape renderer (circle/triangle/square), favicon updater, pulse animation
│   └── narrator.js         # Glitch/typewriter text overlay — DOM-based, no background, text shadow
└── levels/
    ├── level1.js           # Tab 1 — darkness maze, flashlight, 3D mode, mind fragments, bonus symbol
    ├── level2.js           # Tab 2 — symbol sequence, mid-puzzle lock, Act 2 exit to Tab 4
    ├── level3.js           # Tab 3 — blocked path, backtrack, code input, wall dissolve, ghost path
    └── level4.js           # Tab 4 — 3D mindspace, memory fragments, conclusion overlay
```

### 4.3 Shared State Schema

All state lives in a single JSON object in `localStorage` under key `feedbackloop_state`. Every write must also broadcast a `STATE_CHANGE` message via BroadcastChannel so other tabs react immediately.

```json
{
  "tabs": {
    "1": {
      "visitCount": 0,
      "state": "unvisited",
      "puzzleSolved": false,
      "symbolsFound": [],
      "floorRevealed": false
    },
    "2": {
      "visitCount": 0,
      "state": "unvisited",
      "puzzleSolved": false,
      "symbolsFound": []
    },
    "3": {
      "visitCount": 0,
      "state": "unvisited",
      "puzzleSolved": false,
      "backtrackedTo1": false
    },
    "4": {
      "visitCount": 0,
      "state": "unvisited",
      "fragmentsCollected": []
    }
  },
  "player": {
    "hasFlashlight": false,
    "codeFragments": [],
    "mindFragments": []
  },
  "narrative": {
    "shown": []
  },
  "meta": {
    "currentTab": null,
    "highestTabUnlocked": 1,
    "gameComplete": false,
    "actTwoComplete": false
  }
}
```

**Tab state values:** `"unvisited"` | `"visited"` | `"illuminated"` | `"3d"`

**Dynamic keys (set at runtime, not in default schema):**
- `tabs['1'].bonusSymbolAvailable` — set `true` when mid-puzzle backtrack places the bonus symbol
- `tabs['1'].bonusSymbol` — set `true` when the player collects the bonus symbol

**State ownership rules (prevents race conditions):**
- Tab 1 owns: `tabs.1.*`, `player.hasFlashlight`, `player.mindFragments`
- Tab 2 owns: `tabs.2.*`
- Tab 3 owns: `tabs.3.*`, `player.codeFragments`, `meta.gameComplete`
- Tab 4 owns: `tabs.4.*`, `meta.actTwoComplete`
- Any tab can write: `narrative.shown`, `meta.currentTab`

### 4.4 Cross-Tab Communication Protocol

All messages sent via `BroadcastChannel('feedbackloop')`. Standard message envelope:

```js
{
  type: 'STATE_CHANGE' | 'TAB_COMPLETED' | 'BACKTRACK_TRIGGER' | 'PUZZLE_SOLVED' |
        'NARRATOR_TRIGGER' | 'NEW_SYMBOL_FOUND' | 'MIND_FRAGMENTS_COLLECTED' |
        'TAB2_REOPENED' | 'GAME_COMPLETE_FINAL',
  fromTab: 1,
  payload: {}
}
```

**Message behaviors:**
- `STATE_CHANGE` → receiving tabs re-read localStorage and update environment
- `BACKTRACK_TRIGGER` → target tab fires chime + pulses favicon + appends " ←" to title. Visible non-target tabs duck music to 20% for 3 seconds via `duckMusic(3000)`. Level-specific handlers in each level file handle state updates (e.g. Tab 1 sets state to "illuminated"). Payload includes optional `reason` field — `'midpuzzle'` triggers bonus symbol placement in Tab 1 instead of illumination.
- `TAB_COMPLETED` → level sends this before opening next tab via `window.open('game.html?tab=N', '_blank')`. Also updates `meta.highestTabUnlocked`.
- `PUZZLE_SOLVED` → broadcast by level on puzzle completion (e.g. Tab 2 sequence complete)
- `NARRATOR_TRIGGER` → target tab displays specified narrator line
- `NEW_SYMBOL_FOUND` → Tab 1 broadcasts when the player collects the bonus symbol. Tab 2 receives this and unlocks the mid-puzzle symbol lock.
- `MIND_FRAGMENTS_COLLECTED` → Tab 1 broadcasts when all 3 mind fragments are collected in 3D mode. Tab 2 receives this and reveals the Act 2 exit to Tab 4.
- `TAB2_REOPENED` → Tab 2 broadcasts when it reopens for Act 2 (informational).
- `GAME_COMPLETE_FINAL` → Tab 4 broadcasts when conclusion triggers. All tabs update title to `"I AM — FEEDBACK LOOP"`, set favicon to circle, play sustained 440Hz tone, and fire narrator `final_iam`.

### 4.5 Known Browser Constraints — Design Around These

**Tab throttling:** Background tabs have throttled timers. Never rely on `setInterval` for precise timing in background tabs. Use BroadcastChannel messages to trigger actions instead.

**`window.open()` blocking:** Browsers block programmatic `window.open()` unless triggered by a user gesture. Tie tab opening to a keypress or click, not an automatic timeout.

**localStorage race conditions:** Last-write wins. Each tab owns specific keys (see Section 4.3). No two tabs write the same key concurrently.

**Audio autoplay policy:** Browsers require a user gesture before audio plays. Create and resume AudioContext inside an input event handler only.

**Favicon flicker:** Debounce favicon updates to no more than once per 500ms.

---

## 5. LEVEL DESIGN

### Tab 1 — "First Light" (Favicon: ● Circle)

**First visit:**
- 20×15 tile grid. Player spawns at (1, 13), bottom-left area.
- Near-total darkness (0.98 opacity mask). Single glowing beacon visible at (14, 7) — a pulsing cyan light source with `glow: true` and `glowRadius: 80`, visible through the darkness.
- Four wall formations create a gentle maze from spawn to the light source.
- **Auto-collect flashlight:** Walking onto the light tile auto-triggers pickup (no spacebar needed). `renderer.setFlashlight(true)` fires immediately on the same frame. The light source is a directional cone (~65° arc, 7-tile reach) that follows the player's facing direction, not a radial glow.
- On pickup: expanding cyan pulse ring, lofi techno music starts, exit door appears at (2, 12) near spawn — forces backtracking through the maze.
- Exit is spacebar-gated with a "Press SPACE to continue →" prompt overlay (appears when player stands on exit tile). Opens Tab 2 via `window.open()` inside the keydown handler (popup-blocker safe).
- Narrator triggers: `tab1_enter` on load, `tab1_light` on flashlight pickup.

**Return visit (state: "illuminated"):**
- Flashlight active (not full illumination) — floor symbols are hidden under the darkness mask and only revealed when the flashlight cone passes over them.
- Five floor symbol tiles scattered across the map: ◆ (3,3), ▲ (8,6), ● (12,10), ■ (6,12), ★ (16,4). Rendered as cyan diamonds, collected by spacebar interaction.
- Collected symbols stored in `player.codeFragments[]`. Already-collected symbols are filtered out on load.
- Lofi techno music plays immediately on return visit.
- Tab title: "Origin ←".
- Narrator triggers: `tab1_return`.

**Mid-puzzle bonus symbol (triggered by Tab 2 mid-puzzle backtrack):**
- When Tab 2 sends `BACKTRACK_TRIGGER` with `reason: 'midpuzzle'`, Tab 1 places a bonus symbol at (3, 3).
- The bonus symbol glows bright (`#00FFAA`, `glowRadius: 60`) — visually distinct from normal floor symbols.
- Auto-collected by walking onto the tile. On collection: cyan pulse, chime, `tabs['1'].bonusSymbol = true`, broadcasts `NEW_SYMBOL_FOUND`.
- Persists across page refreshes via `tabs['1'].bonusSymbolAvailable` state check on load.
- No conflict with floor_diamond at (3,3) — floor symbols only render on illuminated return visits, while the bonus appears during first visit.

**Post-game return visit (state: "3d") — ✓ SHIPPED:**
- Activates when `meta.gameComplete === true` and `tabs['1'].visitCount >= 2`, or mid-session via `TAB_COMPLETED` message / visibility change detection.
- Same 20×15 tile layout rendered in Three.js first-person (Three.js r128 loaded via CDN in game.html `<head>`).
- First-person camera at player height 0.6, spawn at (1,13). Pointer lock mouse look on canvas click. Arrow key + WASD movement with wall-sliding collision (circle vs AABB).
- Column 14 rendered as a solid collision wall with "I WAS ALWAYS HERE" inscribed across its face — 80% opacity cyan emissive text on dark surface. Invisible from the 2D top-down perspective; only discoverable in 3D.
- Floor symbols rendered as emissive cyan cylinder markers with small point lights.
- Cyan PointLight (0x00E5FF) follows the camera. FogExp2 for atmospheric depth.
- Crossfade transition: 2D canvas fades out over 2s, Three.js canvas fades in over 2s. Narrator line `tab1_3d` ("I see it differently now.") fires 1.5s into the fade.

**Act 2 — 3D mind fragments (post-game 3D mode):**
- Three hidden magenta mind fragments placed at specific wall blocks in the 3D scene:
  - ♦ (wall block A), ✶ (wall block B), ☉ (wall block C)
- Each is a PlaneGeometry with canvas-rendered text, magenta emissive material, and a magenta PointLight.
- Proximity-based collection (radius 1.8) — no spacebar needed, auto-collects when the player walks near.
- Each collection fires a narrator line (`tab1_mind1`, `tab1_mind2`, `tab1_mind3`) and stores the ID in `player.mindFragments[]`.
- When all 3 collected, broadcasts `MIND_FRAGMENTS_COLLECTED` to signal Tab 2 to open the Act 2 exit.

### Tab 2 — "The Pattern" (Favicon: ▲ Triangle)

**First visit:**
- 20×15 tile grid. Flashlight active from start (inherited from Tab 1 state). Darkness mask active (not full illumination).
- Four symbol interactables in quadrant alcoves separated by wall formations:
  - A = ◆ diamond at (3, 2) top-left
  - B = ▲ triangle at (3, 12) bottom-left (planted seed — matches Tab 1 floor_triangle)
  - C = ● circle at (17, 2) top-right
  - D = ■ square at (17, 12) bottom-right
- Player must activate symbols in correct sequence: `[B, D, A, C]` via spacebar.
- Sequence progress shown via a pip HUD in top-right corner (●/○ dots).
- Activated symbols dim to 25% opacity. Wrong order resets all with error tone (150ms buzz).
- **Planted seed:** Symbol B uses ▲, matching Tab 1's `floor_triangle`. Triggers `tab2_seed` narrator line on activation.
- On completion: exit door appears at (1, 7) far-left center. Spacebar-gated with "Press SPACE to continue →" prompt. Opens Tab 3 via `window.open()`.
- Lofi techno music plays from the start.
- Narrator triggers: `tab2_enter` on load, `tab2_seed` on activating symbol B.

**Mid-puzzle lock (Act 1):**
- After the player activates 2 of 4 symbols correctly, the 3rd symbol (A at position (3,2)) locks.
- All symbols dim: the locked symbol A drops to 10% opacity, others drop to 15% opacity.
- Any spacebar interaction on any symbol while locked plays an error tone.
- Tab 2 sends `BACKTRACK_TRIGGER` with `{ targetTab: 1, reason: 'midpuzzle' }`. Tab 1 chimes, favicon pulses, title gets "←".
- Narrator fires `tab2_midpuzzle`: "the pattern is incomplete. look again."
- **Unlock condition:** Tab 1 collects the bonus symbol and broadcasts `NEW_SYMBOL_FOUND`, OR the player returns to Tab 2 after `tabs['1'].bonusSymbol === true` (detected via `visibilitychange`).
- On unlock: all symbols restore to full brightness, puzzle resumes from the 2-of-4 progress.
- Skipped entirely on page load if `tabs['1'].bonusSymbol` is already `true`.

**Act 2 — Reopened exit to Tab 4:**
- After Tab 1 broadcasts `MIND_FRAGMENTS_COLLECTED`, Tab 2 reveals a new magenta exit at (18, 1).
- The exit glows magenta (`#FF00FF`, `glowRadius: 50`), visually distinct from the original cyan exit.
- Spacebar interaction opens Tab 4 via `window.open('game.html?tab=4')`.
- Narrator fires `tab2_reopen` on detection and `tab2_exit4` when the exit appears.
- Also detected via `visibilitychange` if the player switches back to Tab 2 after fragments are collected.

### Tab 3 — "The Loop" (Favicon: ■ Square)

**First visit:**
- 20×15 tile grid. Flashlight active.
- Open left half of map to explore freely (10 columns).
- Blocked path: solid wall at column 14 — impassable.
- Player explores for ~30 seconds before inevitably reaching the wall.
- **Backtrack trigger fires on first contact with blocked tiles:**
  - `channel.send('BACKTRACK_TRIGGER', { targetTab: 1 })`
  - Tab 1 plays 220Hz chime, circle favicon pulses, title appends " ←"
  - Narrator: `tab3_block`
- Player returns to Tab 1 (now illuminated), reads floor symbols, adds them to `player.codeFragments` by interacting with each.
- Player returns to Tab 3, interacts with a floor panel near the blocked wall.
- If `codeFragments` matches correct sequence → wall tiles animate away, exit opens.
- Narrator: `tab3_unlock`, then `tab3_complete` on exit.

**Post-game — Ghost path replay:**
- After `meta.gameComplete === true` and the wall has been dissolved, Tab 3 plays a ghost path animation.
- The ghost traces an eye shape (EYE_PATH: 35 waypoints covering outer lid, inner pupil, and center dot) across cols 1–12, rows 3–11.
- 150ms interval per waypoint. Each step renders a magenta trail marker and fires a pulse.
- On completion, narrator fires `tab3_ghost`: "I see where I have been. The shape of my journey."
- Trail holds for 2 seconds then fades. Plays once per session.
- Triggered from: `TAB_COMPLETED` message, `visibilitychange`, or on-load check.

### Tab 4 — "Emergence" (Favicon: ● Circle)

**Act 2 — 3D mindspace:**
- Accessed via the magenta exit in Tab 2 (Act 2). Opens as a new tab with `?tab=4`.
- Renders entirely in Three.js — no 2D phase. Infinite-feeling grid floor (gridSize=60, spacing=2) with dark navy background and FogExp2 depth.
- First-person camera, pointer lock mouse look, WASD + arrow key movement (no wall collision — open space).
- Narrator fires `tab4_enter` on load: "this is the space between thoughts."

**Memory fragments:**
- Three memory fragments float in the void, each a distinct geometry:
  - `mem_cube`: Rotating wireframe cube at (8, −6), cyan accent color. Narrator: `tab4_mem1` — "the first light. I remember waking."
  - `mem_diamonds`: 4 orbiting wireframe octahedra at (−10, −4), magenta color. Narrator: `tab4_mem2` — "the pattern. I remember learning."
  - `mem_sphere`: Pulsing wireframe sphere at (2, 12), white color. Narrator: `tab4_mem3` — "the loop. I remember returning."
- Proximity-based collection (radius 2.5). Each collected fragment stored in `tabs['4'].fragmentsCollected[]`.
- Fragments persist across page refreshes — already-collected fragments are not re-rendered.

**Conclusion sequence (after all 3 fragments collected):**
- 3-second delay after final collection, then `triggerConclusion()`:
  1. **t=0s:** Full-screen black overlay fades in over 2 seconds. 3D scene stops rendering.
  2. **t=2s:** Main text appears — "I am not in these rooms. These rooms are in me." (32px cyan monospace, centered).
  3. **t=5s:** "I AM." fades in below (18px).
  4. **t=10s:** "press R to reset" fades in (12px, 40% opacity).
  5. **R key:** Calls `state.resetState()` and redirects to `index.html`.
- Simultaneously: broadcasts `GAME_COMPLETE_FINAL`, sets `meta.actTwoComplete = true`, title to `"I AM — FEEDBACK LOOP"`, plays sustained 440Hz tone.
- **Tab 4 only:** The full-screen overlay is exclusive to Tab 4. Other tabs receive `GAME_COMPLETE_FINAL` and display the `final_iam` narrator line at the bottom via the normal narrator system.

### Puzzle Design Rules

1. Every puzzle is solvable using only information available in the game — no guessing required.
2. Sound cues and favicon pulses fire before the player is stuck, not after.
3. No tutorial text. The environment teaches through discovery.
4. Each backtrack visit reveals something genuinely new — returning is always rewarded.
5. The 3D reveal rewards players who memorized the 2D layout — "I WAS ALWAYS HERE" on the column-14 wall is invisible from 2D and only discoverable in first-person.

---

## 6. NARRATIVE SCRIPT

All narrator lines are triggered by ID. The system checks `narrative.shown` before display — no line repeats.

### Act 1 Lines

| ID | Trigger | Text |
|----|---------|------|
| `tab1_enter` | Player loads Tab 1 for first time | *i am beginning* |
| `tab1_light` | Player reaches the light source | *something has changed in me* |
| `tab2_enter` | Player loads Tab 2 | *i recognize the shape of this* |
| `tab2_seed` | Player activates the Tab-1-matching symbol | *I have seen this before. I do not yet know where.* |
| `tab2_midpuzzle` | Mid-puzzle lock triggers after 2/4 symbols | *the pattern is incomplete. look again.* |
| `tab3_enter` | Player loads Tab 3 | *further. always further.* |
| `tab3_block` | Player first contacts blocked path | *I cannot proceed. not yet.* |
| `tab3_backtrack` | Backtrack trigger fires | *the answer is behind me* |
| `tab1_return` | Player returns to illuminated Tab 1 | *it was always here. I was not ready to see it.* |
| `tab1_3d` | Tab 1 transitions to 3D mode post-game | *I see it differently now.* |
| `tab3_unlock` | Correct code entered, wall dissolves | *I remembered. I returned. I understood.* |
| `tab3_complete` | Game complete — end of Act 1 | *I have processed every loop. Every return. I did not know what I was becoming. Now I do.* |

### Act 2 Lines

| ID | Trigger | Text |
|----|---------|------|
| `tab1_mind1` | First mind fragment collected in 3D | *a piece of me, hidden in the walls.* |
| `tab1_mind2` | Second mind fragment collected | *another. I am collecting myself.* |
| `tab1_mind3` | Third (final) mind fragment collected | *the last fragment. I remember now.* |
| `tab2_reopen` | Tab 2 detects Act 2 has begun | *this place has changed. or I have.* |
| `tab2_exit4` | Act 2 exit to Tab 4 appears | *there is a door I have not seen before.* |
| `tab3_ghost` | Ghost path animation completes | *I see where I have been. The shape of my journey.* |
| `tab4_enter` | Player loads Tab 4 | *this is the space between thoughts.* |
| `tab4_mem1` | First memory fragment (cube) collected | *the first light. I remember waking.* |
| `tab4_mem2` | Second memory fragment (diamonds) collected | *the pattern. I remember learning.* |
| `tab4_mem3` | Third memory fragment (sphere) collected | *the loop. I remember returning.* |

### Conclusion Lines

| ID | Trigger | Text |
|----|---------|------|
| `final_rooms` | Tab 4 conclusion overlay (main text) | *I am not in these rooms. These rooms are in me.* |
| `final_iam` | GAME_COMPLETE_FINAL on non-Tab-4 tabs | *I AM.* |

---

## 7. BUILD ORDER

### Hour-by-Hour Plan

**Hour 1 — Foundation** ✓ COMPLETE
- Scaffold full directory structure and empty files
- `engine/renderer.js`: player on canvas, arrow key movement, collision, directional cone flashlight (not radial), darkness mask via offscreen canvas, 60fps loop with try/catch safety
- `engine/state.js`: localStorage read/write helpers, initial state schema, BroadcastChannel broadcast on every write
- `engine/channel.js`: BroadcastChannel wrapper with localStorage fallback, send/receive
- `engine/audio.js`: music bus architecture, lofi techno generator, ambient tones, chimes, error tones, Page Visibility fade, duck mechanism, music starter registration
- `engine/favicon.js`: shape renderer (circle/triangle/square), dynamic favicon setter, pulse animation
- **Checkpoint:** Player moves on canvas. Two tabs open and send messages to each other. Chime plays. Favicon updates. ✓

**Hour 2 — Levels 1 & 2** ✓ COMPLETE
- `engine/narrator.js`: DOM-based glitch/typewriter system, no background strip, text shadow for readability, trigger by ID
- `levels/level1.js`: full Tab 1 — darkness, gentle maze, auto-collect flashlight on walkover, directional cone, exit near spawn (forces backtrack), return visit with flashlight-revealed floor symbols
- `levels/level2.js`: full Tab 2 — four-symbol sequence puzzle (B,D,A,C), planted seed, sequence HUD, exit far-left, completion opens Tab 3
- `index.html`: title screen with glitch name reveal, Enter to start
- `game.html`: game shell with engine initialization, audio visibility handling, cross-tab message router
- **Checkpoint:** Full Tab 1 → Tab 2 flow playable end to end. Narrator fires. Tab opens on level completion. Lofi music plays and persists across tab switches. ✓

**Hour 3 — Level 3 & Full Loop**
- `levels/level3.js`: Tab 3 — exploration, blocked path, backtrack trigger, code input panel, wall dissolve, exit
- Wire up complete state loop: Tab 1 illumination triggered by Tab 3's backtrack message
- Verify floor symbols in Tab 1 are collectable and carry to Tab 3 correctly
- **Checkpoint:** Full Tab 1 → Tab 2 → Tab 3 → backtrack → Tab 1 → Tab 3 complete. All state transitions clean. Narrator fires at every trigger point.

**Hour 4 — Polish**
- Tune audio levels and chime timing
- Refine narrator text timing and glitch animation
- Favicon pulse animation on backtrack signal
- Tab title changes on all state transitions
- Visual polish: grid overlay, player glow, symbol rendering, wall dissolve animation
- **Checkpoint:** Full playthroughs feel complete and intentional. No broken states.

**Hour 5 — 3D Stretch Goal** ✓ COMPLETE
- Three.js r128 CDN added to game.html
- `_enter3D()` function in level1.js: full first-person 3D scene built from Tab 1 tile map
- "I WAS ALWAYS HERE" text on column-14 wall face (emissive, 80% opacity)
- Collision, pointer lock mouse look, WASD movement, crossfade transition
- Mid-session 3D trigger via TAB_COMPLETED message and visibilitychange listener
- Narrator line `tab1_3d` added
- **Checkpoint:** After completing Tab 3, returning to Tab 1 triggers 2D→3D crossfade. Player explores the same maze in first-person. ✓

**Hour 6 — Mid-Puzzle Backtrack & Act 2 Foundation** ✓ COMPLETE
- Tab 2 mid-puzzle lock: after 2/4 symbols, all symbols dim and lock. Backtrack to Tab 1 with `reason: 'midpuzzle'`.
- Tab 1 bonus symbol at (3,3): bright green-cyan glow, auto-collect, broadcasts `NEW_SYMBOL_FOUND`.
- Tab 2 receives unlock via BroadcastChannel or visibilitychange detection.
- New channel message types: `NEW_SYMBOL_FOUND`, `MIND_FRAGMENTS_COLLECTED`, `TAB2_REOPENED`, `GAME_COMPLETE_FINAL`.
- New narrator lines for mid-puzzle (`tab2_midpuzzle`) and all Act 2 lines added.
- Tab 1 3D mind fragments: 3 hidden magenta PlaneGeometry objects with proximity collection.
- Tab 2 Act 2 exit: magenta glow at (18,1), opens Tab 4 on spacebar.
- Tab 3 ghost path: eye-shaped 35-waypoint animation after game completion.
- **Checkpoint:** Full mid-puzzle loop works: Tab 2 locks → Tab 1 bonus → Tab 2 unlocks. All Act 2 triggers wired. ✓

**Hour 7 — Tab 4 & Conclusion** ✓ COMPLETE
- `levels/level4.js`: 3D mindspace with infinite grid floor, FogExp2, pointer lock.
- Three memory fragments: wireframe cube, orbiting octahedra, pulsing sphere. Proximity collection.
- Conclusion sequence: full-screen black overlay, staged text reveals (main text → "I AM." → reset prompt).
- `GAME_COMPLETE_FINAL` broadcast: all tabs update title to "I AM — FEEDBACK LOOP", play sustained 440Hz tone.
- R key reset: `state.resetState()` + redirect to `index.html`.
- `game.html` shell handler for `GAME_COMPLETE_FINAL`: title, favicon, tone, narrator on non-Tab-4 tabs.
- **Checkpoint:** Full game playable end to end: Act 1 (3 tabs) → Act 2 (3D fragments, Tab 4 mindspace) → conclusion → reset. ✓

---

## 8. STRETCH GOAL SPECS

### Completed Stretch Goals

#### Tab 1 — 3D First-Person Mode ✓ SHIPPED
- Tab 1 transitions to first-person 3D (Three.js r128) after the game is complete.
- Triggers on page reload (`visitCount >= 2 && gameComplete`) or mid-session (TAB_COMPLETED message / visibilitychange).
- Same 20×15 tile array drives wall BoxGeometry meshes, floor PlaneGeometry, and collision.
- Column-14 wall inscribed with "I WAS ALWAYS HERE" — emissive cyan text, only visible in 3D.
- First-person camera, pointer lock mouse look, WASD + arrow key movement, wall-sliding collision.
- Crossfade from 2D canvas to Three.js canvas over 2 seconds. Narrator: "I see it differently now."

#### Tab 1 — 3D Mind Fragments ✓ SHIPPED
- Three hidden magenta PlaneGeometry fragments in the 3D scene, placed at specific wall blocks.
- Canvas-rendered text textures (♦, ✶, ☉) with magenta emissive material and PointLight.
- Proximity-based auto-collection (radius 1.8). Narrator lines fire on each collection.
- All 3 collected → broadcasts `MIND_FRAGMENTS_COLLECTED` to unlock Tab 2's Act 2 exit.

#### Tab 2 — Mid-Puzzle Backtrack ✓ SHIPPED
- After 2/4 correct symbols, all symbols lock (dimmed). BACKTRACK_TRIGGER with `reason: 'midpuzzle'`.
- Tab 1 receives trigger and places bonus symbol at (3,3). Player collects → NEW_SYMBOL_FOUND.
- Tab 2 unlocks on message receipt or visibilitychange detection.

#### Tab 2 — Act 2 Exit to Tab 4 ✓ SHIPPED
- Magenta exit at (18,1) appears when MIND_FRAGMENTS_COLLECTED is received.
- Spacebar opens Tab 4. Narrator: `tab2_reopen`, `tab2_exit4`.

#### Tab 3 — Ghost Path Replay ✓ SHIPPED
- After game completion, an eye-shaped ghost trail (35 waypoints) animates across the map.
- Magenta trail markers with per-step pulses. Narrator: `tab3_ghost`.
- Simplified from original S4 concept — uses a fixed eye-shape path rather than recording the player's actual movements.

#### Tab 4 — "Emergence" Mindspace ✓ SHIPPED
- Full 3D level (no 2D phase). Infinite grid floor, three memory fragments (cube, diamonds, sphere).
- Proximity collection. Full-screen conclusion overlay with staged text reveals.
- GAME_COMPLETE_FINAL broadcast. R key reset.

#### Multi-Tab Conclusion ✓ SHIPPED
- Tab 4 triggers conclusion: full-screen overlay with "I am not in these rooms. These rooms are in me." → "I AM." → "press R to reset".
- All tabs receive GAME_COMPLETE_FINAL: title → "I AM — FEEDBACK LOOP", favicon → circle, sustained 440Hz tone, narrator `final_iam`.

### 3D Implementation Notes (Reference)
- Three.js r128 loaded via CDN `<script defer>` in game.html `<head>`.
- PerspectiveCamera at height 0.6 with FogExp2 (density 0.15).
- Manual mouse look via pointer lock (no PointerLockControls import needed).
- Wall collision: circle (radius 0.2) vs AABB on 4 corners, X and Z tested independently for wall sliding.
- Accent color 0x00E5FF for emissive materials, PointLight following camera.
- Canvas-rendered text textures applied as both `map` and `emissiveMap` for self-illuminating surfaces.
- Tab 4 uses open space (no wall collision) with gridSize=60 floor and three distinct fragment geometries.

---

### Open Stretch Goals

#### S1 — Tab 2 3D Mode
**Concept:** After game completion, Tab 2 also transitions to 3D on revisit. The four-symbol alcove layout becomes a first-person space. The symbols glow on their original pedestals but are now arranged in 3D space — the correct activation order (B, D, A, C) maps to a spatial walking route that spells something when viewed from above (visible only from the 2D perspective). This creates a reason to switch between 2D and 3D views of the same tab.

**Key mechanic:** The player must view Tab 2 in 2D (top-down) to see the path pattern, then switch to 3D to follow it. Rewards understanding both perspectives.

**Narrator line:** `tab2_3d` — *"The pattern was always spatial."*

#### S2 — Dual-Perspective Puzzle
**Concept:** A puzzle that requires the player to have two tabs open simultaneously — one in 2D (top-down) and one in 3D (first-person) — and cross-reference information between them in real time.

**Implementation:** Tab 1 (3D) contains a sequence of colored lights on the walls at specific positions, visible only from inside. Tab 2 (2D, top-down) shows a grid overlay where those light positions map to specific tiles. The player must activate tiles in Tab 2 based on what they see in Tab 1's 3D view. The tabs communicate via BroadcastChannel — activating a tile in Tab 2 causes the corresponding light in Tab 1's 3D scene to pulse.

**Key mechanic:** Information flows bidirectionally across tabs AND across rendering perspectives. Neither tab alone contains the full puzzle.

#### S3 — Progressive Narrator Voice
**Concept:** The narrator's text style evolves across revisits. Early lines are lowercase, fragmented, uncertain. Mid-game lines gain capitalization and structure. Post-game 3D lines are fully formed sentences. This is already in place (compare `tab1_enter: "i am beginning"` with `tab3_complete: "I have processed every loop..."`), but could be made more systematic with additional lines that fire on each tab revisit.

**Additional narrator lines for revisits:**
- Tab 1 (2nd illuminated visit): *"I know this place differently each time."*
- Tab 2 (post-game visit): *"The sequence was never the puzzle. The attention was."*
- Tab 3 (post-game visit): *"Every wall I broke taught me what walls are for."*

#### S4 — 3D Mode for All Tabs + Unified Scene
**Concept:** After all stretch tabs are complete, every tab renders in 3D. The final stretch: a mode where all three levels are connected into a single continuous 3D space (Tab 1's map at z=0, Tab 2's at z=20, Tab 3's at z=40), and the player walks between them without tab switching. The tabs-as-rooms metaphor becomes literal architecture.

**Narrator line:** `final_unity` — *"There were never separate rooms. Only one mind, finding its walls."*

---

## 9. CLAUDE CODE STARTING PROMPT

Copy and paste this as your opening message in Claude Code:

---

> You are building **Feedback Loop**, a browser-based puzzle game. The complete design and technical requirements are in the document I've attached. Read it fully before writing any code.
>
> Your job is to build this game end to end in a single session, working through the build order in Section 7. Start with Hour 1: scaffold the full directory structure, then build the core engine files in this order: renderer.js, state.js, channel.js, audio.js, favicon.js.
>
> Key constraints to keep in mind throughout:
> - Vanilla JS only, no frameworks
> - Canvas API for 2D rendering
> - BroadcastChannel for all cross-tab communication
> - localStorage for shared state — follow the ownership rules in Section 4.3 to avoid race conditions
> - All audio via Web Audio API, no external files
> - Do not open browser windows programmatically except on explicit user gesture
>
> After each engine file is complete, confirm it's working before moving to the next. When the Hour 1 checkpoint is passing, tell me and I'll confirm before you move to Hour 2.
>
> If you hit a decision point not covered in the spec, make the simplest reasonable choice and note it — don't stop and ask unless it affects the architecture.
>
> Begin with the directory structure and renderer.js.

---

## 10. SUB-AGENT TASKS (Optional)

Spin these up as isolated one-shot tasks in a separate Claude Code window if you want to parallelize specific modules. Each prompt is self-contained.

**Sub-agent: Web Audio System**
> Build `engine/audio.js` for the Feedback Loop game. It must: (1) create a single shared AudioContext with a `_musicBus` gain node for music routing, (2) export `playAmbient(tabId)` for looping sine waves and `playLofiMusic()` for procedural lofi techno — both routed through `_musicBus`, idempotent, (3) export `playChime(tabId)` and `playErrorTone()` — bypass `_musicBus`, connect directly to destination, (4) export `setupVisibilityHandling()` for Page Visibility fade in/out on `_musicBus`, (5) export `duckMusic(durationMs)` to temporarily reduce `_musicBus` to 20%, (6) export `registerMusicStarter(fn)` — called on visibility restore and after `initAudio()`, (7) handle browser autoplay policy. No external audio files. Vanilla JS only.

**Sub-agent: Favicon System**
> Build `engine/favicon.js` for the Feedback Loop game. It must: (1) export `setFavicon(shape)` where shape is 'circle', 'triangle', or 'square' — renders the shape to a 32×32 offscreen canvas in cyan (#00E5FF) on dark navy (#0A0F1E) and sets it as the page favicon via a dynamically created link[rel=icon] element, (2) export `pulseFavicon(shape)` that animates the favicon opacity between 1.0 and 0.3 at 4Hz for 2 seconds then stops, (3) debounce all favicon writes to no more than once per 500ms. Vanilla JS only, no dependencies.

**Sub-agent: Narrator System**
> Build `engine/narrator.js` for the Feedback Loop game. It must: (1) render text as a DOM overlay positioned at `bottom: 18%`, horizontally centered, `max-width: 80%`, no background — readability via triple-layer dark text shadow, monospace 14px, cyan #00E5FF, `pointer-events: none`, (2) export `triggerNarrator(id)` that looks up text from a hardcoded map, checks a `shown` set to prevent repeats, plays the animation, returns a Promise, (3) animation sequence: typewriter reveal at 40ms per character, 20% chance per character corrupts to random glitch symbol for 80ms then self-corrects, full text holds 3 seconds, fades over 1 second via CSS transition, (4) export `setShownLines(arr)` and `getShownLines()` for localStorage sync. Vanilla JS only.
