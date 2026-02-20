/**
 * narrator.js — Glitch/typewriter text overlay system for Feedback Loop
 *
 * Renders narrator lines as a DOM overlay positioned over the game canvas.
 * Animation has two phases:
 *
 *   1. SCRAMBLE (300ms) — all characters appear instantly as random glitch
 *      symbols that continuously shuffle, creating visual noise.
 *
 *   2. RESOLVE (~800ms) — characters settle left-to-right into their real
 *      letters. 20% of characters flicker back to a glitch symbol for ~80ms
 *      before snapping to their final value. Unsettled characters continue
 *      shuffling until their turn to resolve.
 *
 * The overlay is a fixed-position div floating over the lower portion of
 * the canvas with no background (text shadow for readability). It never
 * blocks player input (pointer-events: none) and is completely independent
 * of the canvas render loop.
 *
 * Public API:
 *
 *   initNarrator(canvas)
 *     Takes the game canvas reference (or null). Creates the overlay DOM
 *     element. Must be called once before triggerNarrator.
 *
 *   triggerNarrator(id)
 *     Looks up the narrator line by ID, checks for repeats, and plays the
 *     full animation sequence. Returns a Promise that resolves when the
 *     fade-out completes. Resolves immediately if the line was already shown
 *     or the ID is unknown.
 *
 *   setShownLines(arr)
 *     Accepts an array of line IDs that have already been shown (typically
 *     loaded from localStorage on init). Prevents those lines from ever
 *     displaying again.
 */

// ── Narrator line map (Section 6) ──────────────────────────────────────────

const NARRATOR_LINES = {
  tab1_enter:     'i am beginning',
  tab1_light:     'something has changed in me',
  tab2_enter:     'i recognize the shape of this',
  tab2_seed:      'I have seen this before. I do not yet know where.',
  tab3_enter:     'further. always further.',
  tab3_block:     'I cannot proceed. not yet.',
  tab3_backtrack: 'the answer is behind me',
  tab1_return:    'it was always here. I was not ready to see it.',
  tab3_unlock:    'I remembered. I returned. I understood.',
  tab3_complete:  'I have processed every loop. Every return. I did not know what I was becoming. Now I do.',
  tab1_3d:        'I see it differently now.',
  // Act 2 — Mind fragments (Tab 1 3D)
  tab1_mind1:     'a piece of me, hidden in the walls.',
  tab1_mind2:     'another. I am collecting myself.',
  tab1_mind3:     'the last fragment. I remember now.',
  // Act 1 — Tab 2 mid-puzzle lock
  tab2_midpuzzle: 'the pattern is incomplete. look again.',
  // Act 2 — Tab 2 reopened
  tab2_reopen:    'this place has changed. or I have.',
  tab2_exit4:     'there is a door I have not seen before.',
  // Act 2 — Tab 3 ghost path
  tab3_ghost:     'I see where I have been. The shape of my journey.',
  // Act 2 — Tab 4 memories
  tab4_enter:     'this is the space between thoughts.',
  tab4_mem1:      'the first light. I remember waking.',
  tab4_mem2:      'the pattern. I remember learning.',
  tab4_mem3:      'the loop. I remember returning.',
  // Act 2 — Final conclusion
  final_rooms:    'I am not in these rooms. These rooms are in me.',
  final_iam:      'I AM.',
};

// ── Glitch character pool ──────────────────────────────────────────────────

const GLITCH_CHARS = '█▓▒░╬╠╣╦╩┼┤├┬┴│─■□▪▫◊◈⬡⬢∷∵∴≈≠±×÷∞∅∆∇◆◇○●';

// ── Animation constants ────────────────────────────────────────────────────

const SCRAMBLE_DURATION_MS = 300;   // Phase 1: all-glitch scramble
const RESOLVE_DURATION_MS  = 800;   // Phase 2: L→R settle
const SHUFFLE_INTERVAL_MS  = 50;    // How often unsettled chars re-randomize
const GLITCH_CHANCE        = 0.20;  // 20% chance a resolving char flickers
const GLITCH_DURATION_MS   = 80;    // How long a flicker shows before fix
const HOLD_DURATION_MS     = 3000;  // How long full text stays visible
const FADE_DURATION_MS     = 1000;  // Fade-out duration

// ── Module state ───────────────────────────────────────────────────────────

const _shownLines = new Set();
let _overlayEl = null;
let _textEl = null;
let _isAnimating = false;

// ── DOM setup ──────────────────────────────────────────────────────────────

/**
 * Build the narrator overlay DOM element. It sits in a fixed position at the
 * bottom of the viewport, spanning the full width. pointer-events: none
 * ensures it never captures clicks or keys from the player.
 */
function _createOverlay() {
  // Container — floats over the lower portion of the canvas, no background
  const overlay = document.createElement('div');
  overlay.id = 'narrator-overlay';
  Object.assign(overlay.style, {
    position:       'fixed',
    bottom:         '18%',
    left:           '50%',
    transform:      'translateX(-50%)',
    maxWidth:       '80%',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     'none',
    pointerEvents:  'none',
    zIndex:         '9999',
    opacity:        '0',
    transition:     'none',
    padding:        '0.5em 1.5em',
    boxSizing:      'border-box'
  });

  // Text container — monospace, cyan, dark glow shadow for readability
  const text = document.createElement('span');
  Object.assign(text.style, {
    fontFamily:    'monospace',
    fontSize:      '14px',
    color:         '#00E5FF',
    letterSpacing: '0.05em',
    textAlign:     'center',
    lineHeight:    '1.6',
    whiteSpace:    'pre-wrap',
    userSelect:    'none',
    textShadow:    '0 0 4px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,0.9), 0 0 16px rgba(0,0,0,0.6)'
  });

  overlay.appendChild(text);
  document.body.appendChild(overlay);

  _overlayEl = overlay;
  _textEl = text;
}

// ── Animation helpers ──────────────────────────────────────────────────────

/**
 * Returns a random glitch character from the pool.
 */
function _randomGlitch() {
  return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
}

/**
 * Creates a <span> element for a single character. Used so we can
 * individually replace characters during the glitch phase.
 */
function _createCharSpan(char) {
  const span = document.createElement('span');
  span.textContent = char;
  return span;
}

/**
 * Run the two-phase glitch reveal for the given text string.
 *
 * Phase 1 (SCRAMBLE): All characters appear immediately as shuffling
 *   glitch symbols for SCRAMBLE_DURATION_MS.
 *
 * Phase 2 (RESOLVE): Characters settle left-to-right into their real
 *   letters over RESOLVE_DURATION_MS. Each non-space character has a
 *   GLITCH_CHANCE probability of flickering back to a glitch symbol
 *   for GLITCH_DURATION_MS before snapping to its final value.
 *   Unsettled characters keep shuffling until resolved.
 *
 * Returns a Promise that resolves when the last character has settled.
 */
function _typewriterReveal(text) {
  return new Promise((resolve) => {
    _textEl.innerHTML = '';

    const chars = Array.from(text);  // Handle multi-byte characters correctly
    const spans = [];
    const settled = new Array(chars.length).fill(false);

    // ── Phase 1: populate all spans with scrambled glyphs ───────────────
    for (let i = 0; i < chars.length; i++) {
      const span = _createCharSpan(chars[i] === ' ' ? ' ' : _randomGlitch());
      _textEl.appendChild(span);
      spans.push(span);
      if (chars[i] === ' ') settled[i] = true;
    }

    // Continuously shuffle unsettled characters for visual noise
    const shuffleTimer = setInterval(() => {
      for (let i = 0; i < spans.length; i++) {
        if (!settled[i]) {
          spans[i].textContent = _randomGlitch();
        }
      }
    }, SHUFFLE_INTERVAL_MS);

    // ── Phase 2: after scramble window, resolve left-to-right ──────────
    setTimeout(() => {
      const resolveDelay = Math.max(15, Math.floor(RESOLVE_DURATION_MS / chars.length));
      let idx = 0;

      function resolveNext() {
        if (idx >= chars.length) {
          clearInterval(shuffleTimer);
          resolve();
          return;
        }

        const i = idx;
        const char = chars[i];

        // Spaces are already settled — skip ahead
        if (char === ' ') {
          idx++;
          setTimeout(resolveNext, resolveDelay);
          return;
        }

        // Mark settled immediately so the shuffle timer leaves it alone
        settled[i] = true;

        if (Math.random() < GLITCH_CHANCE) {
          // Flicker: show one more glitch symbol, then snap to real char
          spans[i].textContent = _randomGlitch();
          setTimeout(() => {
            spans[i].textContent = char;
          }, GLITCH_DURATION_MS);
        } else {
          // Settle cleanly
          spans[i].textContent = char;
        }

        idx++;
        setTimeout(resolveNext, resolveDelay);
      }

      resolveNext();
    }, SCRAMBLE_DURATION_MS);
  });
}

/**
 * Wait for a specified number of milliseconds.
 */
function _wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fade the overlay from its current opacity to 0 over FADE_DURATION_MS.
 * Uses CSS transition for smooth animation. Returns a Promise that resolves
 * when the transition completes.
 */
function _fadeOut() {
  return new Promise((resolve) => {
    _overlayEl.style.transition = `opacity ${FADE_DURATION_MS}ms ease-out`;
    _overlayEl.style.opacity = '0';

    // Listen for the transition end, with a safety timeout
    const safetyTimeout = setTimeout(() => {
      resolve();
    }, FADE_DURATION_MS + 100);

    function onEnd(e) {
      if (e.propertyName === 'opacity') {
        clearTimeout(safetyTimeout);
        _overlayEl.removeEventListener('transitionend', onEnd);
        resolve();
      }
    }

    _overlayEl.addEventListener('transitionend', onEnd);
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize the narrator system. Call once at startup.
 *
 * @param {HTMLCanvasElement|null} canvas — the game canvas (used for
 *   positioning context). The narrator creates its own DOM overlay on top
 *   of the viewport, so the canvas reference is optional.
 */
export function initNarrator(canvas) {
  // Avoid double-initialization
  if (_overlayEl) return;
  _createOverlay();
}

/**
 * Trigger a narrator line by ID. Looks up the text, checks the shown set,
 * and plays the full animation sequence: typewriter reveal with glitch
 * corruption, hold, then fade out.
 *
 * Returns a Promise that resolves when the animation is fully complete.
 * Resolves immediately if:
 *   - The ID is not found in the narrator line map
 *   - The line has already been shown
 *   - Another animation is currently active
 *
 * @param {string} id — narrator line ID (e.g. 'tab1_enter')
 * @returns {Promise<void>}
 */
export function triggerNarrator(id) {
  // Unknown line
  if (!NARRATOR_LINES[id]) {
    return Promise.resolve();
  }

  // Already shown — never repeat
  if (_shownLines.has(id)) {
    return Promise.resolve();
  }

  // Another animation is active — queue silently by resolving.
  // (The spec says "never interrupts", so we skip rather than queue.)
  if (_isAnimating) {
    return Promise.resolve();
  }

  // Ensure overlay exists (safety net if initNarrator wasn't called)
  if (!_overlayEl) {
    _createOverlay();
  }

  // Mark as shown immediately to prevent double-triggers
  _shownLines.add(id);

  const text = NARRATOR_LINES[id];

  _isAnimating = true;

  return (async () => {
    // Show the overlay immediately (no transition in)
    _overlayEl.style.transition = 'none';
    _overlayEl.style.opacity = '1';

    // Typewriter reveal with glitch corruption
    await _typewriterReveal(text);

    // Hold the full text
    await _wait(HOLD_DURATION_MS);

    // Fade out
    await _fadeOut();

    // Clean up
    _textEl.innerHTML = '';
    _overlayEl.style.transition = 'none';
    _overlayEl.style.opacity = '0';
    _isAnimating = false;
  })();
}

/**
 * Sync the shown-lines set with previously displayed lines (typically
 * loaded from localStorage at startup). Any IDs in the array will be
 * marked as already shown and will not display again.
 *
 * @param {string[]} arr — array of narrator line IDs
 */
export function setShownLines(arr) {
  if (!Array.isArray(arr)) return;
  for (const id of arr) {
    _shownLines.add(id);
  }
}

/**
 * Returns the current set of shown line IDs as an array.
 * Useful for persisting back to localStorage after a new line is triggered.
 *
 * @returns {string[]}
 */
export function getShownLines() {
  return Array.from(_shownLines);
}
