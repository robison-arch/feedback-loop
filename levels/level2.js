/**
 * levels/level2.js — Tab 2 "The Pattern"
 *
 * First visit: flashlight active (inherited from Tab 1), four symbol
 *              interactables scattered around the map. Player must
 *              activate them in the correct sequence: B, D, A, C.
 *              One symbol (B = triangle) matches a floor symbol from Tab 1.
 *              On completion, exit opens to Tab 3.
 */

// ── Wall map (15 rows x 20 cols) ───────────────────────────────────────────
// Four alcove areas separated by wall formations, one symbol per alcove.
// Center corridor connects them all. More open than Tab 1.
const WALL_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],  // row 0
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // row 1
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // row 2
  [1,0,0,0,0,0,1,1,1,0,0,0,1,1,1,0,0,0,0,1],  // row 3
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 4
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 5
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // row 6
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // row 7  — center corridor
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // row 8
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 9
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 10
  [1,0,0,0,0,0,1,1,1,0,0,0,1,1,1,0,0,0,0,1],  // row 11
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // row 12
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // row 13
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],  // row 14
];

// ── Symbol interactables ────────────────────────────────────────────────────
// Four symbols labelled A, B, C, D in four quadrant alcoves.
// Correct activation order: B, D, A, C
//
// Symbol B uses the triangle glyph (▲), matching Tab 1's floor_triangle.
// This is the "planted seed" — the player has seen this shape before.
const SYMBOLS = [
  { col: 3,  row: 2,  label: 'A', id: 'sym_A', type: 'symbol', symbol: '\u25C6', color: '#00E5FF' },  // top-left  — ◆ diamond
  { col: 3,  row: 12, label: 'B', id: 'sym_B', type: 'symbol', symbol: '\u25B2', color: '#00E5FF' },  // bot-left  — ▲ triangle (planted seed)
  { col: 17, row: 2,  label: 'C', id: 'sym_C', type: 'symbol', symbol: '\u25CF', color: '#00E5FF' },  // top-right — ● circle
  { col: 17, row: 12, label: 'D', id: 'sym_D', type: 'symbol', symbol: '\u25A0', color: '#00E5FF' },  // bot-right — ■ square
];

// Correct activation sequence
const CORRECT_SEQUENCE = ['B', 'D', 'A', 'C'];

// The planted seed label — activating this triggers a special narrator line
const PLANTED_SEED_LABEL = 'B';

// ── Exit position (far left — player traverses full level after solving) ────
const EXIT_COL = 1;
const EXIT_ROW = 7;

// ── Exported init function ─────────────────────────────────────────────────

/**
 * @param {object} renderer  — the renderer module
 * @param {object} state     — the state module
 * @param {object} channel   — the channel module
 * @param {object} audio     — the audio module
 * @param {object} favicon   — the favicon module
 * @param {object} narrator  — the narrator module
 */
export function init(renderer, state, channel, audio, favicon, narrator) {
  const tabNum = 2;
  const currentState = state.getState();

  // ── Set favicon and title ──────────────────────────────────────────────
  favicon.setFavicon('triangle');
  document.title = 'The Pattern';

  // ── Set wall map ───────────────────────────────────────────────────────
  renderer.setMap(WALL_MAP);

  // ── Player start position ──────────────────────────────────────────────
  renderer.setPlayerPosition(1, 13);

  // ── Flashlight inherited from Tab 1 ────────────────────────────────────
  const hasFlashlight = currentState.player.hasFlashlight;
  renderer.setFlashlight(hasFlashlight);
  renderer.setFullIllumination(false);

  // ── Start lofi music and register as persistent soundtrack ─────────────
  if (audio.playLofiMusic) {
    audio.playLofiMusic();
    audio.registerMusicStarter(() => audio.playLofiMusic());
  }

  // ── Trigger entry narrator ─────────────────────────────────────────────
  if (narrator && narrator.triggerNarrator) {
    narrator.triggerNarrator('tab2_enter');
  }

  // ── Puzzle state ───────────────────────────────────────────────────────
  let activatedSequence = [];   // labels activated in order
  let puzzleSolved = currentState.tabs['2']?.puzzleSolved || false;
  let playerOnExit = false;
  let promptShown = false;

  // Track which symbols have been activated (for visual dimming)
  const activatedSet = new Set();

  // ── Mid-puzzle lock state ────────────────────────────────────────────
  // After 2 correct activations, all symbols lock until Tab 1's bonus
  // symbol is collected. Skipped if it was already resolved previously.
  const midPuzzleResolved = currentState.tabs['1']?.bonusSymbol === true;
  let symbolsLocked = false;

  function unlockSymbols() {
    if (!symbolsLocked) return;
    symbolsLocked = false;
    buildInteractables();
    audio.playChime(tabNum);
    console.log('[Level 2] Symbols unlocked! Player can continue.');
  }

  // ── Build / refresh interactable list ──────────────────────────────────
  function buildInteractables() {
    const LOCKED_SYMBOL = CORRECT_SEQUENCE[2]; // 'A' — the one that locks
    const items = SYMBOLS.map(s => {
      let color = '#00E5FF';
      if (activatedSet.has(s.label)) {
        color = 'rgba(0, 229, 255, 0.25)';
      } else if (symbolsLocked) {
        // Extra dim for the locked symbol, slightly dim for the rest
        color = s.label === LOCKED_SYMBOL
          ? 'rgba(0, 229, 255, 0.10)'
          : 'rgba(0, 229, 255, 0.15)';
      }
      return { ...s, color };
    });

    // If puzzle is solved, add the exit door
    if (puzzleSolved) {
      items.push({
        col: EXIT_COL,
        row: EXIT_ROW,
        type: 'exit',
        id: 'exit_door',
        color: '#00FF88',
      });
    }

    renderer.setInteractables(items);
  }

  buildInteractables();

  // ── "Press SPACE to continue" prompt overlay ───────────────────────────
  const promptOverlay = document.createElement('div');
  promptOverlay.style.cssText = `
    position: fixed;
    bottom: 25%;
    left: 50%;
    transform: translateX(-50%);
    font-family: monospace;
    font-size: 16px;
    color: #00E5FF;
    background: rgba(10, 15, 30, 0.85);
    padding: 12px 24px;
    border: 1px solid rgba(0, 229, 255, 0.3);
    pointer-events: none;
    z-index: 200;
    display: none;
    white-space: nowrap;
  `;
  promptOverlay.textContent = 'Press SPACE to continue \u2192';
  document.body.appendChild(promptOverlay);

  // ── Sequence progress HUD (top-right) ──────────────────────────────────
  const seqHud = document.createElement('div');
  seqHud.style.cssText = `
    position: fixed;
    top: 12px;
    right: 16px;
    font-family: monospace;
    font-size: 14px;
    color: rgba(0, 229, 255, 0.5);
    user-select: none;
    pointer-events: none;
    z-index: 100;
  `;
  document.body.appendChild(seqHud);

  function updateSeqHud() {
    const pips = CORRECT_SEQUENCE.map((_, i) =>
      i < activatedSequence.length ? '\u25CF' : '\u25CB'
    ).join(' ');
    seqHud.textContent = pips;
  }
  updateSeqHud();

  // ── Interaction handler (set up later after Act 2 state is initialized) ──

  // ── Poll player position for exit tile ─────────────────────────────────
  const exitCheckInterval = setInterval(() => {
    if (!puzzleSolved) return;

    const pos = renderer.getPlayerPosition();
    if (pos.col === EXIT_COL && pos.row === EXIT_ROW) {
      if (!promptShown) {
        promptShown = true;
        playerOnExit = true;
        promptOverlay.style.display = 'block';
      }
    } else {
      if (promptShown) {
        promptShown = false;
        playerOnExit = false;
        promptOverlay.style.display = 'none';
      }
    }
  }, 100);

  // ── Spacebar handler for opening Tab 3 (inside user gesture) ───────────
  function onExitKeydown(e) {
    if (e.key === ' ' && playerOnExit && puzzleSolved) {
      e.preventDefault();

      // Broadcast completion
      channel.send('TAB_COMPLETED', { completedTab: 2 }, tabNum);

      // Update highest unlocked tab
      state.setState((s) => {
        if (s.meta.highestTabUnlocked < 3) {
          s.meta.highestTabUnlocked = 3;
        }
        return s;
      }, tabNum);

      // Open Tab 3 — MUST be inside this user-gesture keydown handler
      window.open('game.html?tab=3', '_blank');

      // Clean up
      promptOverlay.style.display = 'none';
      clearInterval(exitCheckInterval);
      window.removeEventListener('keydown', onExitKeydown);

      console.log('[Level 2] Tab 3 opened. Level 2 complete.');
    }
  }

  window.addEventListener('keydown', onExitKeydown);

  // ── Interaction handler ────────────────────────────────────────────────
  renderer.setOnInteract((item) => {
    if (item.type === 'symbol' && !puzzleSolved) {
      // Block ALL symbol activations when locked
      if (symbolsLocked) {
        audio.playErrorTone();
        return;
      }

      const label = item.label;
      if (activatedSet.has(label)) return;

      activatedSequence.push(label);
      activatedSet.add(label);

      if (label === PLANTED_SEED_LABEL) {
        if (narrator && narrator.triggerNarrator) {
          narrator.triggerNarrator('tab2_seed');
        }
      }

      const expectedSoFar = CORRECT_SEQUENCE.slice(0, activatedSequence.length);
      const isCorrectSoFar = activatedSequence.every((l, i) => l === expectedSoFar[i]);

      if (!isCorrectSoFar) {
        audio.playErrorTone();
        activatedSequence = [];
        activatedSet.clear();
        buildInteractables();
        updateSeqHud();
        return;
      }

      audio.playChime(tabNum);
      buildInteractables();
      updateSeqHud();

      // ── Mid-puzzle lock: after 2 correct activations ──────────────
      if (activatedSequence.length === 2 && !midPuzzleResolved) {
        symbolsLocked = true;
        buildInteractables(); // rebuild with locked visuals

        // Fire backtrack to Tab 1 (shell handles chime + favicon + title arrow)
        channel.send('BACKTRACK_TRIGGER', { targetTab: 1, reason: 'midpuzzle' }, tabNum);

        // Narrator
        if (narrator && narrator.triggerNarrator) {
          narrator.triggerNarrator('tab2_midpuzzle');
        }

        console.log('[Level 2] Mid-puzzle lock! Backtrack signal sent to Tab 1.');
      }

      if (activatedSequence.length === CORRECT_SEQUENCE.length) {
        puzzleSolved = true;
        state.updateTabState(tabNum, { puzzleSolved: true });
        channel.send('PUZZLE_SOLVED', { solvedTab: 2 }, tabNum);
        buildInteractables();
      }
    }

    if (item.type === 'exit' && puzzleSolved) {
      playerOnExit = true;
    }

  });

  // ── Listen for cross-tab messages ──────────────────────────────────────
  channel.onMessage((msg) => {
    if (msg.type === 'BACKTRACK_TRIGGER' && msg.payload?.targetTab === 2) {
      audio.playChime(tabNum);
      favicon.pulseFavicon('triangle');
      document.title = 'The Pattern \u2190';
    }

    // Mid-puzzle: Tab 1 bonus symbol collected — unlock symbols
    if (msg.type === 'NEW_SYMBOL_FOUND') {
      unlockSymbols();
    }

  });

  // Visibility change: check for mid-puzzle unlock
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const s = state.getState();

    // Mid-puzzle: check if Tab 1's bonus symbol was collected
    if (symbolsLocked && s.tabs['1']?.bonusSymbol === true) {
      unlockSymbols();
    }
  });
}
