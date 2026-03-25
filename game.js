// ========================
// GAME STATE
// ========================
let G = {
  players: [],      // [{id, name, hand, score, isBot, wentOut, isLocalPlayer}]
  deck: [],
  discardPile: [],
  round: 1,         // 1-11
  currentTurn: 0,   // player index
  startingPlayer: 0, // who goes first this round (rotates CW each round)
  phase: 'draw',    // draw | discard | lastTurns
  lastTurnPlayer: -1,
  lastTurnCount: 0,
  localPlayerIdx: 0,
  drawnCard: null,
  drawnFromDiscard: false,
  selectedCardIdx: -1,
  selectedCardId: null,  // track selected card by ID (survives re-renders/reorders)
  botGame: true,
  gameOver: false,
  dealing: false,
  discardDropHighlight: false,
  revealedSet: new Set(),
  previewCard: null,   // card being previewed for discard by current player
  // Stores the local player's custom hand order (card IDs in order) so drags
  // survive Firebase state pushes without being reset to server order.
  localHandOrder: null,
};

// Queues the latest remote state while an animation is playing,
// so mid-animation Firebase updates don't corrupt in-progress animations.
let pendingRemoteState = null;
let isAnimating = false;

function withAnimation(fn) {
  isAnimating = true;
  fn(() => {
    isAnimating = false;
    if (pendingRemoteState) {
      const s = pendingRemoteState;
      pendingRemoteState = null;
      applyRemoteState(s);
    }
  });
}

// ========================
// CARD DEFINITIONS
// ========================
const SUITS = ['clubs','hearts','spades','stars','diamonds'];
const SUIT_SYMBOLS = { clubs:'♣︎', hearts:'♥︎', spades:'♠︎', stars:'★︎', diamonds:'♦︎' };
const VALUES = [3,4,5,6,7,8,9,10,'J','Q','K'];
const VALUE_POINTS = { J:11, Q:12, K:13 };

function cardValue(v) {
  if (typeof v === 'number') return v;
  return VALUE_POINTS[v] || 0;
}

function cardNumericRank(v) {
  const map = {3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13};
  return map[v] || 0;
}

function makeDeck() {
  const deck = [];
  let id = 0;
  for (let d = 0; d < 2; d++) {
    for (const suit of SUITS) {
      for (const val of VALUES) {
        deck.push({ id: id++, suit, val, isJoker: false });
      }
    }
    for (let j = 0; j < 3; j++) {
      deck.push({ id: id++, suit: 'joker', val: 'JK', isJoker: true });
    }
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function wildValue() {
  const cardsDealt = G.round + 2;
  if (cardsDealt === 11) return 'J';
  if (cardsDealt === 12) return 'Q';
  if (cardsDealt === 13) return 'K';
  return cardsDealt;
}

function isWild(card) {
  if (card.isJoker) return true;
  return card.val === wildValue();
}

function isMyTurn() {
  return G.players[G.currentTurn]?.isLocalPlayer === true;
}

// ========================
// SCREEN MANAGEMENT
// ========================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('hidden', s.id !== id);
  });
}

// ========================
// FIREBASE CONFIG
// Replace these values with your own Firebase project credentials.
// Create a free project at https://console.firebase.google.com
// then go to Project Settings → Your Apps → Web App → SDK setup & config
// ========================
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB1PflQzaBtMKgBoJRW6bGLUW_YJ0Vk5BU",
  authDomain: "crowns-128c6.firebaseapp.com",
  databaseURL: "https://crowns-128c6-default-rtdb.firebaseio.com/",  // ← ADD THIS
  projectId: "crowns-128c6",
  storageBucket: "crowns-128c6.firebasestorage.app",
  messagingSenderId: "425271577628",
  appId: "1:425271577628:web:a0a67b3d9e577af5b4a3d9",
  measurementId: "G-ECFP9L9455"
};

// Firebase references (populated after init)
let fbApp = null, fbDb = null;
let fbLobbyRef = null, fbGameRef = null, fbLobbyListener = null, fbGameListener = null;

function initFirebase() {
  if (fbApp) return;
  // Guard: catch missing/placeholder credentials before they cause a silent hang
  if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('YOUR_')) {
    throw new Error(
      'Firebase is not configured.\n\n' +
      'Open game.js and replace the FIREBASE_CONFIG placeholder values with ' +
      'your real Firebase project credentials.\n\n' +
      'Get them at: https://console.firebase.google.com → Project Settings → Your Apps → Web App'
    );
  }
  fbApp = firebase.initializeApp(FIREBASE_CONFIG);
  fbDb  = firebase.database();
}

// ========================
// LOBBY
// ========================
let lobbyCode   = '';
let isLocalHost = false;
let myPlayerId  = '';
let myPlayerIdx = 0;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createLobby() {
  try { initFirebase(); } catch (e) { alert(e.message); return; }
  const name = document.getElementById('create-player-name').value.trim() || 'Host';
  lobbyCode   = generateCode();
  isLocalHost = true;
  myPlayerId  = 'host_' + Date.now();
  myPlayerIdx = 0;

  document.getElementById('lobby-code-display').textContent = lobbyCode;

  const lobbyData = {
    code: lobbyCode,
    players: [{ name, id: myPlayerId, isHost: true }],
    started: false,
    created: Date.now()
  };

  fbLobbyRef = fbDb.ref('lobbies/' + lobbyCode);

  const createBtn = document.querySelector('#create-lobby-screen .btn-primary');
  if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creating...'; }

  // Wait for Firebase to confirm the write before showing the lobby screen.
  // If we show it optimistically, the phone may try to join before the data
  // actually exists in the database and get "room not found".
  fbLobbyRef.set(lobbyData).then(() => {
    if (createBtn) { createBtn.disabled = false; createBtn.textContent = 'Create Room'; }
    // Verify the data is actually readable before showing the code
    return fbLobbyRef.get().then(snap => {
      document.getElementById('lobby-code-display').textContent = lobbyCode;
      updateLobbyUI(lobbyData);
      showScreen('lobby-waiting-screen');
      fbLobbyRef.onDisconnect().remove();
      attachLobbyListener();
    });
  }).catch(err => {
    if (createBtn) { createBtn.disabled = false; createBtn.textContent = 'Create Room'; }
    console.error('Firebase write failed:', err);
    showToast('Connection error: ' + err.message);
    showScreen('create-lobby-screen');
  });
}

function attachLobbyListener() {
  if (fbLobbyListener) fbLobbyRef.off('value', fbLobbyListener);
  fbLobbyListener = fbLobbyRef.on('value', snap => {
    const data = snap.val();
    if (!data) return;
    updateLobbyUI(data);
    if (data.started) {
      fbLobbyRef.off('value', fbLobbyListener);
      // Recalculate myPlayerIdx from current player list (handles late joiners)
      const idx = normalisePlayers(data.players).findIndex(p => p.id === myPlayerId);
      myPlayerIdx = idx >= 0 ? idx : myPlayerIdx;
      startMultiplayerGame(data, myPlayerIdx);
    }
  });
}

// Firebase can return arrays as objects with numeric keys when roundtripping
// through the database (especially single-element arrays). Always normalise.
function normalisePlayers(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Object.values(raw);
}

function updateLobbyUI(data) {
  const players = normalisePlayers(data.players);
  const list = document.getElementById('lobby-players-list');
  list.innerHTML = '';
  const slots = 6;
  for (let i = 0; i < slots; i++) {
    const p = players[i];
    const row = document.createElement('div');
    row.className = 'lobby-player-row';

    if (p) {
      const dragHandle = isLocalHost
        ? `<span style="color:rgba(255,255,255,0.3);font-size:14px;cursor:grab;margin-right:2px;user-select:none">⠿</span>`
        : '';
      const badge = p.isHost ? `<span style="margin-left:auto;font-size:11px;color:var(--gold)">HOST</span>` : '';
      row.innerHTML = `${dragHandle}<div class="player-dot"></div>
        <span style="font-size:14px">${p.name}</span>${badge}`;
      row.dataset.playerIdx = i;
      if (isLocalHost) {
        row.draggable = true;
        row.style.cursor = 'grab';
        attachLobbyRowDrag(row);
      }
    } else {
      row.innerHTML = `<div class="player-dot empty"></div>
        <span style="font-size:14px"><span style="color:rgba(255,255,255,0.3);font-style:italic">Open slot</span></span>`;
    }

    list.appendChild(row);
  }
  const canStart = players.length >= 2;
  const startBtn = document.getElementById('start-lobby-btn');
  if (startBtn) {
    startBtn.style.display = isLocalHost ? '' : 'none';
    startBtn.disabled      = !canStart;
    startBtn.style.opacity = canStart ? '1' : '0.4';
  }
  document.getElementById('lobby-wait-msg').textContent =
    `${players.length}/6 players — ${canStart ? 'Ready to start!' : 'Need at least 2 players'}`;
}

let lobbyDragSrcIdx = null;

function attachLobbyRowDrag(row) {
  row.addEventListener('dragstart', e => {
    lobbyDragSrcIdx = parseInt(row.dataset.playerIdx);
    row.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
  });

  row.addEventListener('dragend', () => {
    row.style.opacity = '';
    document.querySelectorAll('.lobby-player-row').forEach(r => {
      r.classList.remove('lobby-drag-over');
    });
  });

  row.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetIdx = parseInt(row.dataset.playerIdx);
    if (!isNaN(targetIdx) && targetIdx !== lobbyDragSrcIdx) {
      row.classList.add('lobby-drag-over');
    }
  });

  row.addEventListener('dragleave', () => {
    row.classList.remove('lobby-drag-over');
  });

  row.addEventListener('drop', e => {
    e.preventDefault();
    row.classList.remove('lobby-drag-over');
    const targetIdx = parseInt(row.dataset.playerIdx);
    if (isNaN(targetIdx) || targetIdx === lobbyDragSrcIdx || lobbyDragSrcIdx === null) return;
    reorderLobbyPlayer(lobbyDragSrcIdx, targetIdx);
    lobbyDragSrcIdx = null;
  });
}

function reorderLobbyPlayer(fromIdx, toIdx) {
  if (!isLocalHost || !fbLobbyRef) return;
  fbLobbyRef.get().then(snap => {
    const data = snap.val();
    if (!data) return;
    const players = normalisePlayers(data.players);
    if (fromIdx < 0 || fromIdx >= players.length) return;
    if (toIdx  < 0 || toIdx  >= players.length) return;
    const [moved] = players.splice(fromIdx, 1);
    players.splice(toIdx, 0, moved);
    fbLobbyRef.child('players').set(players);
  });
}

function startLobbyGame() {
  if (!fbLobbyRef) return;
  fbLobbyRef.get().then(snap => {
    const data = snap.val();
    if (!data) return;
    const players = normalisePlayers(data.players);
    if (players.length < 2) return;
    fbLobbyRef.update({ started: true });
  });
}

function joinLobby() {
  try { initFirebase(); } catch (e) { alert(e.message); return; }
  const name = document.getElementById('join-player-name').value.trim() || 'Player';
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  const err  = document.getElementById('join-error');

  if (!code || code.length !== 4) {
    err.textContent = 'Please enter a 4-letter room code';
    err.style.display = 'block';
    return;
  }

  err.style.display = 'none';
  const joinBtn = document.querySelector('#join-lobby-screen .btn-primary');
  if (joinBtn) { joinBtn.disabled = true; joinBtn.textContent = 'Joining...'; }

  isLocalHost = false;
  lobbyCode   = code;
  myPlayerId  = 'p_' + Date.now();
  const newPlayer = { name, id: myPlayerId, isHost: false };

  fbLobbyRef = fbDb.ref('lobbies/' + code);

  fbLobbyRef.get().then(snap => {
    const data = snap.val();

    if (!data) {
      showJoinError('Room not found. Check the code and try again.');
      return;
    }
    if (data.started) {
      showJoinError('That game has already started.');
      return;
    }
    const players = normalisePlayers(data.players);
    if (players.length >= 6) {
      showJoinError('Room is full (6/6 players).');
      return;
    }

    fbLobbyRef.child('players').push(newPlayer).then(newRef => {
        // Auto-remove if the joiner disconnects (closes tab, loses connection etc.)
        newRef.onDisconnect().remove();
        return fbLobbyRef.get();
    }).then(snap2 => {
      const updated = snap2.val();
      if (!updated) { showJoinError('Could not join. Please try again.'); return; }

      const updatedPlayers = normalisePlayers(updated.players);
      myPlayerIdx = updatedPlayers.findIndex(p => p.id === myPlayerId);

      if (joinBtn) { joinBtn.disabled = false; joinBtn.textContent = 'Join Game'; }
      document.getElementById('lobby-code-display').textContent = code;
      updateLobbyUI(updated);
      showScreen('lobby-waiting-screen');
      attachLobbyListener();
    });
  }).catch(e => {
    console.error('joinLobby error:', e);
    showJoinError('Connection error. Please try again.');
  });

  function showJoinError(msg) {
    if (joinBtn) { joinBtn.disabled = false; joinBtn.textContent = 'Join Game'; }
    err.textContent = msg;
    err.style.display = 'block';
  }
}

function leaveLobby() {
  if (fbLobbyListener && fbLobbyRef) fbLobbyRef.off('value', fbLobbyListener);
  if (isLocalHost && fbLobbyRef) {
    fbLobbyRef.remove();
  } else if (fbLobbyRef && myPlayerId) {
    // Players are stored as push-key children under /players.
    // Find the key whose .id matches ours and remove just that child.
    fbLobbyRef.child('players').get().then(snap => {
      snap.forEach(child => {
        if (child.val().id === myPlayerId) {
          child.ref.remove();
        }
      });
    });
  }
  fbLobbyRef = null;
  showScreen('home-screen');
}

// ========================
// MULTIPLAYER GAME SYNC
// ========================
// The host owns authoritative state and pushes the full G snapshot to Firebase
// after every action. All clients (including host) listen and re-render from it.

function pushGameState(anim) {
  if (G.botGame || !isLocalHost || !fbGameRef) return;
  const state = {
    players:        G.players.map(p => ({
      id:               p.id,
      name:             p.name,
      hand:             p.hand,
      score:            p.score,
      roundScores:      p.roundScores || [],
      isBot:            p.isBot,
      wentOut:          p.wentOut,
      finishedLastTurn: p.finishedLastTurn,
      // Include local hand order so other clients see revealed cards sorted correctly
      handOrder:        p.isLocalPlayer ? (G.localHandOrder || p.hand.map(c => c.id)) : (p.handOrder || null),
    })),
    deck:            G.deck,
    discardPile:     G.discardPile,
    round:           G.round,
    currentTurn:     G.currentTurn,
    startingPlayer:  G.startingPlayer,
    phase:           G.phase,
    lastTurnPlayer:  G.lastTurnPlayer,
    lastTurnCount:   G.lastTurnCount,
    drawnCard:       G.drawnCard,
    drawnFromDiscard: G.drawnFromDiscard,
    gameOver:        G.gameOver,
    previewCard:     G.previewCard || null,
    anim:            anim || null,
    ts:              Date.now(),
  };
  fbGameRef.set(state);
}

// Non-host players write actions here; host processes them in order.
// Uses a push-queue so rapid actions (e.g. preview then discard) are never overwritten.
function sendAction(action) {
  if (G.botGame) return;
  if (isLocalHost) {
    processAction(action);
  } else {
    fbGameRef.child('actionQueue').push({ ...action, ts: Date.now() });
  }
}

let fbActionListener = null;
function attachActionListener() {
  if (!fbGameRef || !isLocalHost) return;
  const ref = fbGameRef.child('actionQueue');
  if (fbActionListener) ref.off('child_added', fbActionListener);
  // Process each queued action as it arrives, then delete it
  fbActionListener = ref.on('child_added', snap => {
    const action = snap.val();
    if (!action) return;
    snap.ref.remove();
    processAction(action);
  });
  // Clear any leftover queue entries from a previous game
  ref.once('value', snap => { if (snap.exists()) snap.ref.remove(); });
}

// Host-side: apply an incoming player action to G, push state + anim cue.
function processAction(action) {
  if (!isLocalHost) return;

  if (action.type === 'sortHand') {
    const player = G.players.find(p => p.id === action.actorId);
    if (!player || !action.handOrder) return;
    // Reorder the player's hand on the host to match their local sort
    const ordered = [];
    action.handOrder.forEach(id => {
      const c = player.hand.find(c => c.id === id);
      if (c) ordered.push(c);
    });
    player.hand.forEach(c => {
      if (!action.handOrder.includes(c.id)) ordered.push(c);
    });
    player.hand = ordered;
    player.handOrder = action.handOrder;
    pushGameState(null);
    return;
  }

  if (action.type === 'drawFromDeck') {
    if (G.deck.length === 0) {
      const top = G.discardPile.pop();
      G.deck = shuffle([...G.discardPile]);
      G.discardPile = top ? [top] : [];
    }
    if (G.deck.length === 0) return;
    const card = G.deck.pop();
    G.drawnCard = card;
    G.drawnFromDiscard = false;
    const player = G.players.find(p => p.id === action.actorId);
    if (player) player.hand.push(card);
    pushGameState({ type: 'draw', actorId: action.actorId, fromDiscard: false, card });
    return;
  }

  if (action.type === 'drawFromDiscard') {
    if (G.discardPile.length === 0) return;
    const card = G.discardPile.pop();
    G.drawnCard = card;
    G.drawnFromDiscard = true;
    const player = G.players.find(p => p.id === action.actorId);
    if (player) player.hand.push(card);
    pushGameState({ type: 'draw', actorId: action.actorId, fromDiscard: true, card });
    return;
  }

  if (action.type === 'preview') {
    G.previewCard = action.card;
    pushGameState({ type: 'preview', actorId: action.actorId, card: action.card });
    return;
  }

  if (action.type === 'undoPreview') {
    G.previewCard = null;
    pushGameState({ type: 'undoPreview', actorId: action.actorId });
    return;
  }

  if (action.type === 'discard') {
    const player = G.players.find(p => p.id === action.actorId);
    if (!player) return;
    const cardIdx = player.hand.findIndex(c => c.id === action.card.id);
    // Card may already be removed from hand if the local host player used flyCardToDiscardPreview
    const card = cardIdx >= 0 ? player.hand.splice(cardIdx, 1)[0] : action.card;
    G.discardPile.push(card);
    G.drawnCard = null;
    const wasPreviewCard = G.previewCard;
    G.previewCard = null;
    advanceTurn();
    pushGameState({ type: 'discard', actorId: action.actorId, card, wasPreviewCard: wasPreviewCard || null });
    return;
  }

  if (action.type === 'goOut') {
    const player = G.players.find(p => p.id === action.actorId);
    if (!player) return;
    const cardIdx = player.hand.findIndex(c => c.id === action.card.id);
    // Card may already be removed from hand if the local host player used flyCardToDiscardPreview
    const card = cardIdx >= 0 ? player.hand.splice(cardIdx, 1)[0] : action.card;
    G.discardPile.push(card);
    G.drawnCard = null;
    player.wentOut = true;
    player.finishedLastTurn = true;
    player.hand.forEach(c => c.faceDown = false);
    G.lastTurnPlayer = G.players.indexOf(player);
    G.phase = 'lastTurns';
    G.lastTurnCount = 0;
    const wasPreviewCard = G.previewCard;
    G.previewCard = null;
    pushGameState({ type: 'goOut', actorId: action.actorId, card, wasPreviewCard: wasPreviewCard || null });
    return;
  }
}

let lastAppliedTs = 0;

function attachGameListener() {
  if (!fbGameRef) return;
  if (fbGameListener) fbGameRef.off('value', fbGameListener);
  fbGameListener = fbGameRef.on('value', snap => {
    const state = snap.val();
    if (!state) return;
    // Skip exact duplicates (same timestamp = same push, already processed)
    if (state.ts && state.ts === lastAppliedTs) return;
    if (state.ts) lastAppliedTs = state.ts;
    applyRemoteState(state);
  });
  attachActionListener();
}



function applyRemoteState(state) {
  // If an animation is in progress, queue this state and apply it when done
  if (isAnimating) {
    pendingRemoteState = state;
    return;
  }

  // Re-attach isLocalPlayer flag (not stored in Firebase)
  // Normalise in case Firebase returned the array as an object with numeric keys
  const players = normalisePlayers(state.players);
  players.forEach((p, i) => {
    p.isLocalPlayer = (p.id === myPlayerId);
  });
  const newLocalIdx = players.findIndex(p => p.isLocalPlayer);
  if (newLocalIdx >= 0) G.localPlayerIdx = newLocalIdx;

  // Preserve the local player's custom hand order across Firebase pushes.
  // The server stores canonical hand order but we keep a local ordering so
  // drag-reorders are not reset every time the host pushes state.
  const localIncoming = players[newLocalIdx >= 0 ? newLocalIdx : G.localPlayerIdx];
  if (localIncoming) {
    // If the player has a card in the preview area (removed from hand client-side),
    // strip it from the server hand so the optimistic removal isn't undone.
    if (previewRemovedCard) {
      localIncoming.hand = localIncoming.hand.filter(c => c.id !== previewRemovedCard.id);
    }

    if (G.localHandOrder && G.localHandOrder.length > 0) {
      const serverCards = localIncoming.hand;
      const ordered = [];
      // Place cards in local order first
      G.localHandOrder.forEach(id => {
        const c = serverCards.find(c => c.id === id);
        if (c) ordered.push(c);
      });
      // Append any new cards (just drawn) that aren't in our saved order
      serverCards.forEach(c => {
        if (!G.localHandOrder.includes(c.id)) ordered.push(c);
      });
      localIncoming.hand = ordered;
    }
  }

  // Apply handOrder for non-local players so revealed hands show in the player's sorted order
  players.forEach(p => {
    if (!p.isLocalPlayer && p.handOrder && p.handOrder.length > 0) {
      const ordered = [];
      p.handOrder.forEach(id => {
        const c = p.hand.find(c => c.id === id);
        if (c) ordered.push(c);
      });
      // Append any cards not covered by handOrder
      p.hand.forEach(c => {
        if (!p.handOrder.includes(c.id)) ordered.push(c);
      });
      p.hand = ordered;
    }
  });

  const anim = state.anim || null;

  // Apply all non-visual state first
  G.players        = players;
  G.deck           = state.deck           || [];
  G.discardPile    = state.discardPile    || [];
  G.round          = state.round;
  G.currentTurn    = state.currentTurn;
  G.startingPlayer = state.startingPlayer;
  G.phase          = state.phase;
  G.lastTurnPlayer = state.lastTurnPlayer;
  G.lastTurnCount  = state.lastTurnCount;
  G.drawnCard      = state.drawnCard      || null;
  G.drawnFromDiscard = state.drawnFromDiscard || false;
  G.gameOver       = state.gameOver       || false;
  G.dealing        = false;
  G.revealedSet    = new Set();
  const prevPreviewCard = G.previewCard;
  G.previewCard    = state.previewCard || null;

  // Re-sync selectedCardIdx from the stable card ID (survives hand reorders)
  if (G.selectedCardId !== null) {
    const localPlayer = G.players[G.localPlayerIdx];
    if (localPlayer) {
      const idx = localPlayer.hand.findIndex(c => c.id === G.selectedCardId);
      G.selectedCardIdx = idx; // -1 if card was removed (discarded)
      if (idx < 0) G.selectedCardId = null;
    }
  }

  // No anim cue — just render (e.g. round end, score updates, turn advance)
  if (!anim) {
    renderGame();
    // If it's now a bot's turn and we're the host, kick it off
    if (isLocalHost) {
      const next = G.players[G.currentTurn];
      if (next?.isBot) setTimeout(doBotTurn, 800 + Math.random() * 600);
    }
    // Show final-turn toast for the local human player
    if (G.phase === 'lastTurns' && G.players[G.currentTurn]?.isLocalPlayer) {
      showToast('Final turn! Draw then discard.');
    }
    return;
  }

  if (anim.type === 'deal') {
    withAnimation(done => {
      playDealAnimation(anim.count, anim.startingPlayer, () => {
        renderGame();
        if (isLocalHost && G.players[G.currentTurn]?.isBot) {
          setTimeout(doBotTurn, 1200);
        }
        done();
      });
    });
    return;
  }

  if (anim.type === 'draw') {
    const actor = G.players.find(p => p.id === anim.actorId);
    if (!actor) { renderGame(); return; }

    const fromEl = anim.fromDiscard
      ? document.getElementById('discard-drop-target')
      : document.getElementById('draw-pile-visual');
    const toEl = actor.isLocalPlayer
      ? document.getElementById('player-hand')
      : document.getElementById('opp-cards-' + actor.id);

    if (!fromEl || !toEl) { renderGame(); return; }

    renderPiles();
    withAnimation(done => {
      // Show face-up for local player drawing from discard, face-down otherwise
      const faceUp = actor.isLocalPlayer && anim.fromDiscard;
      animateCardDraw(fromEl, toEl, faceUp, anim.card, () => {
        renderGame();
        done();
      });
    });
    return;
  }

  if (anim.type === 'preview') {
    // Observer: fly the card from the actor's hand area to the discard preview position
    const actor = G.players.find(p => p.id === anim.actorId);
    if (!actor || actor.isLocalPlayer) { renderGame(); return; }
    const fromEl = document.getElementById('opp-cards-' + actor.id);
    const toEl   = document.getElementById('discard-drop-target');
    if (!fromEl || !toEl) { renderGame(); return; }
    withAnimation(done => {
      animateCardDraw(fromEl, toEl, true, anim.card, () => {
        // Show the preview card hovering over the discard pile
        renderGame();
        done();
      });
    });
    return;
  }

  if (anim.type === 'undoPreview') {
    // Observer: fly the card back from discard area to the actor's hand area
    const actor = G.players.find(p => p.id === anim.actorId);
    if (!actor || actor.isLocalPlayer) { renderGame(); return; }
    const fromEl = document.getElementById('discard-drop-target');
    const toEl   = document.getElementById('opp-cards-' + actor.id);
    if (!fromEl || !toEl) { renderGame(); return; }
    withAnimation(done => {
      animateCardDraw(fromEl, toEl, false, anim.card || {}, () => {
        renderGame();
        done();
      });
    });
    return;
  }

  if (anim.type === 'discard') {
    const actor = G.players.find(p => p.id === anim.actorId);
    if (!actor) { renderGame(); return; }

    const afterAnim = (done) => {
      renderGame();
      done();
      if (!isLocalHost) return;
      const next = G.players[G.currentTurn];
      if (!next) return;
      if (next.isBot) {
        setTimeout(doBotTurn, 800 + Math.random() * 600);
      } else if (G.phase === 'lastTurns' && next.isLocalPlayer) {
        showToast('Final turn! Draw then discard.');
      }
    };

    // Actor already rendered optimistically — just run afterAnim logic for them
    if (actor.isLocalPlayer) { afterAnim(() => {}); return; }

    // Card was already previewed hovering over the discard pile — no need to re-fly it
    const alreadyPreviewed = (anim.wasPreviewCard && anim.wasPreviewCard.id === anim.card.id)
                          || (prevPreviewCard && prevPreviewCard.id === anim.card.id);
    if (alreadyPreviewed) { afterAnim(() => {}); return; }

    const fromEl = document.getElementById('opp-cards-' + actor.id);
    const toEl = document.getElementById('discard-drop-target');
    if (!fromEl || !toEl) { afterAnim(() => {}); return; }

    withAnimation(done => {
      animateCardDraw(fromEl, toEl, true, anim.card, () => afterAnim(done));
    });
    return;
  }

  if (anim.type === 'goOut') {
    const actor = G.players.find(p => p.id === anim.actorId);

    const afterAnim = (done) => {
      showWentOut(actor?.name);
      renderGame();
      done();
      if (actor?.isLocalPlayer) flipRevealPlayerHand(300);
      if (isLocalHost) setTimeout(beginLastTurns, 1500);
    };

    // Actor already rendered optimistically
    if (actor?.isLocalPlayer) { afterAnim(() => {}); return; }

    // Card was already previewed — skip the fly, go straight to banner
    const alreadyPreviewed = (anim.wasPreviewCard && anim.wasPreviewCard.id === anim.card.id)
                          || (prevPreviewCard && prevPreviewCard.id === anim.card.id);
    if (alreadyPreviewed) { afterAnim(() => {}); return; }

    const fromEl = document.getElementById('opp-cards-' + actor.id);
    const toEl = document.getElementById('discard-drop-target');
    withAnimation(done => {
      if (fromEl && toEl) {
        animateCardDraw(fromEl, toEl, true, anim.card, () => afterAnim(done));
      } else {
        afterAnim(done);
      }
    });
    return;
  }

  renderGame();
}

// Visual-only deal animation for non-host clients.
// Hands are already populated in G.players; this just flies face-down cards
// from the deck area to each player's area for the visual effect.
function playDealAnimation(count, startingPlayer, callback) {
  const dealScreen = document.getElementById('dealing-screen');
  dealScreen.classList.add('show');
  document.getElementById('dealing-status').textContent =
    `Round ${G.round}  ·  Dealing ${count} card${count > 1 ? 's' : ''} each...`;

  showScreen('game-screen');
  renderLayout();
  renderPiles();

  // Temporarily clear hands visually so we can re-add them one by one
  const savedHands = G.players.map(p => [...p.hand]);
  G.players.forEach(p => { p.hand = []; });
  renderPlayerHand();
  renderOpponentCards();

  const totalCards = count * G.players.length;
  const delayBetween = totalCards <= 12 ? 200 : totalCards <= 20 ? 160 : 130;
  let dealIdx = 0;
  let playerIdx = startingPlayer;

  function getDeckCenter() {
    const el = document.getElementById('draw-pile-visual');
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function getTargetCenter(pIdx) {
    const p = G.players[pIdx];
    if (p.isLocalPlayer) {
      const hand = document.getElementById('player-hand');
      if (!hand) return getDeckCenter();
      const r = hand.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    } else {
      const el = document.getElementById('opp-cards-' + p.id);
      if (!el) return getDeckCenter();
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  }

  const dealCounts = new Array(G.players.length).fill(0);

  function flyOne(pIdx, done) {
    const origin = getDeckCenter();
    const target = getTargetCenter(pIdx);
    const flying = document.createElement('div');
    flying.className = 'card face-down';
    flying.style.cssText = `
      position:fixed; width:64px; height:94px;
      left:${origin.x - 28}px; top:${origin.y - 41}px;
      z-index:9998; pointer-events:none; transition:none;
      border-radius:7px; box-shadow:0 6px 20px rgba(0,0,0,0.55);
    `;
    document.body.appendChild(flying);
    flying.getBoundingClientRect();
    flying.style.transition = 'transform 0.28s cubic-bezier(0.25,0.8,0.4,1), opacity 0.28s ease';
    flying.style.transform = `translate(${target.x - origin.x}px, ${target.y - origin.y}px) scale(0.88)`;
    flying.style.opacity = '0.92';
    setTimeout(() => {
      document.body.removeChild(flying);
      // Push the next card for this player from their saved hand
      const cardIdx = dealCounts[pIdx];
      const card = savedHands[pIdx][cardIdx];
      dealCounts[pIdx]++;
      if (card) {
        G.players[pIdx].hand.push(card);
        if (G.players[pIdx].isLocalPlayer) renderPlayerHand();
        else renderOpponentCards();
      }
      done();
    }, 290);
  }

  function dealNext() {
    if (dealIdx >= totalCards) {
      dealScreen.classList.remove('show');
      callback();
      return;
    }
    const pIdx = playerIdx;
    playerIdx = (playerIdx + 1) % G.players.length;
    dealIdx++;
    flyOne(pIdx, () => setTimeout(dealNext, delayBetween));
  }

  setTimeout(dealNext, 350);
}

function startMultiplayerGame(data, myIdx) {
  myPlayerIdx      = myIdx;
  G.localPlayerIdx = myIdx;
  G.botGame        = false;

  G.players = normalisePlayers(data.players).map((p, i) => ({
    id:               p.id,
    name:             p.name,
    hand:             [],
    score:            0,
    roundScores:      [],
    isBot:            false,
    wentOut:          false,
    finishedLastTurn: false,
    isLocalPlayer:    i === myIdx
  }));

  fbGameRef = fbDb.ref('games/' + lobbyCode);

  if (isLocalHost) {
    // Host sets up and pushes initial state; everyone else listens
    G.round          = 1;
    G.startingPlayer = 0;
    startRound();          // startRound calls pushGameState() then attachGameListener()
  } else {
    showScreen('game-screen');
    attachGameListener();
  }
}

// ========================
// BOT GAME
// ========================
function startBotGame() {
  const name = document.getElementById('bot-player-name').value.trim() || 'Player';
  const botCount = Math.min(5, Math.max(1, parseInt(document.getElementById('bot-count').value) || 3));

  G.players = [{ id: 'local', name, hand: [], score: 0, roundScores: [], isBot: false, isLocalPlayer: true, wentOut: false, finishedLastTurn: false }];
  for (let i = 0; i < botCount; i++) {
    G.players.push({ id: 'bot_' + i, name: `Bot ${i+1}`, hand: [], score: 0, roundScores: [], isBot: true, isLocalPlayer: false, wentOut: false, finishedLastTurn: false });
  }
  G.localPlayerIdx = 0;
  G.botGame = true;
  G.round = 1;
  G.startingPlayer = 0;
  startRound();
}

// ========================
// ROUND MANAGEMENT
// ========================
function startRound() {
  G.deck = shuffle(makeDeck());
  G.discardPile = [];
  G.players.forEach(p => { p.hand = []; p.wentOut = false; p.finishedLastTurn = false; });
  G.revealedSet = new Set();
  G.currentTurn = G.startingPlayer;
  G.phase = 'draw';
  G.lastTurnPlayer = -1;
  G.lastTurnCount = 0;
  G.drawnCard = null;
  G.drawnFromDiscard = false;
  G.selectedCardIdx = -1;
  G.selectedCardId = null;
  G.gameOver = false;
  G.dealing = true;
  G.localHandOrder = null;
  // Reset render-side preview state (previewRemovedCard lives in render.js)
  if (typeof resetPreviewState === 'function') resetPreviewState();

  const cardsToDeal = G.round + 2;

  showScreen('game-screen');
  renderLayout();
  renderPlayerHand();
  renderOpponentCards();
  renderPiles();

  if (!G.botGame) {
    // Deal all cards into hands first so the pushed state is complete.
    // playDealAnimation on each client will visually replay the deal card-by-card.
    for (let i = 0; i < cardsToDeal; i++) {
      for (let j = 0; j < G.players.length; j++) {
        const pIdx = (G.startingPlayer + j) % G.players.length;
        if (G.deck.length > 0) G.players[pIdx].hand.push(G.deck.pop());
      }
    }
    if (G.deck.length > 0) {
      G.discardPile.push(G.deck.pop());
    }
    G.dealing = false;
    attachGameListener();
    pushGameState({ type: 'deal', count: cardsToDeal, startingPlayer: G.startingPlayer });
  } else {
    dealCardsAnimated(cardsToDeal, () => {
      if (G.deck.length > 0) {
        G.discardPile.push(G.deck.pop());
      }
      G.dealing = false;
      renderGame();
      if (G.players[G.currentTurn].isBot) {
        setTimeout(doBotTurn, 1200);
      }
    });
  }
}

// ========================
// DRAWING CARDS
// ========================
function drawFromDeck() {
  if (!isMyTurn() || G.drawnCard !== null || (G.phase !== 'draw' && G.phase !== 'lastTurns')) return;

  if (!G.botGame) {
    // Send action to host; host picks the card, pushes state+anim for everyone
    sendAction({ type: 'drawFromDeck', actorId: G.players[G.localPlayerIdx].id });
    return;
  }

  if (G.deck.length === 0) {
    const top = G.discardPile.pop();
    G.deck = shuffle([...G.discardPile]);
    G.discardPile = top ? [top] : [];
    showToast('Reshuffled discard pile!');
  }
  if (G.deck.length === 0) { showToast('No cards left!'); return; }

  const card = G.deck.pop();
  G.drawnCard = card;
  G.drawnFromDiscard = false;

  const fromEl = document.getElementById('draw-pile-visual');
  const toEl   = document.getElementById('player-hand');
  if (fromEl && toEl) {
    animateCardDraw(fromEl, toEl, false, card, () => {
      G.players[G.localPlayerIdx].hand.push(card);
      renderGame();
    });
  } else {
    G.players[G.localPlayerIdx].hand.push(card);
    renderGame();
  }
}

function drawFromDiscard() {
  if (!isMyTurn() || G.drawnCard !== null || (G.phase !== 'draw' && G.phase !== 'lastTurns')) return;
  if (G.discardPile.length === 0) { showToast('Discard pile is empty!'); return; }

  if (!G.botGame) {
    sendAction({ type: 'drawFromDiscard', actorId: G.players[G.localPlayerIdx].id });
    return;
  }

  const card = G.discardPile.pop();
  G.drawnCard = card;
  G.drawnFromDiscard = true;

  const fromEl = document.getElementById('discard-drop-target');
  const toEl   = document.getElementById('player-hand');
  if (fromEl && toEl) {
    animateCardDraw(fromEl, toEl, true, card, () => {
      G.players[G.localPlayerIdx].hand.push(card);
      renderGame();
    });
  } else {
    G.players[G.localPlayerIdx].hand.push(card);
    renderGame();
  }
}

// ========================
// DISCARD
// ========================
function clearDiscardPreview() {
  const existing = document.getElementById('discard-preview-card');
  if (existing) existing.remove();
}

function tapCardToDiscard(cardIdx) {
  if (!isMyTurn() || G.drawnCard === null) return;

  if (G.selectedCardIdx === cardIdx) {
    undoDiscard();
    return;
  }

  if (G.selectedCardIdx >= 0) {
    flyCardBackToHand(G.selectedCardIdx, () => {
      G.selectedCardIdx = -1;
      G.selectedCardId = null;
      renderPlayerHand();
      flyCardToDiscardPreview(cardIdx);
      if (!G.botGame) {
        // Card was just removed from hand by flyCardToDiscardPreview — use previewRemovedCard
        const card = previewRemovedCard;
        if (card) sendAction({ type: 'preview', actorId: G.players[G.localPlayerIdx].id, card });
      }
    });
    return;
  }

  flyCardToDiscardPreview(cardIdx);
  if (!G.botGame) {
    // Card was just removed from hand by flyCardToDiscardPreview — use previewRemovedCard
    const card = previewRemovedCard;
    if (card) sendAction({ type: 'preview', actorId: G.players[G.localPlayerIdx].id, card });
  }
}

function confirmDiscard() {
  if (!isMyTurn() || G.drawnCard === null) return;
  const localPlayer = G.players[G.localPlayerIdx];
  let card = null;
  let resolvedIdx = -1;

  if (previewRemovedCard) {
    // Card was already removed from hand by flyCardToDiscardPreview — don't splice again
    card = previewRemovedCard;
    resolvedIdx = -1; // already out of hand
  } else if (G.selectedCardId !== null) {
    resolvedIdx = localPlayer.hand.findIndex(c => c.id === G.selectedCardId);
    if (resolvedIdx >= 0) card = localPlayer.hand[resolvedIdx];
  } else if (G.selectedCardIdx >= 0) {
    resolvedIdx = G.selectedCardIdx;
    card = localPlayer.hand[resolvedIdx];
  }

  if (!card) return;

  clearDiscardPreview();

  if (!G.botGame) {
    if (!isLocalHost) {
      // Only splice if the card is still in the hand (wasn't already removed by preview)
      if (resolvedIdx >= 0) localPlayer.hand.splice(resolvedIdx, 1);
      G.discardPile.push(card);
      G.drawnCard = null;
      G.selectedCardIdx = -1;
      G.selectedCardId = null;
      previewRemovedCard = null;
      previewRemovedIdx = null;
      G.localHandOrder = localPlayer.hand.map(c => c.id);
      renderGame();
    } else {
      // Host: processAction will splice on its own copy — just clear local UI state
      G.selectedCardIdx = -1;
      G.selectedCardId = null;
      previewRemovedCard = null;
      previewRemovedIdx = null;
    }
    sendAction({ type: 'discard', actorId: localPlayer.id, card });
    return;
  }

  // Bot game: only splice if card is still in the hand
  if (resolvedIdx >= 0) localPlayer.hand.splice(resolvedIdx, 1);
  G.discardPile.push(card);
  G.drawnCard = null;
  G.selectedCardIdx = -1;
  G.selectedCardId = null;
  previewRemovedCard = null;
  previewRemovedIdx = null;
  advanceTurn();
  renderGame();
}

function undoDiscard() {
  if (!isMyTurn() || (G.selectedCardId === null && !previewRemovedCard)) return;
  flyCardBackToHand(() => {
    G.selectedCardIdx = -1;
    G.selectedCardId = null;
    renderPlayerHand();
    updateActionButtons();
    updatePlayerLabel();
  });
  if (!G.botGame) {
    sendAction({ type: 'undoPreview', actorId: G.players[G.localPlayerIdx].id });
  }
}

// ========================
// GO OUT
// ========================
function canPlayerGoOutHand(hand) {
  if (hand.length < 2) return false;
  for (let i = 0; i < hand.length; i++) {
    const remaining = hand.filter((_, idx) => idx !== i);
    if (isValidHand(remaining)) return true;
  }
  return false;
}

function canPlayerGoOut(player) {
  return canPlayerGoOutHand(player.hand);
}

function tryGoOut() {
  const localPlayer = G.players[G.localPlayerIdx];

  // Build the full hand including the previewed card (which was removed from hand array)
  const fullHand = previewRemovedCard
    ? [...localPlayer.hand, previewRemovedCard]
    : localPlayer.hand;

  if (!canPlayerGoOutHand(fullHand)) {
    showToast('❌ Cannot go out yet!', 2500);
    return;
  }

  let card = null;
  let discardIdx = -1;

  if (previewRemovedCard) {
    // Card already lifted out of hand — use it as the discard
    card = previewRemovedCard;
    const remaining = localPlayer.hand; // hand without the preview card
    if (!isValidHand(remaining)) {
      showToast('❌ That card cannot be your discard — pick another', 2500);
      return;
    }
  } else if (G.selectedCardId !== null) {
    discardIdx = localPlayer.hand.findIndex(c => c.id === G.selectedCardId);
    if (discardIdx >= 0) {
      const remaining = localPlayer.hand.filter((_, idx) => idx !== discardIdx);
      if (!isValidHand(remaining)) {
        showToast('❌ That card cannot be your discard — pick another', 2500);
        return;
      }
      card = localPlayer.hand[discardIdx];
    }
  }

  if (!card) {
    // Auto-pick the best discard from the full hand
    for (let i = 0; i < fullHand.length; i++) {
      const remaining = fullHand.filter((_, idx) => idx !== i);
      if (isValidHand(remaining)) {
        card = fullHand[i];
        discardIdx = localPlayer.hand.findIndex(c => c.id === card.id);
        break;
      }
    }
  }

  if (!card) return;

  clearDiscardPreview();

  if (!G.botGame) {
    const alreadyPreviewed = previewRemovedCard && previewRemovedCard.id === card.id;
    if (!alreadyPreviewed && (!G.previewCard || G.previewCard.id !== card.id)) {
      sendAction({ type: 'preview', actorId: localPlayer.id, card });
      if (!isLocalHost && discardIdx >= 0) flyCardToDiscardPreview(discardIdx);
    }
    G.selectedCardIdx = -1;
    G.selectedCardId = null;
    sendAction({ type: 'goOut', actorId: localPlayer.id, card });

    if (!isLocalHost) {
      // Card may already be removed from hand (previewRemovedCard path)
      if (discardIdx >= 0) localPlayer.hand.splice(discardIdx, 1);
      G.discardPile.push(card);
      G.drawnCard = null;
      previewRemovedCard = null;
      previewRemovedIdx = null;
      localPlayer.wentOut = true;
      localPlayer.finishedLastTurn = true;
      G.revealedSet.add('local_hand');
      localPlayer.hand.forEach(c => c.faceDown = false);
      G.phase = 'lastTurns';
      G.lastTurnCount = 0;
      G.localHandOrder = null;
      renderGame();
      flipRevealPlayerHand(300);
    }
    return;
  }

  // Bot game — card may already be removed from hand (previewRemovedCard path)
  if (discardIdx >= 0) localPlayer.hand.splice(discardIdx, 1);
  G.discardPile.push(card);
  G.drawnCard = null;
  G.selectedCardIdx = -1;
  G.selectedCardId = null;
  previewRemovedCard = null;
  previewRemovedIdx = null;
  localPlayer.wentOut = true;
  localPlayer.finishedLastTurn = true;
  G.revealedSet.add('local_hand');
  localPlayer.hand.forEach(c => c.faceDown = false);
  G.lastTurnPlayer = G.currentTurn;
  G.phase = 'lastTurns';
  G.lastTurnCount = 0;
  G.localHandOrder = null;
  showWentOut(localPlayer.name);
  renderGame();
  flipRevealPlayerHand(300);
  setTimeout(beginLastTurns, 1500);
}

// ========================
// HAND VALIDATION
// ========================
function isValidHand(cards) {
  if (cards.length === 0) return true;
  return canArrangeCards(cards);
}

function canArrangeCards(cards) {
  if (cards.length === 0) return true;
  if (cards.length < 3) return false;
  return tryGroups(cards, 0);
}

function tryGroups(remaining, depth) {
  if (remaining.length === 0) return true;
  if (remaining.length < 3) return false;
  if (depth > 10) return false;

  const n = remaining.length;
  for (let size = 3; size <= n; size++) {
    const combos = getCombinations(remaining, size);
    for (const combo of combos) {
      if (isBook(combo) || isRun(combo)) {
        const rest = remaining.filter(c => !combo.includes(c));
        if (tryGroups(rest, depth + 1)) return true;
      }
    }
  }
  return false;
}

function getCombinations(arr, k) {
  if (k === arr.length) return [arr];
  if (k === 1) return arr.map(x => [x]);
  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const rest = getCombinations(arr.slice(i + 1), k - 1);
    for (const combo of rest) result.push([arr[i], ...combo]);
  }
  return result;
}

function isBook(cards) {
  const normals = cards.filter(c => !isWild(c));
  if (normals.length === 0) return true;
  const val = normals[0].val;
  return normals.every(c => c.val === val);
}

function isRun(cards) {
  const normals = cards.filter(c => !isWild(c));
  if (normals.length === 0) return true;

  const suit = normals[0].suit;
  if (!normals.every(c => c.suit === suit)) return false;

  const ranks = normals.map(c => cardNumericRank(c.val)).sort((a, b) => a - b);
  const wildCount = cards.length - normals.length;

  const span = ranks[ranks.length - 1] - ranks[0] + 1;
  if (span > cards.length) return false;

  let gaps = 0;
  for (let i = 1; i < ranks.length; i++) {
    const diff = ranks[i] - ranks[i - 1];
    if (diff === 0) return false;
    gaps += diff - 1;
  }

  return gaps <= wildCount;
}

// ========================
// SCORING
// ========================
function scoreHand(hand) {
  let minScore = Infinity;

  function tryScore(remaining) {
    const baseScore = remaining.reduce((sum, c) => {
      if (c.isJoker) return sum + 50;
      if (isWild(c)) return sum + 20;
      return sum + cardValue(c.val);
    }, 0);
    minScore = Math.min(minScore, baseScore);
    if (minScore === 0) return;

    for (let size = 3; size <= remaining.length; size++) {
      const combos = getCombinations(remaining, size);
      for (const combo of combos) {
        if (isBook(combo) || isRun(combo)) {
          const rest = remaining.filter(c => !combo.includes(c));
          tryScore(rest);
          if (minScore === 0) return;
        }
      }
    }
  }

  tryScore(hand);
  return minScore === Infinity ? 0 : minScore;
}

// ========================
// TURN ADVANCEMENT
// ========================
function advanceTurn() {
  if (G.phase === 'lastTurns') {
    advanceTurnAfterGoOut();
    return;
  }

  G.currentTurn = (G.currentTurn + 1) % G.players.length;
  G.drawnCard = null;

  // In multiplayer, applyRemoteState handles rendering and bot scheduling
  if (!G.botGame) return;

  if (G.players[G.currentTurn].isBot) {
    renderGame();
    setTimeout(doBotTurn, 800 + Math.random() * 600);
  } else {
    renderGame();
  }
}

function advanceTurnAfterGoOut() {
  G.players[G.currentTurn].finishedLastTurn = true;
  G.players[G.currentTurn].hand.forEach(c => c.faceDown = false);
  G.lastTurnCount++;

  const othersCount = G.players.length - 1;
  if (G.lastTurnCount >= othersCount) {
    endRound();
    return;
  }

  do {
    G.currentTurn = (G.currentTurn + 1) % G.players.length;
  } while (G.players[G.currentTurn].wentOut);

  G.drawnCard = null;

  // In multiplayer, applyRemoteState handles rendering and bot scheduling
  if (!G.botGame) return;

  if (G.players[G.currentTurn].isBot) {
    renderGame();
    setTimeout(doBotTurn, 600 + Math.random() * 400);
  } else {
    renderGame();
    showToast('Final turn! Draw then discard.');
  }
}

function beginLastTurns() {
  const othersCount = G.players.length - 1;
  if (othersCount === 0) { endRound(); return; }

  do {
    G.currentTurn = (G.currentTurn + 1) % G.players.length;
  } while (G.players[G.currentTurn].wentOut);

  G.drawnCard = null;

  if (!G.botGame) {
    // Push updated turn state; applyRemoteState will handle bot scheduling / toast
    pushGameState(null);
    return;
  }

  if (G.players[G.currentTurn].isBot) {
    renderGame();
    setTimeout(doBotTurn, 600 + Math.random() * 400);
  } else {
    renderGame();
    showToast('Final turn! Draw then discard.');
  }
}

// ========================
// BOT AI
// ========================
function doBotTurn() {
  const bot = G.players[G.currentTurn];
  if (!bot || !bot.isBot) return;

  const topDiscard = G.discardPile[G.discardPile.length - 1];
  let shouldTakeDiscard = false;
  if (topDiscard) {
    const testHand = [...bot.hand, topDiscard];
    shouldTakeDiscard = botWouldBenefit(testHand, topDiscard);
  }

  let drawnCard;
  let fromDiscardPile = false;
  if (shouldTakeDiscard && G.discardPile.length > 0) {
    drawnCard = G.discardPile.pop();
    fromDiscardPile = true;
  } else {
    if (G.deck.length === 0) {
      const top = G.discardPile.pop();
      G.deck = shuffle([...G.discardPile]);
      G.discardPile = top ? [top] : [];
    }
    if (G.deck.length > 0) drawnCard = G.deck.pop();
  }

  const fromEl = fromDiscardPile
    ? document.getElementById('discard-drop-target')
    : document.getElementById('draw-pile-visual');
  const toEl = document.getElementById('opp-cards-' + bot.id);

  function afterDraw() {
    if (drawnCard) bot.hand.push(drawnCard);

    if (!G.botGame) {
      // Push immediately — Firebase triggers draw animation on all clients at once
      pushGameState({ type: 'draw', actorId: bot.id, fromDiscard: fromDiscardPile, card: drawnCard });

      if (G.phase !== 'lastTurns') {
        for (let i = 0; i < bot.hand.length; i++) {
          const remaining = bot.hand.filter((_, idx) => idx !== i);
          if (isValidHand(remaining)) {
            const goOutDiscard = bot.hand.splice(i, 1)[0];
            G.discardPile.push(goOutDiscard);
            bot.wentOut = true;
            bot.finishedLastTurn = true;
            G.lastTurnPlayer = G.currentTurn;
            G.phase = 'lastTurns';
            G.lastTurnCount = 0;
            // Delay goOut push slightly so clients finish the draw animation first
            setTimeout(() => {
              pushGameState({ type: 'goOut', actorId: bot.id, card: goOutDiscard });
            }, 700);
            return;
          }
        }
      }

      setTimeout(() => {
        const discardIdx = botChooseDiscard(bot.hand);
        const discarded = bot.hand.splice(discardIdx, 1)[0];
        G.discardPile.push(discarded);
        advanceTurn();
        pushGameState({ type: 'discard', actorId: bot.id, card: discarded });
      }, 700);

    } else {
      // Bot-only game: use local animations as before
      renderGame();

      if (G.phase !== 'lastTurns') {
        for (let i = 0; i < bot.hand.length; i++) {
          const remaining = bot.hand.filter((_, idx) => idx !== i);
          if (isValidHand(remaining)) {
            const goOutDiscard = bot.hand.splice(i, 1)[0];
            G.discardPile.push(goOutDiscard);
            bot.wentOut = true;
            bot.finishedLastTurn = true;
            G.lastTurnPlayer = G.currentTurn;
            G.phase = 'lastTurns';
            G.lastTurnCount = 0;
            showWentOut(bot.name);
            renderGame();
            setTimeout(beginLastTurns, 1500);
            return;
          }
        }
      }

      setTimeout(() => {
        const discardIdx = botChooseDiscard(bot.hand);
        const discarded = bot.hand.splice(discardIdx, 1)[0];

        const fromEl2 = document.getElementById('opp-cards-' + bot.id);
        const toEl2   = document.getElementById('discard-drop-target');

        function afterDiscard() {
          G.discardPile.push(discarded);
          advanceTurn();
        }

        if (fromEl2 && toEl2) {
          animateCardDraw(fromEl2, toEl2, true, discarded, afterDiscard);
        } else {
          afterDiscard();
        }
      }, 600);
    }
  }

  if (!G.botGame) {
    // Multiplayer: no local animation, just compute and push
    afterDraw();
  } else if (fromEl && toEl && drawnCard) {
    animateCardDraw(fromEl, toEl, false, drawnCard, afterDraw);
  } else {
    afterDraw();
  }
}

function botWouldBenefit(hand, newCard) {
  const others = hand.filter(c => c.id !== newCard.id);
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      if (isBook([newCard, others[i], others[j]]) || isRun([newCard, others[i], others[j]])) return true;
    }
  }
  return isWild(newCard);
}

function botChooseDiscard(hand) {
  let worst = 0;
  let worstScore = -Infinity;

  hand.forEach((card, i) => {
    const rest = hand.filter((_, idx) => idx !== i);
    const groupCount = countGroups(rest);
    const pts = isWild(card) ? -100 : cardValue(card.val);
    const score = pts - groupCount * 20;

    if (score > worstScore) {
      worstScore = score;
      worst = i;
    }
  });
  return worst;
}

function countGroups(cards) {
  if (cards.length < 3) return 0;
  let count = 0;
  const used = new Set();

  for (let i = 0; i < cards.length; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < cards.length; j++) {
      if (used.has(j)) continue;
      for (let k = j + 1; k < cards.length; k++) {
        if (used.has(k)) continue;
        if (isBook([cards[i], cards[j], cards[k]]) || isRun([cards[i], cards[j], cards[k]])) {
          used.add(i); used.add(j); used.add(k);
          count++;
          break;
        }
      }
      if (used.has(i)) break;
    }
  }
  return count;
}

// ========================
// END ROUND / GAME
// ========================
function endRound() {
  G.phase = 'roundEnd';

  G.players.forEach(p => {
    const roundScore = p.wentOut ? 0 : scoreHand(p.hand);
    p.score += roundScore;
    p.roundScores = p.roundScores || [];
    p.roundScores.push(roundScore);
  });

  renderGame();
  pushGameState();

  const continueBtn = document.getElementById('continue-btn');
  if (continueBtn) {
    continueBtn.disabled = false;
    continueBtn.textContent = G.round === 11 ? 'Results' : 'Next →';
    continueBtn.onclick = G.round === 11 ? showGameOver : nextRound;
    continueBtn.style.background = 'linear-gradient(135deg, #c8940a, #e8b420)';
    continueBtn.style.color = '#1a1a0a';
    continueBtn.style.animation = 'pulse-gold 1s ease-in-out infinite';
  }
  const undoBtn = document.getElementById('undo-btn');
  const goOutBtn = document.getElementById('go-out-btn');
  if (undoBtn) undoBtn.style.display = 'none';
  if (goOutBtn) goOutBtn.style.display = 'none';
}

function nextRound() {
  const continueBtn = document.getElementById('continue-btn');
  if (continueBtn) {
    continueBtn.textContent = 'Continue';
    continueBtn.onclick = confirmDiscard;
    continueBtn.style.background = '';
    continueBtn.style.color = '';
    continueBtn.style.animation = '';
  }
  const undoBtn = document.getElementById('undo-btn');
  const goOutBtn = document.getElementById('go-out-btn');
  if (undoBtn) undoBtn.style.display = '';
  if (goOutBtn) goOutBtn.style.display = '';
  G.startingPlayer = (G.startingPlayer + 1) % G.players.length;
  G.round++;
  if (G.round > 11) { showGameOver(); return; }
  startRound();
}

function showGameOver() {
  const modal = document.getElementById('game-over-modal');
  const content = document.getElementById('game-over-content');

  const sorted = [...G.players].sort((a, b) => a.score - b.score);
  const winner = sorted[0];

  let html = `<div style="text-align:center;margin-bottom:20px">
    <div style="font-size:48px">🏆</div>
    <div style="font-family:Cinzel;font-size:22px;color:var(--gold);letter-spacing:2px">${winner.name}</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.5);margin-top:4px">WINS with ${winner.score} points!</div>
  </div>`;

  html += `<table class="score-table"><thead><tr>
    <th>Rank</th><th>Player</th><th>Total Score</th>
  </tr></thead><tbody>`;
  sorted.forEach((p, i) => {
    html += `<tr class="${i === 0 ? 'leader' : ''}">
      <td>${['🥇','🥈','🥉','4','5','6'][i]}</td>
      <td>${p.name}</td>
      <td>${p.score}</td>
    </tr>`;
  });
  html += '</tbody></table>';

  content.innerHTML = html;
  modal.classList.add('show');
}

function restartGame() {
  closeModal('game-over-modal');
  G.players.forEach(p => { p.score = 0; p.roundScores = []; });
  G.round = 1;
  G.startingPlayer = 0;
  startRound();
  showScreen('game-screen');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// ========================
// SORT HAND
// ========================
function sortPlayerHand() {
  const localPlayer = G.players[G.localPlayerIdx];
  if (!localPlayer) return;
  localPlayer.hand.sort((a, b) => {
    if (a.isJoker && b.isJoker) return 0;
    if (a.isJoker) return 1;
    if (b.isJoker) return -1;
    return cardNumericRank(a.val) - cardNumericRank(b.val);
  });
  G.localHandOrder = localPlayer.hand.map(c => c.id);
  // Re-sync index after sort
  if (G.selectedCardId !== null) {
    G.selectedCardIdx = localPlayer.hand.findIndex(c => c.id === G.selectedCardId);
  }
  // In multiplayer push a silent state update so other clients receive
  // the new handOrder (visible when cards are revealed at round end)
  if (!G.botGame) {
    if (isLocalHost) {
      pushGameState(null);
    } else {
      sendAction({ type: 'sortHand', actorId: G.players[G.localPlayerIdx].id, handOrder: G.localHandOrder });
    }
  }
  renderPlayerHand();
}

function getCardTextColor(card) {
  if (card.isJoker) return 'var(--joker)';
  const map = { clubs: 'var(--green)', hearts: 'var(--red)', spades: '#1a1a1a', stars: 'var(--yellow)', diamonds: 'var(--blue)' };
  return map[card.suit] || '#333';
}