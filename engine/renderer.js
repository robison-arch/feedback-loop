/**
 * renderer.js — Canvas rendering engine for Feedback Loop
 *
 * Manages a 20x15 tile grid rendered on an HTML5 Canvas element.
 * Handles the game loop (60fps via requestAnimationFrame), player movement
 * with arrow-key input, tile-based collision detection, and the flashlight
 * lighting mechanic.
 *
 * Public API (all exported):
 *
 *   init(canvas, options)
 *     Initializes the renderer on the given <canvas> element.
 *     options.hasFlashlight — boolean, enables full flashlight radius
 *     Returns the renderer context object for further method calls.
 *
 *   setMap(wallMap)
 *     Sets the collision/wall map. wallMap is a 2D array [row][col] where
 *     1 = wall, 0 = floor. Dimensions must be 15 rows x 20 cols.
 *
 *   setInteractables(list)
 *     list is an array of { col, row, type, id, ... } objects that are
 *     rendered on the grid and can be interacted with via spacebar.
 *
 *   setOnInteract(callback)
 *     Register a callback: (interactable) => void, fired when the player
 *     presses spacebar adjacent to or on an interactable tile.
 *
 *   setPlayerPosition(col, row)
 *     Teleport the player to the given tile coordinate.
 *
 *   getPlayerPosition()
 *     Returns { col, row } of the player's current tile.
 *
 *   setFlashlight(enabled)
 *     Toggle the full flashlight (120px radius). When false, only a dim
 *     30px glow is drawn around the player.
 *
 *   setFullIllumination(enabled)
 *     When true, the entire map is fully lit (no darkness mask). Used
 *     for return visits to Tab 1.
 *
 *   destroy()
 *     Stops the game loop and removes event listeners.
 */

// ── Constants ───────────────────────────────────────────────────────────────

const COLS = 20;
const ROWS = 15;
const BG_COLOR = '#0A0F1E';
const GRID_COLOR = '#1A2340';
const WALL_COLOR = '#141A30';
const PLAYER_COLOR = '#00E5FF';
const INTERACTABLE_COLOR = '#00E5FF';

const FLASHLIGHT_RADIUS_ON = 120;   // Full flashlight
const FLASHLIGHT_RADIUS_OFF = 30;   // Tiny dim glow before acquisition

// Movement cooldown in ms to prevent flying across the grid
const MOVE_COOLDOWN_MS = 120;

// ── Module state (per-init instance) ────────────────────────────────────────

let _canvas = null;
let _ctx = null;
let _tileW = 0;
let _tileH = 0;
let _animFrameId = null;

// Player
let _playerCol = 0;
let _playerRow = 0;
let _facingDir = 'right';  // Direction player is facing: 'up', 'down', 'left', 'right'

// Map
let _wallMap = null;  // 2D array [row][col], 1=wall

// Lighting
let _hasFlashlight = false;
let _fullIllumination = false;

// Interactables
let _interactables = [];
let _onInteract = null;
let _onMove = null;

// Visual effects
let _activePulses = [];  // { x, y, startTime, duration, maxRadius }

// Input tracking
const _keys = {};
let _lastMoveTime = 0;

// ── Input handling ──────────────────────────────────────────────────────────

function _onKeyDown(e) {
  // Prevent default for arrow keys and spacebar so the page doesn't scroll
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }
  _keys[e.key] = true;

  // Update facing direction instantly on keypress (independent of movement cooldown)
  if (e.key === 'ArrowUp')    _facingDir = 'up';
  if (e.key === 'ArrowDown')  _facingDir = 'down';
  if (e.key === 'ArrowLeft')  _facingDir = 'left';
  if (e.key === 'ArrowRight') _facingDir = 'right';

  // Spacebar interaction — fire immediately on keydown, not in the loop
  if (e.key === ' ') {
    _handleInteraction();
  }
}

function _onKeyUp(e) {
  _keys[e.key] = false;
}

function _handleInteraction() {
  if (!_onInteract || _interactables.length === 0) return;

  // Check for interactables on the player's tile or orthogonally adjacent
  const dirs = [
    { dc: 0, dr: 0 },   // on tile
    { dc: 0, dr: -1 },  // up
    { dc: 0, dr: 1 },   // down
    { dc: -1, dr: 0 },  // left
    { dc: 1, dr: 0 }    // right
  ];

  for (const item of _interactables) {
    for (const d of dirs) {
      if (item.col === _playerCol + d.dc && item.row === _playerRow + d.dr) {
        _onInteract(item);
        return;  // Only fire one interaction per press
      }
    }
  }
}

// ── Movement & collision ────────────────────────────────────────────────────

function _processMovement(timestamp) {
  if (timestamp - _lastMoveTime < MOVE_COOLDOWN_MS) return;

  let dc = 0;
  let dr = 0;
  if (_keys['ArrowUp'])    dr = -1;
  if (_keys['ArrowDown'])  dr = 1;
  if (_keys['ArrowLeft'])  dc = -1;
  if (_keys['ArrowRight']) dc = 1;

  // Ignore diagonal or no input
  if ((dc === 0 && dr === 0) || (dc !== 0 && dr !== 0)) return;

  const nextCol = _playerCol + dc;
  const nextRow = _playerRow + dr;

  // Bounds check
  if (nextCol < 0 || nextCol >= COLS || nextRow < 0 || nextRow >= ROWS) return;

  // Wall check
  if (_wallMap && _wallMap[nextRow] && _wallMap[nextRow][nextCol] === 1) return;

  _playerCol = nextCol;
  _playerRow = nextRow;
  _lastMoveTime = timestamp;

  // Fire move callback (wrapped in try/catch to prevent game loop crash)
  if (_onMove) {
    try { _onMove(nextCol, nextRow); } catch (err) {
      console.error('[renderer] onMove callback error:', err);
    }
  }
}

// ── Rendering ───────────────────────────────────────────────────────────────

function _render(timestamp) {
  const w = _canvas.width;
  const h = _canvas.height;

  // Recalculate tile sizes each frame so resizes are picked up automatically
  _tileW = w / COLS;
  _tileH = h / ROWS;

  // Clear
  _ctx.fillStyle = BG_COLOR;
  _ctx.fillRect(0, 0, w, h);

  // Draw grid lines
  _ctx.strokeStyle = GRID_COLOR;
  _ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    const x = c * _tileW;
    _ctx.beginPath();
    _ctx.moveTo(x, 0);
    _ctx.lineTo(x, h);
    _ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    const y = r * _tileH;
    _ctx.beginPath();
    _ctx.moveTo(0, y);
    _ctx.lineTo(w, y);
    _ctx.stroke();
  }

  // Draw walls
  if (_wallMap) {
    _ctx.fillStyle = WALL_COLOR;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (_wallMap[r] && _wallMap[r][c] === 1) {
          _ctx.fillRect(c * _tileW + 1, r * _tileH + 1, _tileW - 2, _tileH - 2);
        }
      }
    }
  }

  // NOTE: Interactables are drawn AFTER the darkness mask so they are only
  // visible in illuminated areas. See below.

  // Draw player — small cyan circle centered on the tile
  const px = _playerCol * _tileW + _tileW / 2;
  const py = _playerRow * _tileH + _tileH / 2;
  const playerRadius = Math.min(_tileW, _tileH) * 0.3;

  _ctx.fillStyle = PLAYER_COLOR;
  _ctx.shadowColor = PLAYER_COLOR;
  _ctx.shadowBlur = 10;
  _ctx.beginPath();
  _ctx.arc(px, py, playerRadius, 0, Math.PI * 2);
  _ctx.fill();
  _ctx.shadowBlur = 0;

  // ── Darkness / flashlight mask ──────────────────────────────────────────

  if (!_fullIllumination) {
    const FACING_ANGLES = { 'right': 0, 'down': Math.PI / 2, 'left': Math.PI, 'up': -Math.PI / 2 };

    // Create an offscreen canvas for the darkness mask (reuse for perf)
    if (!_render._maskCanvas) {
      _render._maskCanvas = document.createElement('canvas');
    }
    const mask = _render._maskCanvas;
    mask.width = w;
    mask.height = h;
    const mctx = mask.getContext('2d');

    // Fill entirely with near-black overlay
    mctx.fillStyle = 'rgba(5, 8, 15, 0.98)';
    mctx.fillRect(0, 0, w, h);

    // Punch holes using destination-out compositing
    mctx.globalCompositeOperation = 'destination-out';

    if (_hasFlashlight) {
      // ── Directional cone flashlight ──────────────────────────────────
      const angle = FACING_ANGLES[_facingDir];
      const coneHalfAngle = Math.PI / 5.5;  // ~33 degrees each side ≈ 65 degree cone
      const coneLength = Math.max(_tileW, _tileH) * 7;

      // Cone cutout: clip to pie-slice shape, fill with radial fade
      mctx.save();
      mctx.beginPath();
      mctx.moveTo(px, py);
      mctx.arc(px, py, coneLength, angle - coneHalfAngle, angle + coneHalfAngle);
      mctx.closePath();
      mctx.clip();

      const coneGrad = mctx.createRadialGradient(px, py, 0, px, py, coneLength);
      coneGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      coneGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.85)');
      coneGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.4)');
      coneGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      mctx.fillStyle = coneGrad;
      mctx.fillRect(0, 0, w, h);
      mctx.restore();

      // Tiny ambient glow so player can see their own tile
      const nearRadius = _tileW * 0.9;
      const nearGlow = mctx.createRadialGradient(px, py, 0, px, py, nearRadius);
      nearGlow.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
      nearGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      mctx.fillStyle = nearGlow;
      mctx.beginPath();
      mctx.arc(px, py, nearRadius, 0, Math.PI * 2);
      mctx.fill();
    } else {
      // ── Pre-flashlight: minimal glow — just the player's tile ────────
      const dimRadius = _tileW * 0.8;
      const dimGlow = mctx.createRadialGradient(px, py, 0, px, py, dimRadius);
      dimGlow.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
      dimGlow.addColorStop(0.6, 'rgba(0, 0, 0, 0.15)');
      dimGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      mctx.fillStyle = dimGlow;
      mctx.beginPath();
      mctx.arc(px, py, dimRadius, 0, Math.PI * 2);
      mctx.fill();
    }

    // Reset composite mode
    mctx.globalCompositeOperation = 'source-over';

    // Draw the mask onto the main canvas
    _ctx.drawImage(mask, 0, 0);

    // ── Cyan tint in the lit area ───────────────────────────────────────
    if (_hasFlashlight) {
      const angle = FACING_ANGLES[_facingDir];
      const coneHalfAngle = Math.PI / 5.5;
      const coneLength = Math.max(_tileW, _tileH) * 7;

      _ctx.save();
      _ctx.beginPath();
      _ctx.moveTo(px, py);
      _ctx.arc(px, py, coneLength * 0.8, angle - coneHalfAngle, angle + coneHalfAngle);
      _ctx.closePath();
      _ctx.clip();

      const tintGrad = _ctx.createRadialGradient(px, py, 0, px, py, coneLength * 0.8);
      tintGrad.addColorStop(0, 'rgba(0, 229, 255, 0.07)');
      tintGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
      _ctx.fillStyle = tintGrad;
      _ctx.fillRect(0, 0, w, h);
      _ctx.restore();
    } else {
      const dimTintRadius = _tileW * 1.0;
      const dimTint = _ctx.createRadialGradient(px, py, 0, px, py, dimTintRadius);
      dimTint.addColorStop(0, 'rgba(0, 229, 255, 0.04)');
      dimTint.addColorStop(1, 'rgba(0, 229, 255, 0)');
      _ctx.fillStyle = dimTint;
      _ctx.beginPath();
      _ctx.arc(px, py, dimTintRadius, 0, Math.PI * 2);
      _ctx.fill();
    }

    // ── Non-glow interactables: only visible within the flashlight cone ──
    if (_hasFlashlight) {
      const angle = FACING_ANGLES[_facingDir];
      const coneHalfAngle = Math.PI / 5.5;
      const coneLength = Math.max(_tileW, _tileH) * 7;

      _ctx.save();
      _ctx.beginPath();
      // Cone region
      _ctx.moveTo(px, py);
      _ctx.arc(px, py, coneLength, angle - coneHalfAngle, angle + coneHalfAngle);
      _ctx.closePath();
      // Plus small circle around player
      _ctx.arc(px, py, _tileW * 0.9, 0, Math.PI * 2);
      _ctx.clip();

      for (const item of _interactables) {
        if (item.glow) continue;
        const cx = item.col * _tileW + _tileW / 2;
        const cy = item.row * _tileH + _tileH / 2;
        const size = Math.min(_tileW, _tileH) * 0.3;
        _ctx.fillStyle = item.color || INTERACTABLE_COLOR;
        _ctx.globalAlpha = 0.8;
        _ctx.beginPath();
        _ctx.moveTo(cx, cy - size);
        _ctx.lineTo(cx + size, cy);
        _ctx.lineTo(cx, cy + size);
        _ctx.lineTo(cx - size, cy);
        _ctx.closePath();
        _ctx.fill();
      }
      _ctx.globalAlpha = 1.0;
      _ctx.restore();
    }
    // Pre-flashlight: non-glow interactables are completely hidden (not drawn)

    // ── Glow sources: visible beacons through the darkness ──────────────
    for (const item of _interactables) {
      if (item.glow) {
        const ix = item.col * _tileW + _tileW / 2;
        const iy = item.row * _tileH + _tileH / 2;
        const baseRadius = item.glowRadius || _tileW * 2;
        const pulse = 1 + 0.15 * Math.sin((timestamp || 0) * 0.003);
        const glowR = baseRadius * pulse;

        // Soft pulsing glow beacon
        const g = _ctx.createRadialGradient(ix, iy, 0, ix, iy, glowR);
        g.addColorStop(0, 'rgba(0, 229, 255, 0.25)');
        g.addColorStop(0.4, 'rgba(0, 229, 255, 0.1)');
        g.addColorStop(1, 'rgba(0, 229, 255, 0)');
        _ctx.fillStyle = g;
        _ctx.beginPath();
        _ctx.arc(ix, iy, glowR, 0, Math.PI * 2);
        _ctx.fill();

        // Bright center dot (the "lantern")
        _ctx.fillStyle = `rgba(0, 229, 255, ${0.5 + 0.2 * Math.sin((timestamp || 0) * 0.004)})`;
        _ctx.shadowColor = '#00E5FF';
        _ctx.shadowBlur = 8;
        _ctx.beginPath();
        _ctx.arc(ix, iy, _tileW * 0.15, 0, Math.PI * 2);
        _ctx.fill();
        _ctx.shadowBlur = 0;
      }
    }
  } else {
    // ── Full illumination: draw all interactables normally ───────────────
    for (const item of _interactables) {
      const cx = item.col * _tileW + _tileW / 2;
      const cy = item.row * _tileH + _tileH / 2;
      const size = Math.min(_tileW, _tileH) * 0.3;
      _ctx.fillStyle = item.color || INTERACTABLE_COLOR;
      _ctx.globalAlpha = 0.8;
      _ctx.beginPath();
      _ctx.moveTo(cx, cy - size);
      _ctx.lineTo(cx + size, cy);
      _ctx.lineTo(cx, cy + size);
      _ctx.lineTo(cx - size, cy);
      _ctx.closePath();
      _ctx.fill();
    }
    _ctx.globalAlpha = 1.0;
  }

  // ── Pulse effects (drawn on top of everything) ──────────────────────────
  for (let i = _activePulses.length - 1; i >= 0; i--) {
    const p = _activePulses[i];
    const elapsed = Math.max(0, (timestamp || 0) - p.startTime);
    const progress = elapsed / p.duration;

    if (progress >= 1) {
      _activePulses.splice(i, 1);
      continue;
    }

    const radius = Math.max(0, p.maxRadius * progress);
    const alpha = 0.6 * (1 - progress);

    _ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
    _ctx.lineWidth = 3 * (1 - progress) + 1;
    _ctx.shadowColor = '#00E5FF';
    _ctx.shadowBlur = 12 * (1 - progress);
    _ctx.beginPath();
    _ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    _ctx.stroke();
    _ctx.shadowBlur = 0;
  }
}

// ── Game loop ───────────────────────────────────────────────────────────────

function _loop(timestamp) {
  try {
    _processMovement(timestamp);
    _render(timestamp);
  } catch (err) {
    console.error('[renderer] loop error:', err);
  }
  _animFrameId = requestAnimationFrame(_loop);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialize the renderer on the given canvas element.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @param {boolean} [options.hasFlashlight=false] — start with full flashlight
 * @param {boolean} [options.fullIllumination=false] — start fully lit
 */
export function init(canvas, options = {}) {
  _canvas = canvas;
  _ctx = canvas.getContext('2d');

  _tileW = canvas.width / COLS;
  _tileH = canvas.height / ROWS;

  _hasFlashlight = !!options.hasFlashlight;
  _fullIllumination = !!options.fullIllumination;

  // Default empty map (no walls)
  if (!_wallMap) {
    _wallMap = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  // Default player position — bottom-left corner
  _playerCol = 1;
  _playerRow = ROWS - 2;

  // Reset interactables and callbacks
  _interactables = [];
  _onInteract = null;
  _onMove = null;
  _activePulses = [];

  // Attach input listeners
  window.addEventListener('keydown', _onKeyDown);
  window.addEventListener('keyup', _onKeyUp);

  // Start the loop
  _animFrameId = requestAnimationFrame(_loop);
}

/**
 * Set the tile map. wallMap[row][col] = 1 means wall, 0 means floor.
 * @param {number[][]} wallMap — 15 rows x 20 cols
 */
export function setMap(wallMap) {
  _wallMap = wallMap;
}

/**
 * Set the list of interactable objects rendered on the grid.
 * Each object should have at minimum: { col, row, type, id }.
 * Optional: { color } to override the default cyan.
 *
 * @param {object[]} list
 */
export function setInteractables(list) {
  _interactables = list || [];
}

/**
 * Register a callback fired when the player presses spacebar near an interactable.
 * @param {function} callback — receives the interactable object
 */
export function setOnInteract(callback) {
  _onInteract = callback;
}

/**
 * Move the player to an exact tile position.
 * @param {number} col
 * @param {number} row
 */
export function setPlayerPosition(col, row) {
  _playerCol = col;
  _playerRow = row;
}

/**
 * Get the player's current tile position.
 * @returns {{ col: number, row: number }}
 */
export function getPlayerPosition() {
  return { col: _playerCol, row: _playerRow };
}

/**
 * Enable or disable the full flashlight (120px radius).
 * When disabled, only a 30px dim glow is shown.
 * @param {boolean} enabled
 */
export function setFlashlight(enabled) {
  _hasFlashlight = !!enabled;
}

/**
 * Enable or disable full map illumination (no darkness mask).
 * Used for return visits to already-explored levels.
 * @param {boolean} enabled
 */
export function setFullIllumination(enabled) {
  _fullIllumination = !!enabled;
}

/**
 * Register a callback fired whenever the player moves to a new tile.
 * @param {function} callback — receives (col, row)
 */
export function setOnMove(callback) {
  _onMove = callback;
}

/**
 * Trigger an expanding cyan pulse ring at the given tile position.
 * @param {number} col
 * @param {number} row
 * @param {number} [duration=500] — duration in ms
 */
export function triggerPulse(col, row, duration = 500) {
  const x = col * (_canvas.width / COLS) + (_canvas.width / COLS) / 2;
  const y = row * (_canvas.height / ROWS) + (_canvas.height / ROWS) / 2;
  _activePulses.push({
    x, y,
    startTime: performance.now(),
    duration,
    maxRadius: Math.max(_canvas.width / COLS, _canvas.height / ROWS) * 5,
  });
}

/**
 * Stop the game loop and clean up event listeners.
 */
export function destroy() {
  if (_animFrameId) {
    cancelAnimationFrame(_animFrameId);
    _animFrameId = null;
  }
  window.removeEventListener('keydown', _onKeyDown);
  window.removeEventListener('keyup', _onKeyUp);
}

// Export grid constants so levels can reference them
export const GRID_COLS = COLS;
export const GRID_ROWS = ROWS;
