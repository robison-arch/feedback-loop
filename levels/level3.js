/**
 * levels/level3.js — Tab 3 "The Loop"
 *
 * Final level. Left half open for exploration, solid wall at column 14.
 * On first contact with the wall, a backtrack trigger fires to Tab 1,
 * illuminating it so the player can collect floor symbols.
 * Player returns here, interacts with the code input panel near the wall,
 * and if all 5 symbols are collected, the wall dissolves and the exit opens.
 * This is the final tab — no new tab opens. Game complete.
 */

// ── Wall map (15 rows x 20 cols) ───────────────────────────────────────────
// 0 = floor, 1 = wall
// Left half (cols 0-13): relatively open with some wall formations for exploration
// Column 14: solid wall barrier (the blocked path)
// Right half (cols 15-19): exit area, initially walled off behind column 14
const WALL_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],  // row 0  — top border
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 1
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 2
  [1,0,0,1,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 3  — wall cluster A
  [1,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 4
  [1,0,0,0,0,0,0,1,1,0,0,0,0,0,1,0,0,0,0,1],  // row 5  — wall cluster B
  [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,1],  // row 6
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 7  — code panel at (13,7)
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 8
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 9  — wall cluster C
  [1,0,0,0,0,1,1,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 10
  [1,0,0,0,0,0,0,0,0,0,1,1,0,0,1,0,0,0,0,1],  // row 11 — wall cluster D
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,1],  // row 12
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1],  // row 13 — player starts (1,13)
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],  // row 14 — bottom border
];

// The wall tiles at column 14 that will dissolve (rows 1-13, all wall)
// We track these so we can animate them away one by one
const BLOCKED_WALL_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const BLOCKED_WALL_COL = 14;

// ── Code input panel position (next to the blocked wall) ────────────────────
const PANEL_COL = 13;
const PANEL_ROW = 7;

// ── Exit position (right side, beyond the dissolved wall) ───────────────────
const EXIT_COL = 18;
const EXIT_ROW = 7;

// ── The five required symbols ───────────────────────────────────────────────
const REQUIRED_SYMBOLS = ['\u25C6', '\u25B2', '\u25CF', '\u25A0', '\u2605'];  // ◆ ▲ ● ■ ★

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
  const tabNum = 3;
  const currentState = state.getState();

  // ── Set favicon and title ──────────────────────────────────────────────
  favicon.setFavicon('square');
  document.title = 'The Loop';

  // ── Deep-copy the wall map so we can mutate it for the dissolve ────────
  const wallMap = WALL_MAP.map(row => [...row]);

  // ── Set wall map ───────────────────────────────────────────────────────
  renderer.setMap(wallMap);

  // ── Player start position ──────────────────────────────────────────────
  renderer.setPlayerPosition(1, 13);

  // ── Flashlight inherited from previous tabs ────────────────────────────
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
    narrator.triggerNarrator('tab3_enter');
  }

  // ── Puzzle / level state ───────────────────────────────────────────────
  let backtrackTriggered = currentState.tabs['3']?.backtrackedTo1 || false;
  let wallDissolved = currentState.tabs['3']?.puzzleSolved || false;
  let gameComplete = false;
  let playerOnExit = false;
  let promptShown = false;

  // ── Act 2 state ──────────────────────────────────────────────────────
  let actTwoItemPlaced = false;
  let actTwoItemCollected = false;
  let actTwoOpened = false;
  const ACT2_ITEM_COL = 7;
  const ACT2_ITEM_ROW = 7;

  // ── Build interactables ────────────────────────────────────────────────
  function buildInteractables() {
    const items = [];

    // Code input panel — always visible once backtrack has been triggered,
    // and the wall has not yet dissolved
    if (backtrackTriggered && !wallDissolved) {
      items.push({
        col: PANEL_COL,
        row: PANEL_ROW,
        type: 'code_panel',
        id: 'code_panel',
        color: '#FFD700',
        glow: true,
        glowRadius: 40,
      });
    }

    // Exit — only after wall dissolves
    if (wallDissolved) {
      items.push({
        col: EXIT_COL,
        row: EXIT_ROW,
        type: 'exit',
        id: 'exit_final',
        color: '#00FF88',
        glow: true,
        glowRadius: 60,
      });
    }

    // Act 2: glowing magenta collectible at center of the eye
    if (actTwoItemPlaced && !actTwoItemCollected) {
      items.push({
        col: ACT2_ITEM_COL,
        row: ACT2_ITEM_ROW,
        type: 'act2_item',
        id: 'act2_item',
        color: '#FF00FF',
        glow: true,
        glowRadius: 60,
      });
    }

    renderer.setInteractables(items);
  }

  // If the wall was already dissolved on a previous visit, open the wall
  if (wallDissolved) {
    for (const row of BLOCKED_WALL_ROWS) {
      wallMap[row][BLOCKED_WALL_COL] = 0;
    }
    renderer.setMap(wallMap);
  }

  buildInteractables();

  // ── Fragment count HUD (top-right) ─────────────────────────────────────
  const fragHud = document.createElement('div');
  fragHud.style.cssText = `
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
  document.body.appendChild(fragHud);

  function updateFragHud() {
    const frags = state.getState().player.codeFragments || [];
    const pips = REQUIRED_SYMBOLS.map(s =>
      frags.includes(s) ? '\u25CF' : '\u25CB'
    ).join(' ');
    fragHud.textContent = pips;
  }

  // Only show the HUD once the backtrack has been triggered
  if (backtrackTriggered) {
    fragHud.style.display = 'block';
    updateFragHud();
  } else {
    fragHud.style.display = 'none';
  }

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
  promptOverlay.textContent = 'Press SPACE to finish';
  document.body.appendChild(promptOverlay);

  // ── Final completion overlay ───────────────────────────────────────────
  const completionOverlay = document.createElement('div');
  completionOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: rgba(10, 15, 30, 0.95);
    z-index: 300;
    font-family: monospace;
    color: #00E5FF;
    text-align: center;
    opacity: 0;
    transition: opacity 2s ease-in;
  `;
  completionOverlay.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 16px;">the loop is not complete.</div>
    <div style="font-size: 14px; color: rgba(0, 229, 255, 0.5);">return to where it started.</div>
  `;
  document.body.appendChild(completionOverlay);

  // ── Backtrack trigger — fires on first contact with the blocked wall ───
  renderer.setOnMove((col, row) => {
    // Check if player is adjacent to the blocked wall column (at col 13)
    // and trying to move into it, or just arrived at col 13 for the first time
    if (!backtrackTriggered && col >= 12 && col <= 13) {
      // Check if any of the adjacent wall tiles at column 14 are in the same row
      if (wallMap[row][BLOCKED_WALL_COL] === 1) {
        backtrackTriggered = true;

        // Persist backtrack state
        state.updateTabState(tabNum, { backtrackedTo1: true });

        // Send backtrack trigger to Tab 1
        channel.send('BACKTRACK_TRIGGER', { targetTab: 1 }, tabNum);

        // Narrator: blocked, then backtrack line after it finishes
        if (narrator && narrator.triggerNarrator) {
          narrator.triggerNarrator('tab3_block').then(() => {
            // Small pause between lines, then show backtrack hint
            setTimeout(() => {
              narrator.triggerNarrator('tab3_backtrack');
            }, 800);
          });
        }

        // Show fragment HUD and code panel interactable
        fragHud.style.display = 'block';
        updateFragHud();
        buildInteractables();

        console.log('[Level 3] Backtrack trigger fired. Player must return to Tab 1.');
      }
    }
  });

  // ── Wall dissolve animation ────────────────────────────────────────────
  function dissolveWall() {
    wallDissolved = true;
    state.updateTabState(tabNum, { puzzleSolved: true });

    // Narrator: unlock
    if (narrator && narrator.triggerNarrator) {
      narrator.triggerNarrator('tab3_unlock');
    }

    // Dissolve wall tiles one by one from center outward
    // Order: center row (7) first, then alternating outward
    const dissolveOrder = [];
    dissolveOrder.push(7);
    for (let offset = 1; offset <= 6; offset++) {
      if (7 - offset >= 1) dissolveOrder.push(7 - offset);
      if (7 + offset <= 13) dissolveOrder.push(7 + offset);
    }

    let i = 0;
    const dissolveInterval = setInterval(() => {
      if (i >= dissolveOrder.length) {
        clearInterval(dissolveInterval);

        // All tiles dissolved — place exit interactable
        buildInteractables();

        console.log('[Level 3] Wall fully dissolved. Exit is open.');
        return;
      }

      const row = dissolveOrder[i];
      wallMap[row][BLOCKED_WALL_COL] = 0;
      renderer.setMap(wallMap);
      renderer.triggerPulse(BLOCKED_WALL_COL, row, 400);
      // Chime only every 3rd tile to avoid cacophonous overlap
      if (i % 3 === 0) audio.playChime(tabNum);

      i++;
    }, 120);
  }

  // ── Interaction handler ────────────────────────────────────────────────
  renderer.setOnInteract((item) => {
    if (item.type === 'code_panel' && !wallDissolved) {
      // Check if the player has all 5 required symbols
      const frags = state.getState().player.codeFragments || [];
      const hasAll = REQUIRED_SYMBOLS.every(s => frags.includes(s));

      if (hasAll) {
        // All symbols collected — dissolve the wall
        dissolveWall();
      } else {
        // Not enough symbols — error feedback
        audio.playErrorTone();

        const count = REQUIRED_SYMBOLS.filter(s => frags.includes(s)).length;
        console.log(`[Level 3] Code panel: ${count}/5 symbols. Need all 5.`);
      }

      return;
    }

    if (item.type === 'exit' && wallDissolved) {
      playerOnExit = true;
    }
  });

  // ── Poll player position for exit tile ─────────────────────────────────
  const exitCheckInterval = setInterval(() => {
    if (!wallDissolved) return;

    // Refresh fragment HUD when player returns (they may have new symbols)
    if (backtrackTriggered) {
      updateFragHud();
    }

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

  // ── Spacebar handler for final exit (game completion) ──────────────────
  function onExitKeydown(e) {
    if (e.key === ' ' && playerOnExit && wallDissolved && !gameComplete) {
      e.preventDefault();
      gameComplete = true;

      // Narrator: completion
      if (narrator && narrator.triggerNarrator) {
        narrator.triggerNarrator('tab3_complete');
      }

      // Broadcast completion
      channel.send('TAB_COMPLETED', { completedTab: 3 }, tabNum);

      // Mark game as complete in state
      state.setState((s) => {
        s.meta.gameComplete = true;
        return s;
      }, tabNum);

      // Clean up polling and prompt
      promptOverlay.style.display = 'none';
      clearInterval(exitCheckInterval);
      window.removeEventListener('keydown', onExitKeydown);

      // Show the completion overlay with a fade-in
      completionOverlay.style.display = 'flex';
      requestAnimationFrame(() => {
        completionOverlay.style.opacity = '1';
      });

      console.log('[Level 3] Game complete. The loop is closed.');
    }
  }

  window.addEventListener('keydown', onExitKeydown);

  // ── Act 2: Mind fragments → collectible → Tab 4 ────────────────────
  // Tab 1 broadcasts MIND_FRAGMENTS_COLLECTED after all 3 are found.
  // Tab 3 fades the completion overlay, places a magenta collectible,
  // and opens Tab 4 via spacebar when the player reaches it.

  // Act 2 "press SPACE" prompt
  const actTwoPrompt = document.createElement('div');
  actTwoPrompt.style.cssText = `
    position: fixed;
    bottom: 25%;
    left: 50%;
    transform: translateX(-50%);
    font-family: monospace;
    font-size: 16px;
    color: #FF00FF;
    background: rgba(10, 15, 30, 0.85);
    padding: 12px 24px;
    border: 1px solid rgba(255, 0, 255, 0.3);
    pointer-events: none;
    z-index: 200;
    display: none;
    white-space: nowrap;
  `;
  actTwoPrompt.textContent = 'Press SPACE to continue \u2192';
  document.body.appendChild(actTwoPrompt);

  function placeActTwoItem() {
    if (actTwoItemPlaced) return;
    actTwoItemPlaced = true;

    // Fade out completion overlay to reveal the level
    completionOverlay.style.opacity = '0';
    setTimeout(() => { completionOverlay.style.display = 'none'; }, 2000);

    // Place the glowing magenta collectible
    buildInteractables();

    // Audio + visual cue
    audio.playChime(tabNum);
    favicon.pulseFavicon('square');

    // Narrator
    if (narrator && narrator.triggerNarrator) {
      narrator.triggerNarrator('tab3_act2');
    }

    console.log('[Level 3] Act 2 item placed at (7,7). Overlay fading.');
  }

  // Poll for Act 2 item proximity
  const actTwoItemCheck = setInterval(() => {
    if (!actTwoItemPlaced || actTwoItemCollected || actTwoOpened) return;
    const pos = renderer.getPlayerPosition();
    if (pos.col === ACT2_ITEM_COL && pos.row === ACT2_ITEM_ROW) {
      actTwoPrompt.style.display = 'block';
    } else {
      actTwoPrompt.style.display = 'none';
    }
  }, 100);

  function onActTwoKeydown(e) {
    if (e.key !== ' ' || actTwoOpened || !actTwoItemPlaced) return;
    const pos = renderer.getPlayerPosition();
    if (pos.col !== ACT2_ITEM_COL || pos.row !== ACT2_ITEM_ROW) return;

    e.preventDefault();
    actTwoItemCollected = true;
    actTwoOpened = true;

    state.setState((s) => {
      if (s.meta.highestTabUnlocked < 4) s.meta.highestTabUnlocked = 4;
      return s;
    }, tabNum);

    // Open Tab 4 — from Tab 3 so it appears to the right
    window.open('game.html?tab=4', '_blank');

    actTwoPrompt.style.display = 'none';
    clearInterval(actTwoItemCheck);
    window.removeEventListener('keydown', onActTwoKeydown);
    buildInteractables(); // remove the item from the map

    console.log('[Level 3] Tab 4 opened from Tab 3.');
  }

  window.addEventListener('keydown', onActTwoKeydown);

  // ── Act 2: Ghost path replay (eye symbol shape) ──────────────────────
  // After game completion, a ghost traces an eye symbol on the floor grid.
  // The eye is drawn from pre-defined waypoints spanning the left half.
  let ghostPlaying = false;

  // Eye shape waypoints (col, row) — an almond-shaped eye with inner circle
  const EYE_PATH = [
    // Left point of eye
    {c:1,r:7},
    // Top lid curve
    {c:2,r:5},{c:3,r:4},{c:4,r:3},{c:5,r:3},{c:6,r:3},{c:7,r:3},
    {c:8,r:3},{c:9,r:4},{c:10,r:5},{c:11,r:6},
    // Right point
    {c:12,r:7},
    // Bottom lid curve
    {c:11,r:8},{c:10,r:9},{c:9,r:10},{c:8,r:11},{c:7,r:11},{c:6,r:11},
    {c:5,r:11},{c:4,r:10},{c:3,r:9},{c:2,r:8},
    // Back to start
    {c:1,r:7},
    // Inner pupil circle (smaller)
    {c:5,r:6},{c:6,r:5},{c:7,r:5},{c:8,r:5},{c:9,r:6},
    {c:9,r:7},{c:9,r:8},{c:8,r:9},{c:7,r:9},{c:6,r:9},{c:5,r:8},
    {c:5,r:7},
    // Center dot
    {c:7,r:7},
  ];

  function playGhostPath() {
    if (ghostPlaying) return;
    ghostPlaying = true;

    let idx = 0;
    const ghostTrail = []; // accumulated trail positions

    const ghostInterval = setInterval(() => {
      if (idx >= EYE_PATH.length) {
        clearInterval(ghostInterval);

        // Narrator after full path
        if (narrator && narrator.triggerNarrator) {
          narrator.triggerNarrator('tab3_ghost');
        }

        // Fade trail after a hold
        setTimeout(() => {
          // Gradually remove trail interactables
          let fadeIdx = 0;
          const fadeInterval = setInterval(() => {
            if (fadeIdx >= ghostTrail.length) {
              clearInterval(fadeInterval);
              buildInteractables(); // restore original interactables
              return;
            }
            fadeIdx += 3; // remove 3 at a time for speed
            const remaining = ghostTrail.slice(fadeIdx);
            const items = remaining.map(p => ({
              col: p.c, row: p.r,
              type: 'ghost_trail',
              id: `ghost_${p.c}_${p.r}`,
              color: `rgba(255, 0, 255, ${0.4 * (1 - fadeIdx / ghostTrail.length)})`,
            }));
            // Keep existing interactables
            const existing = [];
            if (wallDissolved) {
              existing.push({
                col: EXIT_COL, row: EXIT_ROW,
                type: 'exit', id: 'exit_final',
                color: '#00FF88', glow: true, glowRadius: 60,
              });
            }
            renderer.setInteractables([...existing, ...items]);
          }, 80);
        }, 2000);

        return;
      }

      const pt = EYE_PATH[idx];
      ghostTrail.push(pt);

      // Render all trail points as magenta markers
      const items = ghostTrail.map(p => ({
        col: p.c, row: p.r,
        type: 'ghost_trail',
        id: `ghost_${p.c}_${p.r}`,
        color: '#FF00FF',
      }));

      // Keep exit if wall dissolved
      if (wallDissolved) {
        items.push({
          col: EXIT_COL, row: EXIT_ROW,
          type: 'exit', id: 'exit_final',
          color: '#00FF88', glow: true, glowRadius: 60,
        });
      }

      renderer.setInteractables(items);
      renderer.triggerPulse(pt.c, pt.r, 300);

      idx++;
    }, 150);
  }

  // Trigger ghost path after game completion (visibility-based)
  function checkAndPlayGhost() {
    if (ghostPlaying) return;
    const s = state.getState();
    if (s.meta.gameComplete === true && wallDissolved) {
      // Small delay so player sees it naturally
      setTimeout(() => playGhostPath(), 1500);
    }
  }

  // ── Listen for cross-tab messages ──────────────────────────────────────
  channel.onMessage((msg) => {
    // Refresh fragment HUD when we receive any message (player may have
    // collected symbols in Tab 1 and returned)
    if (backtrackTriggered) {
      updateFragHud();
      // Rebuild interactables in case state changed
      if (!wallDissolved) {
        buildInteractables();
      }
    }

    // Tab 1 signals all symbols collected — mirror the backtrack mechanic
    // Note: chime + favicon pulse handled by game.html shell handler
    if (msg.type === 'BACKTRACK_TRIGGER' && msg.payload?.targetTab === 3) {
      // Briefly change title to signal the player, then revert
      const prevTitle = document.title;
      document.title = 'The Loop \u2190';
      setTimeout(() => {
        // Only revert if nothing else changed the title in the meantime
        if (document.title === 'The Loop \u2190') {
          document.title = prevTitle;
        }
      }, 5000);

      console.log('[Level 3] Backtrack trigger received from Tab 1 — all symbols collected.');
    }

    // Act 2: After game completion, trigger ghost path
    if (msg.type === 'TAB_COMPLETED' && msg.payload?.completedTab === 3) {
      checkAndPlayGhost();
    }

    // Act 2: Mind fragments collected in Tab 1 3D — place collectible
    if (msg.type === 'MIND_FRAGMENTS_COLLECTED' && gameComplete) {
      placeActTwoItem();
    }
  });

  // Also check on visibility change (returning to this tab after completion)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkAndPlayGhost();

      // Check if mind fragments were collected while this tab was hidden
      if (gameComplete && !actTwoItemPlaced) {
        const s = state.getState();
        const frags = s.player.mindFragments || [];
        if (frags.length >= 3) {
          placeActTwoItem();
        }
      }
    }
  });

  // Check immediately if game was already complete on load
  if (currentState.meta.gameComplete && wallDissolved) {
    setTimeout(() => checkAndPlayGhost(), 2000);

    // Act 2: check if mind fragments were already collected
    const loadFrags = currentState.player.mindFragments || [];
    if (loadFrags.length >= 3) {
      setTimeout(() => placeActTwoItem(), 3000);
    }
  }
}
