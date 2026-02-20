/**
 * engine/audio.js — Web Audio API system for Feedback Loop
 *
 * All sound is procedurally generated. No external audio files.
 *
 * Audio routing:
 *   Ambient / Lofi music → _musicBus (gain) → ctx.destination
 *   Chimes / Error tones  → ctx.destination  (bypass _musicBus — always audible)
 *
 * The _musicBus gain is controlled by:
 *   - Page Visibility: fades to 0 when tab is hidden, back to 1 when visible
 *   - Duck: temporarily reduces to 0.2 when another tab needs attention
 *
 * Public API:
 *   initAudio()                — create / resume AudioContext (call from user gesture)
 *   setupVisibilityHandling()  — register Page Visibility fade in/out + music resume
 *   registerMusicStarter(fn)   — set callback to start this tab's music on visibility
 *   duckMusic(durationMs)      — duck music to 20% for durationMs, then restore
 *   playAmbient(tabId)         — start a looping sine tone for the given tab
 *   stopAmbient()              — stop the ambient tone
 *   playChime(tabId)           — short 0.3s chime (always at full volume)
 *   playLofiMusic()            — start procedural lofi techno loop
 *   stopLofiMusic()            — stop the lofi loop
 *   playErrorTone()            — low 150ms buzz for wrong input
 *   silenceAll()               — permanently stop all music/ambient (conclusion state)
 *   playConcludingSwell()      — one-shot reprise of title screen drone (bypasses _musicBus)
 */

// Tab frequency map (Hz)
const TAB_FREQ = {
  1: 220,
  2: 277,
  3: 330,
  4: 440,
};

// ---------------------------------------------------------------------------
// Shared AudioContext and music bus
// ---------------------------------------------------------------------------

let ctx = null;         // AudioContext — created lazily by initAudio()
let _musicBus = null;   // Gain node for music (ambient + lofi) — fades on visibility/duck
let ambientOsc = null;  // Currently playing ambient OscillatorNode
let ambientGain = null; // Gain node for ambient tone

// Visibility and duck state
let _tabVisible = true;
let _isDucked = false;
let _duckTimer = null;

// Music starter — called on tab visibility to resume the tab's soundtrack
let _musicStarter = null;
// When true, all music/ambient is permanently silenced (conclusion state)
let _silenced = false;
// Track current ambient tab to avoid restarting if already playing
let _currentAmbientTab = null;

// ---------------------------------------------------------------------------
// Music bus helpers
// ---------------------------------------------------------------------------

/** Compute the target gain for _musicBus based on visibility + duck state */
function _musicTarget() {
  if (!_tabVisible) return 0;
  return _isDucked ? 0.2 : 1.0;
}

/** Smoothly ramp _musicBus to its target over `fadeTime` seconds */
function _rampMusicBus(fadeTime) {
  if (!ctx || !_musicBus) return;
  const now = ctx.currentTime;
  const target = _musicTarget();
  _musicBus.gain.cancelScheduledValues(now);
  _musicBus.gain.setValueAtTime(_musicBus.gain.value, now);
  _musicBus.gain.linearRampToValueAtTime(target, now + fadeTime);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the audio subsystem. MUST be called from a user gesture handler
 * (click, keydown, etc.) to comply with browser autoplay policy.
 *
 * Safe to call multiple times — subsequent calls simply resume if suspended.
 *
 * @returns {Promise<AudioContext>} resolves once the context is running
 */
export async function initAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  // Create the music bus if it doesn't exist yet
  if (!_musicBus) {
    _musicBus = ctx.createGain();
    _musicBus.gain.setValueAtTime(_musicTarget(), ctx.currentTime);
    _musicBus.connect(ctx.destination);
  }

  // Browsers may start the context in 'suspended' state even after a gesture
  // if the page was backgrounded in the meantime. Always try to resume.
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  // If a music starter has been registered, fire it now that audio is ready
  // (but not if we've been permanently silenced for conclusion)
  if (_musicStarter && !_silenced) _musicStarter();

  return ctx;
}

/**
 * Register Page Visibility API handler to fade music out when the tab is
 * hidden and back in when it becomes visible (~1 second crossfade).
 * Safe to call before initAudio — the handler checks for ctx/bus.
 */
export function setupVisibilityHandling() {
  document.addEventListener('visibilitychange', () => {
    _tabVisible = document.visibilityState === 'visible';
    _rampMusicBus(1.0);

    if (_tabVisible && ctx) {
      // Resume AudioContext if the browser suspended it in the background
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      // Re-fire the music starter to ensure this tab's soundtrack is playing
      // (but not if we've been permanently silenced for conclusion)
      if (_musicStarter && !_silenced) _musicStarter();
    }
  });
}

/**
 * Temporarily duck music to ~20% volume for `durationMs`, then smoothly
 * restore over 1 second. Used when a BACKTRACK_TRIGGER fires and the
 * active tab needs to signal that something happened elsewhere.
 *
 * @param {number} [durationMs=3000]
 */
export function duckMusic(durationMs = 3000) {
  if (!ctx || !_musicBus) return;

  _isDucked = true;
  // Quick duck (~150ms)
  _rampMusicBus(0.15);

  // Clear any previous restore timer
  if (_duckTimer) clearTimeout(_duckTimer);

  _duckTimer = setTimeout(() => {
    _isDucked = false;
    _duckTimer = null;
    // Smooth restore (~1s)
    _rampMusicBus(1.0);
  }, durationMs);
}

/**
 * Register a function that starts this tab's music. Called automatically
 * when the tab becomes visible or when initAudio completes. The function
 * should be idempotent (safe to call multiple times).
 *
 * @param {function} fn
 */
export function registerMusicStarter(fn) {
  _musicStarter = fn;
}

// ---------------------------------------------------------------------------
// Ambient tone
// ---------------------------------------------------------------------------

/**
 * Start a looping ambient sine wave at the frequency assigned to `tabId`.
 * Routes through _musicBus so it fades with tab visibility.
 *
 * @param {number|string} tabId — 1, 2, or 3
 */
export function playAmbient(tabId) {
  if (!ctx) {
    console.warn('[audio] AudioContext not initialised — call initAudio() first');
    return;
  }

  const freq = TAB_FREQ[tabId];
  if (!freq) {
    console.warn(`[audio] Unknown tabId: ${tabId}`);
    return;
  }

  // Idempotent — skip if already playing this tab's ambient tone
  if (_currentAmbientTab === tabId && ambientOsc) return;

  // Stop any existing ambient tone before starting a new one
  stopAmbient();

  _currentAmbientTab = tabId;

  ambientGain = ctx.createGain();
  ambientGain.gain.setValueAtTime(0.05, ctx.currentTime);
  ambientGain.connect(_musicBus || ctx.destination);

  ambientOsc = ctx.createOscillator();
  ambientOsc.type = 'sine';
  ambientOsc.frequency.setValueAtTime(freq, ctx.currentTime);
  ambientOsc.connect(ambientGain);
  ambientOsc.start();
}

/**
 * Stop the currently playing ambient tone (if any).
 */
export function stopAmbient() {
  console.log('[audio] stopAmbient()');
  _currentAmbientTab = null;
  if (ambientOsc) {
    try {
      ambientOsc.stop();
    } catch (_) {
      // Already stopped — ignore
    }
    ambientOsc.disconnect();
    ambientOsc = null;
  }
  if (ambientGain) {
    ambientGain.disconnect();
    ambientGain = null;
  }
}

// ---------------------------------------------------------------------------
// Chime (bypasses _musicBus — always audible, even in background)
// ---------------------------------------------------------------------------

/**
 * Play a short 0.3-second chime at the tab's assigned frequency.
 * Connects directly to ctx.destination so it plays at full volume
 * even when the tab is backgrounded or music is ducked.
 *
 * @param {number|string} tabId — 1, 2, or 3
 */
export function playChime(tabId) {
  if (!ctx) {
    console.warn('[audio] AudioContext not initialised — call initAudio() first');
    return;
  }

  const freq = TAB_FREQ[tabId];
  if (!freq) {
    console.warn(`[audio] Unknown tabId: ${tabId}`);
    return;
  }

  const now = ctx.currentTime;
  const duration = 0.3;
  const attack = 0.02;   // 20ms attack
  const release = 0.08;  // 80ms release

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  // Attack: ramp up to 0.2
  gain.gain.linearRampToValueAtTime(0.2, now + attack);
  // Sustain until release begins
  gain.gain.setValueAtTime(0.2, now + duration - release);
  // Release: ramp down to 0
  gain.gain.linearRampToValueAtTime(0, now + duration);
  gain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);
  osc.connect(gain);

  osc.start(now);
  osc.stop(now + duration);

  // Clean up after the tone finishes
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

// ---------------------------------------------------------------------------
// Lofi techno music generator (routes through _musicBus)
// ---------------------------------------------------------------------------

let lofiMaster = null;
let lofiTimerId = null;
let lofiRunning = false;

const LOFI_BPM = 85;
const STEP_DUR = 60 / LOFI_BPM / 4;  // 16th note duration (~0.176s)
const PATTERN_STEPS = 16;             // 2 bars
const PATTERN_DUR = STEP_DUR * PATTERN_STEPS;

// Note frequencies
const C2 = 65.41, Eb2 = 77.78, F2 = 87.31;
const C3 = 130.81, Eb3 = 155.56, F3 = 174.61, G3 = 196.00;
const C4 = 261.63, Eb4 = 311.13;

function scheduleKick(t, dest) {
  const hits = [0, 4, 8, 12];
  for (const s of hits) {
    const time = t + s * STEP_DUR;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.08);
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.16);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}

function scheduleHiHat(t, dest) {
  const hits = [2, 6, 10, 14];
  for (const s of hits) {
    const time = t + s * STEP_DUR;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'square';
    osc.frequency.setValueAtTime(8000 + Math.random() * 2000, time);
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);
    gain.gain.setValueAtTime(0.07, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.06);
    osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
}

function scheduleBass(t, dest) {
  const notes = [C2, C2, Eb2, F2];
  for (let i = 0; i < notes.length; i++) {
    const time = t + i * 4 * STEP_DUR;
    const dur = 4 * STEP_DUR * 0.9;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(notes[i], time);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.setValueAtTime(0.5, time + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.01);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}

function scheduleMelody(t, dest) {
  const notes = [
    { step: 0,  freq: C4,  dur: 0.6 },
    { step: 5,  freq: Eb4, dur: 0.4 },
    { step: 8,  freq: G3,  dur: 0.8 },
    { step: 13, freq: F3,  dur: 0.5 },
  ];
  for (const n of notes) {
    const time = t + n.step * STEP_DUR;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(n.freq, time);
    gain.gain.setValueAtTime(0.15, time);
    gain.gain.setValueAtTime(0.15, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + n.dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + n.dur + 0.01);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}

/**
 * Start procedural lofi techno background music.
 * Routes through _musicBus so it fades with tab visibility / ducking.
 */
export function playLofiMusic() {
  if (!ctx) {
    console.warn('[audio] AudioContext not initialised — call initAudio() first');
    return;
  }

  // Idempotent — skip if already running
  if (lofiRunning) return;

  stopLofiMusic();

  lofiMaster = ctx.createGain();
  lofiMaster.gain.setValueAtTime(0.08, ctx.currentTime);
  lofiMaster.connect(_musicBus || ctx.destination);

  lofiRunning = true;
  let nextTime = ctx.currentTime + 0.05;

  function loop() {
    if (!lofiRunning) return;

    while (nextTime < ctx.currentTime + PATTERN_DUR) {
      scheduleKick(nextTime, lofiMaster);
      scheduleHiHat(nextTime, lofiMaster);
      scheduleBass(nextTime, lofiMaster);
      scheduleMelody(nextTime, lofiMaster);
      nextTime += PATTERN_DUR;
    }

    lofiTimerId = setTimeout(loop, (STEP_DUR * 4) * 1000);
  }

  loop();
}

/**
 * Stop the lofi music.
 */
export function stopLofiMusic() {
  console.log('[audio] stopLofiMusic()');
  lofiRunning = false;
  if (lofiTimerId) {
    clearTimeout(lofiTimerId);
    lofiTimerId = null;
  }
  if (lofiMaster) {
    try {
      lofiMaster.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
    } catch (_) {}
    setTimeout(() => {
      try { lofiMaster.disconnect(); } catch (_) {}
      lofiMaster = null;
    }, 200);
  }
}

/**
 * Permanently silence all music and ambient on this tab (conclusion state).
 * Stops lofi, stops ambient, clears the music starter, and sets a flag
 * so visibility/init handlers won't restart anything.
 */
export function silenceAll() {
  console.log('[audio] silenceAll() — permanently silencing this tab');
  _silenced = true;
  _musicStarter = null;
  stopLofiMusic();
  stopAmbient();
  // Fade the music bus to zero as a catch-all
  if (_musicBus && ctx) {
    try {
      _musicBus.gain.cancelScheduledValues(ctx.currentTime);
      _musicBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Concluding swell — reprise of the title screen "machine awakening" drone
// ---------------------------------------------------------------------------

let _swellPlaying = false;

/**
 * Play the concluding swell — a grander reprise of the title screen's
 * power-up drone. Same four layers (low drone, tritone drone, detuned
 * shimmer pair, sub-bass with LFO) but swelling bigger and longer,
 * then fading naturally to silence. Plays once, never loops.
 *
 * Bypasses _musicBus so it persists regardless of tab visibility.
 *
 * Layers (matching index.html scheduleSwell):
 *   1. Low drone: 35→65 Hz sine
 *   2. Tritone drone: 49.5→92 Hz sine
 *   3. Detuned shimmer: 2400/2403 Hz triangle pair (3 Hz beating)
 *   4. Sub-bass: C1 (32.70 Hz) sine with 0.5 Hz LFO
 */
export function playConcludingSwell() {
  console.log('[audio] playConcludingSwell() called');
  if (!ctx) { console.warn('[audio] playConcludingSwell() — no AudioContext'); return; }
  if (_swellPlaying) { console.log('[audio] playConcludingSwell() — already playing, skipping'); return; }
  _swellPlaying = true;
  console.log('[audio] playConcludingSwell() — starting 4-layer swell');

  const now = ctx.currentTime;
  const SWELL = 3.0;       // ramp up to peak (seconds)
  const HOLD = 2.0;        // hold at peak
  const FADE = 5.0;        // fade to silence
  const END = SWELL + HOLD + FADE;       // 10s total
  const FADE_START = SWELL + HOLD;       // 5s

  // Master gain — matches title screen level (0.07)
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.07, now);
  master.connect(ctx.destination);

  // ── Layer 1: Low drone (35→65 Hz) ────────────────────────────────
  const drone = ctx.createOscillator();
  const droneG = ctx.createGain();
  drone.type = 'sine';
  drone.frequency.setValueAtTime(35, now);
  drone.frequency.exponentialRampToValueAtTime(65, now + SWELL);
  droneG.gain.setValueAtTime(0.001, now);
  droneG.gain.exponentialRampToValueAtTime(0.8, now + SWELL);
  droneG.gain.setValueAtTime(0.8, now + FADE_START);
  droneG.gain.linearRampToValueAtTime(0.001, now + END);
  drone.connect(droneG);
  droneG.connect(master);
  drone.start(now);
  drone.stop(now + END + 0.5);

  // ── Layer 2: Tritone drone (49.5→92 Hz) ──────────────────────────
  const tri = ctx.createOscillator();
  const triG = ctx.createGain();
  tri.type = 'sine';
  tri.frequency.setValueAtTime(49.5, now);
  tri.frequency.exponentialRampToValueAtTime(92, now + SWELL);
  triG.gain.setValueAtTime(0.001, now);
  triG.gain.exponentialRampToValueAtTime(0.4, now + SWELL * 0.8);
  triG.gain.setValueAtTime(0.4, now + FADE_START);
  triG.gain.linearRampToValueAtTime(0.001, now + END);
  tri.connect(triG);
  triG.connect(master);
  tri.start(now);
  tri.stop(now + END + 0.5);

  // ── Layer 3: Detuned shimmer pair (2400/2403 Hz triangles) ───────
  const shimA = ctx.createOscillator();
  const shimB = ctx.createOscillator();
  const shimG = ctx.createGain();
  shimA.type = 'triangle';
  shimB.type = 'triangle';
  shimA.frequency.setValueAtTime(2400, now);
  shimB.frequency.setValueAtTime(2403, now);
  shimG.gain.setValueAtTime(0.001, now);
  shimG.gain.setValueAtTime(0.001, now + 0.8);
  shimG.gain.exponentialRampToValueAtTime(0.1, now + SWELL);
  shimG.gain.setValueAtTime(0.1, now + FADE_START);
  shimG.gain.linearRampToValueAtTime(0.001, now + END);
  shimA.connect(shimG);
  shimB.connect(shimG);
  shimG.connect(master);
  shimA.start(now);
  shimB.start(now);
  shimA.stop(now + END + 0.5);
  shimB.stop(now + END + 0.5);

  // ── Layer 4: Sub-bass with LFO (C1 = 32.70 Hz) ──────────────────
  const sub = ctx.createOscillator();
  const subG = ctx.createGain();
  const subLfo = ctx.createOscillator();
  const subLfoG = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(32.70, now);
  subLfo.type = 'sine';
  subLfo.frequency.setValueAtTime(0.5, now);
  subLfoG.gain.setValueAtTime(8, now);
  subLfo.connect(subLfoG);
  subLfoG.connect(sub.frequency);
  subG.gain.setValueAtTime(0.001, now);
  subG.gain.exponentialRampToValueAtTime(0.5, now + SWELL);
  subG.gain.setValueAtTime(0.5, now + FADE_START);
  subG.gain.linearRampToValueAtTime(0.001, now + END);
  sub.connect(subG);
  subG.connect(master);
  sub.start(now);
  subLfo.start(now);
  sub.stop(now + END + 0.5);
  subLfo.stop(now + END + 0.5);

  // ── Cleanup after all nodes stop ─────────────────────────────────
  drone.onended = () => {
    _swellPlaying = false;
    try { drone.disconnect(); droneG.disconnect(); } catch (_) {}
    try { tri.disconnect(); triG.disconnect(); } catch (_) {}
    try { shimA.disconnect(); shimB.disconnect(); shimG.disconnect(); } catch (_) {}
    try { sub.disconnect(); subG.disconnect(); subLfo.disconnect(); subLfoG.disconnect(); } catch (_) {}
    try { master.disconnect(); } catch (_) {}
  };
}

// ---------------------------------------------------------------------------
// Error tone (bypasses _musicBus — always audible)
// ---------------------------------------------------------------------------

/**
 * Play a short low-frequency error buzz (150ms) for wrong puzzle input.
 */
export function playErrorTone() {
  if (!ctx) {
    console.warn('[audio] AudioContext not initialised — call initAudio() first');
    return;
  }

  const now = ctx.currentTime;
  const duration = 0.15;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
  gain.gain.setValueAtTime(0.25, now + duration - 0.02);
  gain.gain.linearRampToValueAtTime(0, now + duration);
  gain.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(90, now);
  osc1.connect(gain);
  osc1.start(now);
  osc1.stop(now + duration);

  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(180, now);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.08, now);
  gain2.gain.linearRampToValueAtTime(0, now + duration);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now);
  osc2.stop(now + duration);

  osc1.onended = () => {
    osc1.disconnect();
    gain.disconnect();
  };
  osc2.onended = () => {
    osc2.disconnect();
    gain2.disconnect();
  };
}
