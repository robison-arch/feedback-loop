/**
 * engine/favicon.js — Dynamic favicon system for Feedback Loop
 *
 * Renders circle, triangle, or square shapes onto a 32x32 offscreen canvas
 * in cyan (#00E5FF) on dark navy (#0A0F1E), then sets the result as the
 * page favicon.
 *
 * Public API:
 *   setFavicon(shape)   — render and apply a static favicon
 *   pulseFavicon(shape) — animate opacity 1.0 <-> 0.3 at 4Hz for 2s, then stop
 */

const SIZE = 32;
const BG_COLOR = '#0A0F1E';
const FG_COLOR = '#00E5FF';

// Debounce interval in milliseconds (reduced from 500ms to allow smooth pulse at 4Hz)
const DEBOUNCE_MS = 200;

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let canvas = null;
let ctxCanvas = null;

// Debounce tracking
let lastWriteTime = 0;
let pendingWrite = null;  // timeout id for a deferred write

// Pulse animation state
let pulseTimer = null;    // interval id
let pulseTimeout = null;  // timeout id that stops the pulse

// ---------------------------------------------------------------------------
// Canvas & link element helpers
// ---------------------------------------------------------------------------

function getCanvas() {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    ctxCanvas = canvas.getContext('2d');
  }
  return { canvas, ctx: ctxCanvas };
}

/**
 * Get or create the <link rel="icon"> element in the document head.
 */
function getLinkElement() {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    document.head.appendChild(link);
  }
  return link;
}

// ---------------------------------------------------------------------------
// Shape rendering
// ---------------------------------------------------------------------------

/**
 * Draw the specified shape onto the offscreen canvas.
 *
 * @param {string} shape — 'circle', 'triangle', or 'square'
 * @param {number} opacity — 0.0 to 1.0
 */
function renderShape(shape, opacity = 1.0) {
  const { ctx } = getCanvas();

  // Background
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Shape
  ctx.globalAlpha = opacity;
  ctx.fillStyle = FG_COLOR;

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const margin = 4; // px padding from edge

  switch (shape) {
    case 'circle': {
      const radius = (SIZE / 2) - margin;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'triangle': {
      // Equilateral-ish triangle pointing up, visually centred
      const top = margin;
      const bottom = SIZE - margin;
      const halfBase = (SIZE / 2) - margin;
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx + halfBase, bottom);
      ctx.lineTo(cx - halfBase, bottom);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'square': {
      const side = SIZE - margin * 2;
      ctx.fillRect(margin, margin, side, side);
      break;
    }

    default:
      console.warn(`[favicon] Unknown shape: "${shape}"`);
      return;
  }

  // Reset alpha
  ctx.globalAlpha = 1.0;
}

// ---------------------------------------------------------------------------
// Debounced favicon write
// ---------------------------------------------------------------------------

/**
 * Write the current canvas content to the page favicon, respecting the 500ms
 * debounce window. If a write was made too recently the update is deferred.
 */
function writeFavicon() {
  const now = Date.now();
  const elapsed = now - lastWriteTime;

  if (elapsed >= DEBOUNCE_MS) {
    // Safe to write immediately
    if (pendingWrite !== null) {
      clearTimeout(pendingWrite);
      pendingWrite = null;
    }
    const link = getLinkElement();
    link.href = canvas.toDataURL('image/png');
    lastWriteTime = Date.now();
  } else {
    // Schedule a deferred write for the remainder of the debounce window.
    // If there is already a pending write, do NOT schedule another — the
    // pending one will pick up whatever is on the canvas when it fires.
    if (pendingWrite === null) {
      pendingWrite = setTimeout(() => {
        pendingWrite = null;
        const link = getLinkElement();
        link.href = canvas.toDataURL('image/png');
        lastWriteTime = Date.now();
      }, DEBOUNCE_MS - elapsed);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render `shape` and apply it as the page favicon (debounced).
 *
 * @param {string} shape — 'circle', 'triangle', or 'square'
 */
export function setFavicon(shape) {
  // Stop any running pulse so it doesn't overwrite our static favicon
  stopPulse();

  renderShape(shape, 1.0);
  writeFavicon();
}

/**
 * Animate the favicon for `shape` by oscillating opacity between 1.0 and 0.3
 * at 4 Hz (250ms per half-cycle) for 2 seconds, then stop at full opacity.
 *
 * If a pulse is already running it is replaced.
 *
 * @param {string} shape — 'circle', 'triangle', or 'square'
 */
export function pulseFavicon(shape) {
  // Clear any existing pulse
  stopPulse();

  const PERIOD_MS = 250; // 4 Hz = 250ms per half-cycle
  const DURATION_MS = 2000;
  let bright = true;     // start at full opacity

  // Immediately render at full opacity
  renderShape(shape, 1.0);
  writeFavicon();

  pulseTimer = setInterval(() => {
    bright = !bright;
    const opacity = bright ? 1.0 : 0.3;
    renderShape(shape, opacity);
    writeFavicon();
  }, PERIOD_MS);

  // After 2 seconds, stop pulsing and ensure we end at full opacity
  pulseTimeout = setTimeout(() => {
    stopPulse();
    renderShape(shape, 1.0);
    writeFavicon();
  }, DURATION_MS);
}

/**
 * Internal helper — stop pulse animation timers.
 */
function stopPulse() {
  if (pulseTimer !== null) {
    clearInterval(pulseTimer);
    pulseTimer = null;
  }
  if (pulseTimeout !== null) {
    clearTimeout(pulseTimeout);
    pulseTimeout = null;
  }
}
