/**
 * levels/level1.js — Tab 1 "First Light"
 *
 * First visit: near-total darkness, gentle maze, light source pickup,
 *              flashlight upgrade, exit to Tab 2.
 * Return visit: full illumination, five floor symbols to collect.
 */

// ── Wall map (15 rows x 20 cols) ───────────────────────────────────────────
// 0 = floor, 1 = wall
// Four wall formations create a gentle maze from bottom-left to center-right
// light source at (14,7), exit near spawn at (2,12) — forces backtracking.
const WALL_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],  // row 0  — top border
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // row 1  — exit at (18,1)
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // row 2
  [1,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1],  // row 3  — wall block A
  [1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // row 4
  [1,0,0,0,1,0,0,0,0,1,1,1,0,0,0,0,0,0,0,1],  // row 5  — wall block B
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],  // row 6
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],  // row 7  — light at (14,7)
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1],  // row 8  — wall block C
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],  // row 9
  [1,0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,0,0,0,1],  // row 10 — wall block D
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1],  // row 11
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // row 12
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // row 13 — player starts (1,13)
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],  // row 14 — bottom border
];

// ── Floor symbols (visible only on return visit when illuminated) ───────────
// These are always in the map data but rendered only when state is "illuminated"
const FLOOR_SYMBOLS = [
  { col: 3,  row: 3,  symbol: '\u25C6', id: 'floor_diamond'   },  // ◆
  { col: 8,  row: 6,  symbol: '\u25B2', id: 'floor_triangle'  },  // ▲
  { col: 12, row: 10, symbol: '\u25CF', id: 'floor_circle'    },  // ●
  { col: 6,  row: 12, symbol: '\u25A0', id: 'floor_square'    },  // ■
  { col: 16, row: 4,  symbol: '\u2605', id: 'floor_star'      },  // ★
];

// ── Light source position ──────────────────────────────────────────────────
const LIGHT_COL = 14;
const LIGHT_ROW = 7;

// ── Exit door position (near spawn — player must backtrack after flashlight) ─
const EXIT_COL = 2;
const EXIT_ROW = 12;

// ── Exported init function ─────────────────────────────────────────────────

/**
 * @param {object} renderer  — the renderer module (setMap, setInteractables, etc.)
 * @param {object} state     — the state module (getState, setState, etc.)
 * @param {object} channel   — the channel module (send, onMessage)
 * @param {object} audio     — the audio module (playAmbient, playChime, etc.)
 * @param {object} favicon   — the favicon module (setFavicon, pulseFavicon)
 * @param {object} narrator  — the narrator module (triggerNarrator)
 */
export function init(renderer, state, channel, audio, favicon, narrator) {
  const tabNum = 1;
  const currentState = state.getState();
  const tabData = currentState.tabs['1'];
  const isReturn = tabData.state === 'illuminated';

  // ── Debug: print 3D mode condition values ─────────────────────────────
  console.log('[Level 1 init] meta.gameComplete:', currentState.meta.gameComplete,
    '| tabs[1].visitCount:', tabData.visitCount,
    '| tabs[1].state:', tabData.state);

  // ── 3D MODE — post-game revisit (page-load path) ─────────────────────
  const is3DMode = currentState.meta.gameComplete === true
    && (tabData.visitCount || 0) >= 2;

  if (is3DMode) {
    _enter3D(renderer, state, channel, audio, narrator);
    return; // skip all 2D setup
  }

  // Track whether we've transitioned to 3D mid-session
  let entered3D = false;

  function tryEnter3D() {
    if (entered3D) return;
    const s = state.getState();
    if (s.meta.gameComplete === true) {
      entered3D = true;
      console.log('[Level 1] Mid-session 3D trigger! gameComplete:', s.meta.gameComplete);
      _enter3D(renderer, state, channel, audio, narrator);
    }
  }

  // ── Mid-puzzle bonus symbol state (Tab 2 backtrack) ──────────────────
  // When Tab 2 locks at 2/4 symbols, it backtracks here. A bonus symbol
  // appears at (3,3) for the player to collect and send back.
  let bonusSymbolPlaced = currentState.tabs['1']?.bonusSymbolAvailable === true;
  let bonusSymbolCollected = currentState.tabs['1']?.bonusSymbol === true;

  function placeBonusSymbol() {
    if (bonusSymbolCollected) return;

    bonusSymbolPlaced = true;
    state.updateTabState(tabNum, { bonusSymbolAvailable: true });

    // Add the bonus symbol as a bright glowing interactable
    const bonus = {
      col: 3, row: 3,
      type: 'bonus_symbol',
      id: 'bonus_key',
      color: '#00FFAA',
      glow: true,
      glowRadius: 60,
    };
    renderer.setInteractables([bonus]);

    // Auto-collect when player walks onto (3,3)
    renderer.setOnMove((col, row) => {
      if (col === 3 && row === 3 && !bonusSymbolCollected) {
        bonusSymbolCollected = true;

        renderer.setInteractables([]);
        renderer.triggerPulse(3, 3, 500);

        state.updateTabState(tabNum, { bonusSymbol: true });
        channel.send('NEW_SYMBOL_FOUND', { fromTab: 1 }, tabNum);

        audio.playChime(tabNum);

        console.log('[Level 1] Bonus symbol collected! NEW_SYMBOL_FOUND broadcast sent.');
      }
    });

    console.log('[Level 1] Bonus symbol placed at (3,3).');
  }

  // ── Set favicon ────────────────────────────────────────────────────────
  favicon.setFavicon('circle');

  // ── Set wall map ───────────────────────────────────────────────────────
  renderer.setMap(WALL_MAP);

  // ── Player start position ──────────────────────────────────────────────
  renderer.setPlayerPosition(1, 13);

  // ── Shared setup for illuminated / return-visit state ─────────────────
  // Used by both the isReturn branch (tab loads in illuminated state) and
  // the BACKTRACK_TRIGGER handler (tab transitions mid-session).
  function setupReturnVisit() {
    document.title = 'Origin \u2190';
    renderer.setFullIllumination(false);
    renderer.setFlashlight(true);

    // Build interactables from floor symbols that haven't been collected yet
    const collected = state.getState().player.codeFragments || [];
    const symbolInteractables = FLOOR_SYMBOLS
      .filter(s => !collected.includes(s.symbol))
      .map(s => ({
        col: s.col,
        row: s.row,
        type: 'floor_symbol',
        id: s.id,
        symbol: s.symbol,
        color: '#00E5FF',
      }));

    renderer.setInteractables(symbolInteractables);

    // ── Interaction: collect floor symbols ─────────────────────────────
    renderer.setOnInteract((item) => {
      if (item.type === 'floor_symbol') {
        // Add symbol to player's codeFragments
        state.setState((s) => {
          if (!s.player.codeFragments.includes(item.symbol)) {
            s.player.codeFragments.push(item.symbol);
          }
          return s;
        }, tabNum);

        // Play a chime for feedback
        audio.playChime(tabNum);

        // Remove this interactable from the rendered list
        const idx = symbolInteractables.findIndex(i => i.id === item.id);
        if (idx !== -1) {
          symbolInteractables.splice(idx, 1);
        }
        renderer.setInteractables([...symbolInteractables]);

        const frags = state.getState().player.codeFragments;
        console.log(`[Level 1] Collected symbol: ${item.symbol}. Total: ${frags.length}/5`);

        // All 5 collected — signal Tab 3 that the player is ready to return
        if (frags.length >= 5) {
          channel.send('BACKTRACK_TRIGGER', { targetTab: 3 }, tabNum);
          console.log('[Level 1] All symbols collected. Backtrack trigger sent to Tab 3.');
        }
      }
    });

    // Start lofi music and register as persistent soundtrack (idempotent)
    if (audio.playLofiMusic) {
      audio.playLofiMusic();
      audio.registerMusicStarter(() => audio.playLofiMusic());
    }

    // Clear the onMove callback — no longer needed after transition
    renderer.setOnMove(null);
  }

  // ── First-visit resource handles (hoisted for cleanup from BACKTRACK_TRIGGER)
  let firstVisitExitInterval = null;
  let firstVisitKeydownHandler = null;
  let firstVisitPromptOverlay = null;

  if (isReturn) {
    // ══════════════════════════════════════════════════════════════════════
    // RETURN VISIT — flashlight active, floor symbols hidden until lit
    // ══════════════════════════════════════════════════════════════════════

    setupReturnVisit();

    // Trigger return narrator line immediately (tab is already focused)
    if (narrator && narrator.triggerNarrator) {
      narrator.triggerNarrator('tab1_return');
    }

  } else {
    // ══════════════════════════════════════════════════════════════════════
    // FIRST VISIT — darkness, maze, find light, exit to Tab 2
    // ══════════════════════════════════════════════════════════════════════

    document.title = 'First Light';
    renderer.setFullIllumination(false);

    // ── Handle refresh: if player already has flashlight, skip darkness phase
    const alreadyHasFlashlight = currentState.player.hasFlashlight;
    renderer.setFlashlight(alreadyHasFlashlight);

    // Trigger entry narrator line
    if (narrator && narrator.triggerNarrator) {
      narrator.triggerNarrator('tab1_enter');
    }

    // Track whether the exit has been unlocked and player position
    let exitUnlocked = alreadyHasFlashlight;
    let playerOnExit = false;
    let promptShown = false;

    if (!alreadyHasFlashlight) {
      // Light source interactable — visible glowing beacon the player navigates toward
      const lightSource = {
        col: LIGHT_COL,
        row: LIGHT_ROW,
        type: 'light',
        id: 'light_source',
        color: '#00E5FF',
        glow: true,
        glowRadius: 80,
      };
      renderer.setInteractables([lightSource]);
    } else {
      // Already have flashlight (refresh mid-level) — show exit directly
      const exitDoor = {
        col: EXIT_COL,
        row: EXIT_ROW,
        type: 'exit',
        id: 'exit_door',
        color: '#00FF88',
      };
      renderer.setInteractables([exitDoor]);
      // Restore lofi music
      if (audio.playLofiMusic) {
        audio.playLofiMusic();
        audio.registerMusicStarter(() => audio.playLofiMusic());
      }
    }

    // ── Auto-pickup: collect flashlight by walking over it ──────────────
    // Only register if flashlight hasn't been acquired yet
    if (!alreadyHasFlashlight) renderer.setOnMove((col, row) => {
      if (col === LIGHT_COL && row === LIGHT_ROW && !state.getState().player.hasFlashlight) {
        // Player walked onto the light — auto-collect

        // 1. Activate flashlight IMMEDIATELY (same frame) — must be first
        renderer.setFlashlight(true);

        // 2. Remove the light source interactable so the tile is open floor
        //    and replace with the exit door
        exitUnlocked = true;
        const exitDoor = {
          col: EXIT_COL,
          row: EXIT_ROW,
          type: 'exit',
          id: 'exit_door',
          color: '#00FF88',
        };
        renderer.setInteractables([exitDoor]);

        // 3. Persist to state
        state.setState((s) => {
          s.player.hasFlashlight = true;
          return s;
        }, tabNum);

        // 4. Visual pulse (non-critical — after core state is set)
        renderer.triggerPulse(col, row, 500);

        // 5. Audio feedback — start lofi and register as persistent soundtrack
        audio.playChime(tabNum);
        if (audio.playLofiMusic) {
          audio.playLofiMusic();
          audio.registerMusicStarter(() => audio.playLofiMusic());
        }

        // 6. Narrator
        if (narrator && narrator.triggerNarrator) {
          narrator.triggerNarrator('tab1_light');
        }

        // 7. Mark puzzle as solved
        state.updateTabState(tabNum, { puzzleSolved: true });

        console.log('[Level 1] Flashlight acquired! Exit unlocked near spawn — backtrack.');
      }
    });

    // ── Exit tile interaction (still spacebar-gated for popup-blocker safety) ─
    renderer.setOnInteract((item) => {
      if (item.type === 'exit' && exitUnlocked) {
        playerOnExit = true;
      }
    });

    // ── "Press SPACE to continue" prompt overlay ────────────────────────
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
    firstVisitPromptOverlay = promptOverlay;

    // ── Poll player position for exit tile ──────────────────────────────
    const exitCheckInterval = setInterval(() => {
      if (!exitUnlocked) return;

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
    firstVisitExitInterval = exitCheckInterval;

    // ── Spacebar handler for opening Tab 2 (must be inside user gesture) ─
    function onExitKeydown(e) {
      if (e.key === ' ' && playerOnExit && exitUnlocked) {
        e.preventDefault();

        // Send TAB_COMPLETED message
        channel.send('TAB_COMPLETED', { completedTab: 1 }, tabNum);

        // Update highest tab unlocked
        state.setState((s) => {
          if (s.meta.highestTabUnlocked < 2) {
            s.meta.highestTabUnlocked = 2;
          }
          return s;
        }, tabNum);

        // Open Tab 2 — MUST happen inside this keydown handler
        window.open('game.html?tab=2', '_blank');

        // Clean up
        promptOverlay.style.display = 'none';
        clearInterval(exitCheckInterval);
        window.removeEventListener('keydown', onExitKeydown);
        firstVisitExitInterval = null;
        firstVisitKeydownHandler = null;
        firstVisitPromptOverlay = null;

        console.log('[Level 1] Tab 2 opened. Level 1 complete.');
      }
    }
    firstVisitKeydownHandler = onExitKeydown;

    window.addEventListener('keydown', onExitKeydown);

    // ── Page-load check: if bonus symbol was placed but not collected ──
    if (bonusSymbolPlaced && !bonusSymbolCollected) {
      placeBonusSymbol();
    }
  }

  // ── Listen for cross-tab messages ──────────────────────────────────────
  channel.onMessage((msg) => {
    if (msg.type === 'BACKTRACK_TRIGGER' && msg.payload?.targetTab === 1) {
      // ── Mid-puzzle backtrack from Tab 2 (bonus symbol) ──────────────
      if (msg.payload?.reason === 'midpuzzle') {
        placeBonusSymbol();
        return;
      }

      // ── Tab 3 backtrack — full illumination ─────────────────────────
      // Tab 3 has requested the player return here — illuminate the tab.
      // The player is currently on Tab 3, so this runs in the background.

      // 1. Persist illuminated state
      state.updateTabState(tabNum, { state: 'illuminated', floorRevealed: true });

      // 2. Clean up first-visit resources (interval, keydown, prompt overlay)
      if (firstVisitExitInterval != null) {
        clearInterval(firstVisitExitInterval);
        firstVisitExitInterval = null;
      }
      if (firstVisitKeydownHandler != null) {
        window.removeEventListener('keydown', firstVisitKeydownHandler);
        firstVisitKeydownHandler = null;
      }
      if (firstVisitPromptOverlay != null) {
        firstVisitPromptOverlay.remove();
        firstVisitPromptOverlay = null;
      }

      // 3. Transition to illuminated state — sets up floor symbols,
      //    interaction handler, flashlight, and lofi music
      setupReturnVisit();

      // 4. Audio/visual cues handled by game.html shell (playChime + pulseFavicon)

      // 5. Defer narrator line until the player actually switches to this tab
      //    (they're currently on Tab 3, so firing it now would be invisible)
      function onReturnVisible() {
        if (!document.hidden) {
          document.removeEventListener('visibilitychange', onReturnVisible);
          if (narrator && narrator.triggerNarrator) {
            narrator.triggerNarrator('tab1_return');
          }
        }
      }
      document.addEventListener('visibilitychange', onReturnVisible);

      console.log('[Level 1] Backtrack trigger received — tab is now illuminated.');
    }

    // Game complete — transition to 3D mid-session
    if (msg.type === 'TAB_COMPLETED' && msg.payload?.completedTab === 3) {
      console.log('[Level 1] TAB_COMPLETED received from Tab 3. Attempting 3D transition.');
      tryEnter3D();
    }
  });

  // ── Visibility change: check for game completion on tab focus ─────────
  // Catches the case where Tab 3 completed while this tab was in the
  // background and the BroadcastChannel message was missed or arrived
  // before this handler was ready.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !entered3D) {
      tryEnter3D();
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3D MODE — First-person exploration of the same Tab 1 layout using Three.js
// Activated when meta.gameComplete && visitCount >= 2
// ═══════════════════════════════════════════════════════════════════════════════

function _enter3D(renderer2d, state, channel, audio, narrator) {
  console.log('[Level 1 3D] _enter3D called. window.THREE exists:', !!window.THREE);

  const THREE = window.THREE;
  if (!THREE) {
    console.error('[Level 1 3D] Three.js not loaded. Check CDN script tag.');
    return;
  }

  document.title = 'Origin';
  state.updateTabState(1, { state: '3d' });

  // Start lofi music
  if (audio.playLofiMusic) {
    audio.playLofiMusic();
    audio.registerMusicStarter(() => audio.playLofiMusic());
  }

  // ── Constants ──────────────────────────────────────────────────────────
  const ACCENT = 0x00E5FF;
  const WALL_COLOR = 0x141A30;
  const FLOOR_COLOR = 0x0A0F1E;
  const COLS = 20;
  const ROWS = 15;
  const WALL_HEIGHT = 1.0;
  const PLAYER_HEIGHT = 0.6;
  const PLAYER_RADIUS = 0.2;
  const MOVE_SPEED = 3.0;

  // ── Renderer ───────────────────────────────────────────────────────────
  const threeCanvas = document.createElement('canvas');
  threeCanvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 50;
    opacity: 0;
    transition: opacity 2s ease-in;
  `;
  document.body.appendChild(threeCanvas);

  const glRenderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true });
  glRenderer.setSize(window.innerWidth, window.innerHeight);
  glRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  glRenderer.setClearColor(FLOOR_COLOR);

  // ── Scene ──────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FLOOR_COLOR, 0.15);

  // ── Camera ─────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.1, 50
  );
  // Spawn at tile (1, 13) → world coords (1.5, PLAYER_HEIGHT, 13.5)
  camera.position.set(1.5, PLAYER_HEIGHT, 13.5);

  // ── Lighting ───────────────────────────────────────────────────────────
  const ambientLight = new THREE.AmbientLight(0x111122, 0.3);
  scene.add(ambientLight);

  const playerLight = new THREE.PointLight(ACCENT, 1.5, 10);
  playerLight.position.copy(camera.position);
  scene.add(playerLight);

  // ── Materials ──────────────────────────────────────────────────────────
  const wallMat = new THREE.MeshStandardMaterial({
    color: WALL_COLOR,
    roughness: 0.8,
    metalness: 0.2,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: FLOOR_COLOR,
    roughness: 1.0,
    metalness: 0.0,
  });

  // ── Build walls ────────────────────────────────────────────────────────
  const wallGeo = new THREE.BoxGeometry(1, WALL_HEIGHT, 1);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (WALL_MAP[r][c] === 1) {
        const mesh = new THREE.Mesh(wallGeo, wallMat);
        mesh.position.set(c + 0.5, WALL_HEIGHT / 2, r + 0.5);
        scene.add(mesh);
      }
    }
  }

  // ── Floor plane ────────────────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(COLS, ROWS);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(COLS / 2, 0, ROWS / 2);
  scene.add(floor);

  // ── Grid lines on the floor ────────────────────────────────────────────
  const gridMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.08 });
  const gridPoints = [];
  for (let c = 0; c <= COLS; c++) {
    gridPoints.push(new THREE.Vector3(c, 0.005, 0));
    gridPoints.push(new THREE.Vector3(c, 0.005, ROWS));
  }
  for (let r = 0; r <= ROWS; r++) {
    gridPoints.push(new THREE.Vector3(0, 0.005, r));
    gridPoints.push(new THREE.Vector3(COLS, 0.005, r));
  }
  const gridGeo = new THREE.BufferGeometry().setFromPoints(gridPoints);
  scene.add(new THREE.LineSegments(gridGeo, gridMat));

  // ── "I WAS ALWAYS HERE" text on the column-14 wall ─────────────────────
  // Column 14 was the impassable barrier in Tab 3's 2D layout.
  // In 3D the text is inscribed across that wall face, glowing cyan.
  const WALL_TEXT_WIDTH = 13;   // spans rows 1-13 (interior height of the map)
  const WALL_TEXT_HEIGHT = WALL_HEIGHT;

  const wallTexCanvas = document.createElement('canvas');
  wallTexCanvas.width = 2048;
  wallTexCanvas.height = 160;
  const wallTexCtx = wallTexCanvas.getContext('2d');
  wallTexCtx.fillStyle = '#0A0F1E';
  wallTexCtx.fillRect(0, 0, 2048, 160);
  wallTexCtx.font = 'bold 120px monospace';
  wallTexCtx.fillStyle = '#00E5FF';
  wallTexCtx.globalAlpha = 0.8;
  wallTexCtx.textAlign = 'center';
  wallTexCtx.textBaseline = 'middle';
  wallTexCtx.fillText('I WAS ALWAYS HERE', 1024, 80);
  const wallTextTex = new THREE.CanvasTexture(wallTexCanvas);

  const wallTextMat = new THREE.MeshStandardMaterial({
    map: wallTextTex,
    emissive: 0xFFFFFF,
    emissiveMap: wallTextTex,
    emissiveIntensity: 0.6,
  });
  const wallTextGeo = new THREE.PlaneGeometry(WALL_TEXT_WIDTH, WALL_TEXT_HEIGHT);
  const wallTextMesh = new THREE.Mesh(wallTextGeo, wallTextMat);
  // Face -X so the player approaching from col 1 sees the text head-on
  wallTextMesh.rotation.y = -Math.PI / 2;
  // Sit flush against the left face of column 14, centered vertically and
  // along the interior span (rows 1-13, midpoint z = 7.5)
  wallTextMesh.position.set(14.01, WALL_TEXT_HEIGHT / 2, ROWS / 2);
  scene.add(wallTextMesh);

  // ── Floor symbols as emissive markers ──────────────────────────────────
  const symbolGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 16);
  const symbolMat = new THREE.MeshStandardMaterial({
    color: ACCENT,
    emissive: ACCENT,
    emissiveIntensity: 0.8,
    roughness: 0.3,
    metalness: 0.5,
  });
  for (const sym of FLOOR_SYMBOLS) {
    const marker = new THREE.Mesh(symbolGeo, symbolMat);
    marker.position.set(sym.col + 0.5, 0.02, sym.row + 0.5);
    scene.add(marker);

    const symLight = new THREE.PointLight(ACCENT, 0.4, 3);
    symLight.position.set(sym.col + 0.5, 0.3, sym.row + 0.5);
    scene.add(symLight);
  }

  // ── Act 2: Mind fragments in 3D space ────────────────────────────────
  // Three glowing symbols on open wall faces the player naturally walks past.
  // Relocated to prominent positions:
  //   mind_A: south face of wall block A (col 6, row 3) — visible walking north
  //   mind_B: south face of wall block B (col 10, row 5) — visible in the center
  //   mind_C: north face of wall block D (col 7, row 10) — visible walking south
  const MIND_FRAGMENTS = [
    { col: 6,  row: 3,  wallSide: 'south', id: 'mind_A', symbol: '\u2666' },  // ♦ wall block A south face
    { col: 10, row: 5,  wallSide: 'south', id: 'mind_B', symbol: '\u2736' },  // ✶ wall block B south face
    { col: 7,  row: 10, wallSide: 'north', id: 'mind_C', symbol: '\u2609' },  // ☉ wall block D north face
  ];

  const COLLECT_RADIUS = 1.8;
  const alreadyCollected = new Set(state.getState().player.mindFragments || []);
  const mindFragMeshes = [];

  for (const frag of MIND_FRAGMENTS) {
    if (alreadyCollected.has(frag.id)) continue;

    // Position the fragment on the face of the wall
    let fx, fz, ry;
    switch (frag.wallSide) {
      case 'east':  fx = frag.col + 1.01; fz = frag.row + 0.5; ry = Math.PI / 2; break;
      case 'west':  fx = frag.col - 0.01; fz = frag.row + 0.5; ry = -Math.PI / 2; break;
      case 'south': fx = frag.col + 0.5;  fz = frag.row + 1.01; ry = Math.PI; break;
      default:      fx = frag.col + 0.5;  fz = frag.row - 0.01; ry = 0; break;
    }

    // 3D geometric shape per fragment — solid emissive geometry + PointLight
    let fragGeo;
    if (frag.id === 'mind_A') {
      fragGeo = new THREE.OctahedronGeometry(0.2, 0);         // ♦ diamond
    } else if (frag.id === 'mind_B') {
      fragGeo = new THREE.IcosahedronGeometry(0.2, 0);        // ✶ star-like
    } else {
      fragGeo = new THREE.SphereGeometry(0.18, 12, 12);       // ☉ sphere
    }

    const fragMat = new THREE.MeshStandardMaterial({
      color: ACCENT,
      emissive: ACCENT,
      emissiveIntensity: 1.2,
      roughness: 0.3,
      metalness: 0.5,
    });
    const fragMesh = new THREE.Mesh(fragGeo, fragMat);
    fragMesh.position.set(fx, WALL_HEIGHT * 0.5, fz);
    scene.add(fragMesh);

    const fragLight = new THREE.PointLight(ACCENT, 0.8, 5);
    fragLight.position.set(fx, WALL_HEIGHT * 0.5, fz);
    scene.add(fragLight);

    mindFragMeshes.push({
      mesh: fragMesh, mat: fragMat, light: fragLight,
      data: frag, fx, fz,
    });

    console.log(`[Level 1 3D] Mind fragment ${frag.id} at position x=${fx.toFixed(1)}, z=${fz.toFixed(1)} (${frag.wallSide} face of col ${frag.col}, row ${frag.row})`);
  }

  // ── Mouse look (pointer lock) ──────────────────────────────────────────
  let yaw = 0;   // horizontal rotation (radians)
  let pitch = 0; // vertical rotation (radians)
  const PITCH_LIMIT = Math.PI / 2 - 0.05;
  const SENSITIVITY = 0.002;

  threeCanvas.addEventListener('click', () => {
    threeCanvas.requestPointerLock();
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== threeCanvas) return;
    yaw -= e.movementX * SENSITIVITY;
    pitch -= e.movementY * SENSITIVITY;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  });

  // ── Keyboard input ─────────────────────────────────────────────────────
  const keys = {};
  window.addEventListener('keydown', (e) => { keys[e.code] = true; });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // ── Collision detection ────────────────────────────────────────────────
  function isWall(x, z) {
    const col = Math.floor(x);
    const row = Math.floor(z);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
    // Column 14 is the "I WAS ALWAYS HERE" wall (Tab 3's blocked barrier)
    if (col === 14) return true;
    return WALL_MAP[row][col] === 1;
  }

  function canMoveTo(x, z) {
    // Check circle vs AABB for the 4 corners of the player's bounding circle
    const r = PLAYER_RADIUS;
    return !isWall(x - r, z - r)
      && !isWall(x + r, z - r)
      && !isWall(x - r, z + r)
      && !isWall(x + r, z + r);
  }

  // ── Resize handler ─────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    glRenderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Animation loop ─────────────────────────────────────────────────────
  let prevTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - prevTime) / 1000, 0.1); // cap delta to avoid tunneling
    prevTime = now;

    // Camera rotation
    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    // Movement
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    const moveDir = new THREE.Vector3(0, 0, 0);
    if (keys['ArrowUp'] || keys['KeyW']) moveDir.add(forward);
    if (keys['ArrowDown'] || keys['KeyS']) moveDir.sub(forward);
    if (keys['ArrowRight'] || keys['KeyD']) moveDir.add(right);
    if (keys['ArrowLeft'] || keys['KeyA']) moveDir.sub(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(MOVE_SPEED * dt);

      // Try X then Z independently for wall sliding
      const newX = camera.position.x + moveDir.x;
      const newZ = camera.position.z + moveDir.z;

      if (canMoveTo(newX, camera.position.z)) {
        camera.position.x = newX;
      }
      if (canMoveTo(camera.position.x, newZ)) {
        camera.position.z = newZ;
      }
    }

    // Keep player at fixed height
    camera.position.y = PLAYER_HEIGHT;

    // Player light follows camera
    playerLight.position.copy(camera.position);

    // ── Act 2: Proximity-check mind fragments ─────────────────────────
    for (let mi = mindFragMeshes.length - 1; mi >= 0; mi--) {
      const mf = mindFragMeshes[mi];
      const dx = camera.position.x - mf.fx;
      const dz = camera.position.z - mf.fz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < COLLECT_RADIUS) {
        // Collect this fragment
        scene.remove(mf.mesh);
        if (mf.light) scene.remove(mf.light);
        mindFragMeshes.splice(mi, 1);

        // Persist to state
        state.setState((s) => {
          if (!s.player.mindFragments) s.player.mindFragments = [];
          if (!s.player.mindFragments.includes(mf.data.id)) {
            s.player.mindFragments.push(mf.data.id);
          }
          return s;
        }, 1);

        // Audio feedback
        audio.playChime(1);

        // Narrator line per fragment
        const fragCount = (state.getState().player.mindFragments || []).length;
        if (narrator && narrator.triggerNarrator) {
          narrator.triggerNarrator('tab1_mind' + fragCount);
        }

        console.log(`[Level 1 3D] Mind fragment collected: ${mf.data.id}. Total: ${fragCount}/3`);

        // All 3 collected — broadcast and mark state
        if (fragCount >= 3) {
          state.updateTabState(1, { mindComplete: true });
          channel.send('MIND_FRAGMENTS_COLLECTED', { fromTab: 1 }, 1);
          console.log('[Level 1 3D] All mind fragments collected. MIND_FRAGMENTS_COLLECTED sent.');
        }
      }
    }

    // Animate mind fragments — slow spin + emissive pulse
    for (const mf of mindFragMeshes) {
      mf.mesh.rotation.y = now * 0.001;
      mf.mesh.rotation.x = now * 0.0007;
      mf.mat.emissiveIntensity = 1.2 + 0.6 * Math.sin(now * 0.003);
    }

    glRenderer.render(scene, camera);
  }

  // ── Crossfade from 2D to 3D ────────────────────────────────────────────
  const canvas2d = document.getElementById('game-canvas');
  if (canvas2d) {
    canvas2d.style.transition = 'opacity 2s ease-out';
    canvas2d.style.opacity = '0';
  }

  // Start the 3D render loop immediately so the scene is ready behind the fade
  animate();

  // Fade in the Three.js canvas
  requestAnimationFrame(() => {
    threeCanvas.style.opacity = '1';
  });

  // Trigger narrator partway through the fade
  setTimeout(() => {
    if (narrator && narrator.triggerNarrator) {
      narrator.triggerNarrator('tab1_3d');
    }
  }, 1500);

  // Remove 2D canvas after transition completes
  setTimeout(() => {
    if (canvas2d) {
      canvas2d.style.display = 'none';
    }
  }, 2500);

  console.log('[Level 1] 3D mode activated. The loop is truly complete.');
}
