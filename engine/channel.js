/**
 * engine/channel.js — BroadcastChannel wrapper for Feedback Loop
 *
 * Provides cross-tab communication via BroadcastChannel('feedbackloop').
 * Falls back to localStorage-based eventing if BroadcastChannel is unsupported.
 *
 * Message envelope: { type, fromTab, payload }
 * Valid types: STATE_CHANGE, TAB_COMPLETED, BACKTRACK_TRIGGER, PUZZLE_SOLVED, NARRATOR_TRIGGER
 */

const CHANNEL_NAME = 'feedbackloop';

const VALID_TYPES = new Set([
  'STATE_CHANGE',
  'TAB_COMPLETED',
  'BACKTRACK_TRIGGER',
  'PUZZLE_SOLVED',
  'NARRATOR_TRIGGER',
  'NEW_SYMBOL_FOUND',
  'MIND_FRAGMENTS_COLLECTED',
  'GAME_COMPLETE_FINAL',
]);

// ---------------------------------------------------------------------------
// Internal: detect BroadcastChannel support and set up the transport
// ---------------------------------------------------------------------------

const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined';

let channel = null;

if (hasBroadcastChannel) {
  channel = new BroadcastChannel(CHANNEL_NAME);
}

// Listener bookkeeping — maps user callbacks to the actual handler references
// so we can cleanly remove them from either transport.
const listenerMap = new Map();

// ---------------------------------------------------------------------------
// localStorage fallback helpers
// ---------------------------------------------------------------------------

// The fallback writes a serialised message to a well-known localStorage key.
// The `storage` event fires only in *other* tabs (same origin), which mirrors
// BroadcastChannel semantics (sender never receives its own message).

const LS_KEY = '__feedbackloop_channel__';

function lsFallbackPost(envelope) {
  // We append a unique nonce so that identical consecutive messages still
  // trigger a storage event (storage events only fire on *value change*).
  const wrapped = JSON.stringify({ ...envelope, _nonce: Date.now() + Math.random() });
  try {
    localStorage.setItem(LS_KEY, wrapped);
  } catch (_) {
    // localStorage full or unavailable — silently drop
  }
}

function lsFallbackListen(callback) {
  const handler = (event) => {
    if (event.key !== LS_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue);
      // Strip the nonce before handing to the consumer
      const { _nonce, ...message } = parsed;
      callback(message);
    } catch (_) {
      // Malformed payload — ignore
    }
  };
  window.addEventListener('storage', handler);
  return handler;
}

function lsFallbackRemove(handler) {
  window.removeEventListener('storage', handler);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a message to all other tabs.
 *
 * @param {string} type    — one of the VALID_TYPES
 * @param {object} payload — arbitrary data for this message
 * @param {number|string} fromTab — the tab id of the sender
 */
export function send(type, payload = {}, fromTab = null) {
  if (!VALID_TYPES.has(type)) {
    console.warn(`[channel] Unknown message type: "${type}"`);
  }

  const envelope = { type, fromTab, payload };

  if (hasBroadcastChannel && channel) {
    channel.postMessage(envelope);
  } else {
    lsFallbackPost(envelope);
  }
}

/**
 * Register a listener for incoming messages from other tabs.
 *
 * @param {function} callback — receives a parsed message object { type, fromTab, payload }
 */
export function onMessage(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('[channel] onMessage expects a function');
  }

  if (listenerMap.has(callback)) {
    // Already registered — skip to avoid duplicates
    return;
  }

  if (hasBroadcastChannel && channel) {
    const handler = (event) => {
      callback(event.data);
    };
    channel.addEventListener('message', handler);
    listenerMap.set(callback, handler);
  } else {
    const handler = lsFallbackListen(callback);
    listenerMap.set(callback, handler);
  }
}

/**
 * Remove a previously registered listener.
 *
 * @param {function} callback — the same function reference passed to onMessage
 */
export function removeListener(callback) {
  const handler = listenerMap.get(callback);
  if (!handler) return;

  if (hasBroadcastChannel && channel) {
    channel.removeEventListener('message', handler);
  } else {
    lsFallbackRemove(handler);
  }

  listenerMap.delete(callback);
}
