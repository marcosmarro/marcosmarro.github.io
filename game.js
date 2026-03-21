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
  botGame: true,
  gameOver: false,
  dealing: false,
  discardDropHighlight: false,
  revealedSet: new Set(),
};

// ========================
// CARD DEFINITIONS
// ========================
const SUITS = ['clubs','hearts','spades','stars','diamonds'];
const SUIT_SYMBOLS = { clubs:'♣', hearts:'♥', spades:'♠', stars:'★', diamonds:'♦' };
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
// LOBBY
// ========================
let lobbyCode = '';
let lobbyPollInterval = null;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createLobby() {
  const name = document.getElementById('create-player-name').value.trim();
  lobbyCode = generateCode();
  document.getElementById('lobby-code-display').textContent = lobbyCode;

  const lobbyData = {
    code: lobbyCode,
    players: [{ name, id: 'host_' + Date.now(), isHost: true }],
    started: false,
    created: Date.now()
  };
  localStorage.setItem('lobby_' + lobbyCode, JSON.stringify(lobbyData));

  updateLobbyUI(lobbyData);
  showScreen('lobby-waiting-screen');

  lobbyPollInterval = setInterval(() => {
    const data = JSON.parse(localStorage.getItem('lobby_' + lobbyCode) || 'null');
    if (!data) return;
    updateLobbyUI(data);
    if (data.started) {
      clearInterval(lobbyPollInterval);
      startMultiplayerGame(data, 0);
    }
  }, 1000);
}

function updateLobbyUI(data) {
  const list = document.getElementById('lobby-players-list');
  list.innerHTML = '';
  const slots = 6;
  for (let i = 0; i < slots; i++) {
    const p = data.players[i];
    const row = document.createElement('div');
    row.className = 'lobby-player-row';
    row.innerHTML = `<div class="player-dot ${p ? '' : 'empty'}"></div>
      <span style="font-size:14px">${p ? p.name : '<span style="color:rgba(255,255,255,0.3);font-style:italic">Open slot</span>'}</span>
      ${p && p.isHost ? '<span style="margin-left:auto;font-size:11px;color:var(--gold)">HOST</span>' : ''}`;
    list.appendChild(row);
  }
  const canStart = data.players.length >= 2;
  const startBtn = document.getElementById('start-lobby-btn');
  if (startBtn) {
    startBtn.disabled = !canStart;
    startBtn.style.opacity = canStart ? '1' : '0.4';
  }
  document.getElementById('lobby-wait-msg').textContent =
    `${data.players.length}/6 players — ${canStart ? 'Ready to start!' : 'Need at least 2 players'}`;
}

function startLobbyGame() {
  const data = JSON.parse(localStorage.getItem('lobby_' + lobbyCode));
  if (!data || data.players.length < 2) return;
  data.started = true;
  localStorage.setItem('lobby_' + lobbyCode, JSON.stringify(data));
  if (lobbyPollInterval) { clearInterval(lobbyPollInterval); lobbyPollInterval = null; }
  startMultiplayerGame(data, 0);
}

function joinLobby() {
  const name = document.getElementById('join-player-name').value.trim();
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  const err = document.getElementById('join-error');

  const data = JSON.parse(localStorage.getItem('lobby_' + code) || 'null');
  if (!data || data.started || data.players.length >= 6) {
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';

  const newPlayer = { name, id: 'p_' + Date.now() };
  data.players.push(newPlayer);
  localStorage.setItem('lobby_' + code, JSON.stringify(data));

  const myIdx = data.players.length - 1;
  lobbyCode = code;
  document.getElementById('lobby-code-display').textContent = code;
  updateLobbyUI(data);
  showScreen('lobby-waiting-screen');

  lobbyPollInterval = setInterval(() => {
    const d = JSON.parse(localStorage.getItem('lobby_' + code) || 'null');
    if (!d) return;
    updateLobbyUI(d);
    if (d.started) {
      clearInterval(lobbyPollInterval);
      startMultiplayerGame(d, myIdx);
    }
  }, 1000);
}

function leaveLobby() {
  if (lobbyPollInterval) clearInterval(lobbyPollInterval);
  if (lobbyCode) {
    const data = JSON.parse(localStorage.getItem('lobby_' + lobbyCode) || 'null');
    if (data) { localStorage.removeItem('lobby_' + lobbyCode); }
  }
  showScreen('home-screen');
}

function startMultiplayerGame(data, myIdx) {
  G.players = data.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    hand: [],
    score: 0,
    roundScores: [],
    isBot: false,
    wentOut: false,
    finishedLastTurn: false,
    isLocalPlayer: i === myIdx
  }));
  G.localPlayerIdx = myIdx;
  G.botGame = false;
  G.round = 1;
  G.startingPlayer = 0;
  startRound();
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
  G.gameOver = false;
  G.dealing = true;

  const cardsToDeal = G.round + 2;

  showScreen('game-screen');
  renderLayout();
  renderPlayerHand();
  renderOpponentCards();
  renderPiles();

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

// ========================
// DRAWING CARDS
// ========================
function drawFromDeck() {
  if (!isMyTurn() || G.drawnCard !== null || (G.phase !== 'draw' && G.phase !== 'lastTurns')) return;
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
      renderPlayerHand();
      flyCardToDiscardPreview(cardIdx);
    });
    return;
  }

  flyCardToDiscardPreview(cardIdx);
}

function confirmDiscard() {
  if (!isMyTurn() || G.drawnCard === null || G.selectedCardIdx < 0) return;
  const localPlayer = G.players[G.localPlayerIdx];
  const card = localPlayer.hand[G.selectedCardIdx];
  if (!card) return;

  clearDiscardPreview();
  localPlayer.hand.splice(G.selectedCardIdx, 1);
  G.discardPile.push(card);
  G.drawnCard = null;
  G.selectedCardIdx = -1;
  advanceTurn();
  renderGame();
}

function undoDiscard() {
  if (!isMyTurn() || G.selectedCardIdx < 0) return;
  const idx = G.selectedCardIdx;
  flyCardBackToHand(idx, () => {
    G.selectedCardIdx = -1;
    renderPlayerHand();
    updateActionButtons();
    updatePlayerLabel();
  });
}

// ========================
// GO OUT
// ========================
function canPlayerGoOut(player) {
  const hand = player.hand;
  if (hand.length < 2) return false;
  for (let i = 0; i < hand.length; i++) {
    const remaining = hand.filter((_, idx) => idx !== i);
    if (isValidHand(remaining)) return true;
  }
  return false;
}

function tryGoOut() {
  const localPlayer = G.players[G.localPlayerIdx];
  if (!canPlayerGoOut(localPlayer)) {
    showToast('❌ Cannot go out yet!', 2500);
    return;
  }

  let discardIdx = G.selectedCardIdx >= 0 ? G.selectedCardIdx : -1;
  if (discardIdx < 0) {
    for (let i = 0; i < localPlayer.hand.length; i++) {
      const remaining = localPlayer.hand.filter((_, idx) => idx !== i);
      if (isValidHand(remaining)) { discardIdx = i; break; }
    }
  } else {
    const remaining = localPlayer.hand.filter((_, idx) => idx !== discardIdx);
    if (!isValidHand(remaining)) {
      showToast('❌ That card cannot be your discard — pick another', 2500);
      return;
    }
  }

  clearDiscardPreview();
  const card = localPlayer.hand[discardIdx];
  localPlayer.hand.splice(discardIdx, 1);
  G.discardPile.push(card);
  G.drawnCard = null;
  G.selectedCardIdx = -1;

  localPlayer.wentOut = true;
  localPlayer.finishedLastTurn = true;
  G.revealedSet.add('local_hand');
  localPlayer.hand.forEach(c => c.faceDown = false);
  G.lastTurnPlayer = G.currentTurn;
  G.phase = 'lastTurns';
  G.lastTurnCount = 0;

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
      if (isWild(c)) return sum + 20;
      if (c.isJoker) return sum + 50;
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
  renderGame();
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

  if (fromEl && toEl && drawnCard) {
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
  renderPlayerHand();
}

function getCardTextColor(card) {
  if (card.isJoker) return 'var(--joker)';
  if (isWild(card)) return 'var(--gold)';
  const map = { clubs: 'var(--green)', hearts: 'var(--red)', spades: '#1a1a1a', stars: 'var(--yellow)', diamonds: 'var(--blue)' };
  return map[card.suit] || '#333';
}
