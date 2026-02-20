/**
 * state.js — localStorage state management for Feedback Loop
 *
 * All game state lives in a single JSON object under the localStorage key
 * "feedbackloop_state". Every write broadcasts a STATE_CHANGE message via
 * BroadcastChannel so other tabs can react immediately.
 *
 * Public API:
 *   getState()                  — returns the full parsed state object
 *   setState(updaterFn)         — updaterFn receives current state, returns new state; writes + broadcasts
 *   getTabState(tabId)          — shorthand for state.tabs[tabId]
 *   updateTabState(tabId, obj)  — shallow-merges obj into state.tabs[tabId]
 *   resetState()                — clears and reinitializes to defaults
 */

const STORAGE_KEY = 'feedbackloop_state';

// ── Default state schema (Section 4.3) ─────────────────────────────────────

function defaultState() {
  return {
    tabs: {
      '1': {
        visitCount: 0,
        state: 'unvisited',
        puzzleSolved: false,
        symbolsFound: [],
        floorRevealed: false
      },
      '2': {
        visitCount: 0,
        state: 'unvisited',
        puzzleSolved: false,
        symbolsFound: []
      },
      '3': {
        visitCount: 0,
        state: 'unvisited',
        puzzleSolved: false,
        backtrackedTo1: false
      },
      '4': {
        visitCount: 0,
        state: 'unvisited',
        fragmentsCollected: []
      }
    },
    player: {
      hasFlashlight: false,
      codeFragments: [],
      mindFragments: []
    },
    narrative: {
      shown: []
    },
    meta: {
      currentTab: null,
      highestTabUnlocked: 1,
      gameComplete: false,
      actTwoComplete: false
    }
  };
}

// ── BroadcastChannel integration ────────────────────────────────────────────

// TODO: Import from channel.js once it is built. For now we create a local
// BroadcastChannel instance so STATE_CHANGE messages still propagate.

let _channel = null;
try {
  _channel = new BroadcastChannel('feedbackloop');
} catch (_) {
  // BroadcastChannel unavailable (e.g. in a test runner)
}

function _broadcast(fromTab, payload) {
  if (!_channel) return;
  _channel.postMessage({
    type: 'STATE_CHANGE',
    fromTab: fromTab ?? null,
    payload: payload ?? {}
  });
}

// ── Core helpers ────────────────────────────────────────────────────────────

/**
 * Read and parse the full state object from localStorage.
 * If nothing is stored yet, initializes to the default schema.
 */
export function getState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      // Corrupted — reinitialize
    }
  }
  // First run or corrupted — write defaults and return them
  const initial = defaultState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

/**
 * Accepts an updater function: (currentState) => newState.
 * Writes the returned state back to localStorage and broadcasts STATE_CHANGE.
 *
 * @param {function} updater  — receives current state, must return the full state object
 * @param {number|string|null} fromTab — optional: which tab initiated the change
 */
export function setState(updater, fromTab = null) {
  const current = getState();
  const next = updater(current);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  _broadcast(fromTab, next);
  return next;
}

/**
 * Convenience: returns state.tabs[tabId].
 * @param {string|number} tabId
 */
export function getTabState(tabId) {
  const state = getState();
  return state.tabs[String(tabId)] ?? null;
}

/**
 * Shallow-merge `updates` into state.tabs[tabId] and persist.
 *
 * @param {string|number} tabId
 * @param {object} updates — key/value pairs to merge
 */
export function updateTabState(tabId, updates) {
  const id = String(tabId);
  return setState((state) => {
    state.tabs[id] = { ...state.tabs[id], ...updates };
    return state;
  }, tabId);
}

/**
 * Wipe all stored state and reinitialize to defaults.
 */
export function resetState() {
  const initial = defaultState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  _broadcast(null, initial);
  return initial;
}
