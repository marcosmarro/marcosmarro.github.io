// ========================
// RENDER
// ========================
function renderGame() {
  renderLayout();
  renderOpponentCards();
  renderPlayerHand();
  updatePlayerLabel();
  renderPiles();
  updateTopBar();
  updateActionButtons();
  updateScoresPanel();
}

function renderLayout() {
  const n = G.players.length;
  const opponents = G.players.filter(p => !p.isLocalPlayer);
  const container = document.getElementById('opponent-areas-container');
  container.innerHTML = '';

  const layouts = {
    2: [
      { top: '0', left: '50%', transform: 'translateX(-50%)' }
    ],
    3: [
      { top: '50%', left: '0', transform: 'translateY(-50%)' },
      { top: '50%', right: '0', left: 'auto', transform: 'translateY(-50%)' }
    ],
    4: [
      { top: '50%', left: '0', transform: 'translateY(-50%)' },
      { top: '0',   left: '50%', transform: 'translateX(-50%)' },
      { top: '50%', right: '0', left: 'auto', transform: 'translateY(-50%)' }
    ],
    5: [
      { top: '65%', left: '0', transform: 'translateY(-50%)' },
      { top: '0',   left: '-25px' },
      { top: '0',   right: '-25px', left: 'auto' },
      { top: '65%', right: '0', left: 'auto', transform: 'translateY(-50%)' }
    ],
    6: [
      { top: '30%', left: '0', transform: 'translateY(-50%)' },
      { top: '70%', left: '0', transform: 'translateY(-50%)' },
      { top: '0',   left: '50%', transform: 'translateX(-50%)' },
      { top: '30%', right: '0', left: 'auto', transform: 'translateY(-50%)' },
      { top: '70%', right: '0', left: 'auto', transform: 'translateY(-50%)' }
    ]
  };

  const seatLabels = {
    2: ['top'],
    3: ['left','right'],
    4: ['left','top','right'],
    5: ['left','corner-tl','corner-tr','right'],
    6: ['left','left','top','right','right']
  };
  const seats = seatLabels[n] || seatLabels[2];
  const positions = layouts[n] || layouts[2];

  opponents.forEach((p, i) => {
    const pos = positions[i % positions.length];
    const seat = seats[i % seats.length];
    const seatClass = seat === 'left'      ? 'seat-left'
                    : seat === 'right'     ? 'seat-right'
                    : seat === 'corner-tl' ? 'seat-corner-tl'
                    : seat === 'corner-tr' ? 'seat-corner-tr'
                    : 'seat-top';

    const area = document.createElement('div');
    area.className = 'opponent-area ' + seatClass;
    area.id = 'opponent_' + p.id;
    area.dataset.seat = seat;

    Object.entries(pos).forEach(([k, v]) => area.style[k] = v);

    const isActive = G.players[G.currentTurn]?.id === p.id;

    const cardsEl = document.createElement('div');
    cardsEl.className = 'opponent-cards';
    cardsEl.id = 'opp-cards-' + p.id;
    cardsEl.dataset.seat = seat;

    const nameEl = document.createElement('div');
    nameEl.className = 'opponent-name' + (isActive ? ' active-turn' : '') + (p.wentOut ? ' went-out' : '');
    const oppRoundScore = (G.phase === 'roundEnd' || p.finishedLastTurn)
      ? (p.wentOut ? 0 : scoreHand(p.hand))
      : null;
    nameEl.textContent = p.name + (p.wentOut ? ' ✓' : '') +
      (oppRoundScore !== null ? ` · ${oppRoundScore}` : '');
    nameEl.id = 'opp-name-' + p.id;
    nameEl.dataset.seatFor = seat;

    area.appendChild(cardsEl);
    area.appendChild(nameEl);
    container.appendChild(area);
  });
}

function renderOpponentCards() {
  G.players.forEach(p => {
    if (p.isLocalPlayer) return;
    const el = document.getElementById('opp-cards-' + p.id);
    if (!el) return;
    el.innerHTML = '';

    const revealed = p.finishedLastTurn || G.phase === 'roundEnd';
    const wasRevealed = G.revealedSet.has(p.id);

    if (revealed && !wasRevealed) {
      G.revealedSet.add(p.id);
    }
    const seat = el.dataset.seat || 'top';
    // When this opponent has a card hovering over the discard pile (preview),
    // show one fewer card so their hand count stays accurate during the animation.
    // Only subtract if the preview card is still actually in their hand — once
    // processAction removes it, the hand is already the right size.
    const isPreviewingDiscard = G.previewCard &&
      G.players[G.currentTurn]?.id === p.id &&
      !p.isLocalPlayer &&
      p.hand.some(c => c.id === G.previewCard.id);
    const displayHand = isPreviewingDiscard
      ? p.hand.filter(c => c.id !== G.previewCard.id)
      : p.hand;
    const n = displayHand.length;
    if (n === 0) { el.style.cssText = 'width:0;height:0'; return; }

    const CW = 75, CH = 120;
    const SIDE_CW = 75, SIDE_CH = 120;
    const CROP = 0.20;
    const isSide = seat === 'left' || seat === 'right';
    const isCorner = seat === 'corner-tl' || seat === 'corner-tr';

    if (seat === 'top') {
      const availW = Math.min(window.innerWidth * 0.44, 240);
      const idealStep = Math.round(CW * 0.26);
      const maxStep = n <= 1 ? CW : Math.floor((availW - CW) / (n - 1));
      const step = Math.min(idealStep, maxStep);
      const totalW = n <= 1 ? CW : step * (n - 1) + CW;
      const hidden = Math.round(CH * CROP);
      el.style.cssText = `position:relative; overflow:visible; width:${totalW}px; height:${CH - hidden}px;`;
      const ARC_R = 500;
      const angleDeg = 2;
      const topStartAngleDeg = ((n - 1) / 2) * angleDeg;
      displayHand.forEach((card, idx) => {
        const θDeg = topStartAngleDeg - idx * angleDeg;
        const θRad = θDeg * Math.PI / 180;
        const yOffset = -(ARC_R - ARC_R * Math.cos(θRad));
        const div = createMiniCardElement(card, !revealed);
        div.style.cssText = `position:absolute; width:${CW}px; height:${CH}px; left:${idx * step}px; top:${-hidden + yOffset}px; z-index:${n - idx}; transform-origin:top center; transform:rotate(${θDeg}deg);`;
        el.appendChild(div);
      });

    } else if (isSide) {
      const isLeft = seat === 'left';
      const visibleW = Math.round(SIDE_CH * (1 - CROP));
      const availH = Math.min(window.innerHeight * 0.50, 260);
      const idealStep = Math.round(SIDE_CW * 0.26);
      const maxStep = n <= 1 ? SIDE_CW : Math.floor((availH - SIDE_CW) / (n - 1));
      const step = Math.min(idealStep, maxStep);
      const totalH = n <= 1 ? SIDE_CW : step * (n - 1) + SIDE_CW;
      el.style.cssText = `position:relative; overflow:visible; width:${visibleW}px; height:${totalH}px;`;

      const sideMaxSpread = 2 * (n - 1);
      const sideAngleStep = n > 1 ? sideMaxSpread / (n - 1) : 0;
      const sideStartAngle = n > 1 ? -sideMaxSpread / 2 : 0;
      const ARC_R = 500;
      const centerIdx = (n - 1) / 2;

      displayHand.forEach((card, idx) => {
        const fanAngle = sideStartAngle + idx * sideAngleStep;
        const div = createMiniCardElement(card, !revealed);
        const directedFan = isLeft ? fanAngle : -fanAngle;
        const baseAngle = isLeft ? 90 : -90;
        const centerFromWall = visibleW - SIDE_CH / 2;
        const distFromCenter = idx - centerIdx;
        const θRad = (distFromCenter * sideAngleStep) * Math.PI / 180;
        const arcInset = ARC_R - ARC_R * Math.cos(θRad);
        const adjustedCenter = centerFromWall - arcInset;
        const left = isLeft
          ? adjustedCenter - SIDE_CW / 2
          : visibleW - adjustedCenter - SIDE_CW / 2;
        const cardCenterY = idx * step + SIDE_CW / 2;
        const top  = cardCenterY - SIDE_CH / 2;
        const zIndex = isLeft ? (idx + 1) : (n - idx);
        div.style.cssText = `position:absolute; width:${SIDE_CW}px; height:${SIDE_CH}px; left:${left}px; top:${top}px; z-index:${zIndex}; transform-origin:center center; transform:rotate(${baseAngle + directedFan}deg);`;
        el.appendChild(div);
      });

    } else if (isCorner) {
      const isLeft2 = seat === 'corner-tl';
      const angStep2 = Math.max(1, 10 - Math.floor((G.round - 1) / 2));
      const totalSpread2 = angStep2 * (n - 1);
      const centerAngle = isLeft2 ? 40 : 145;
      const startAngle = centerAngle - totalSpread2 / 2;
      const BASE_R = 20, R = BASE_R + n * 10;
      const rx = R;
      const ry = R * 1.65;
      const cardDiag = Math.round(Math.sqrt(CW * CW + CH * CH));
      const containerSize = Math.max(rx, ry) + cardDiag + 8;
      el.style.cssText = `position:relative; overflow:visible; width:${containerSize}px; height:${containerSize}px;`;
      displayHand.forEach((card, idx) => {
        const dirAngle = startAngle + idx * angStep2;
        const dirRad = dirAngle * Math.PI / 180;
        const cardAngle = dirAngle + (isLeft2 ? 90 : -90);
        const originX = isLeft2 ? 0 : containerSize;
        const cx = originX + rx * Math.cos(dirRad) - CW / 2;
        const cy = ry * Math.sin(dirRad) - CH / 2;
        const div = createMiniCardElement(card, !revealed);
        div.style.cssText = `position:absolute; width:${CW}px; height:${CH}px; left:${cx}px; top:${cy}px; z-index:${idx + 1}; transform-origin:center center; transform:rotate(${cardAngle}deg);`;
        el.appendChild(div);
      });
    }

    if (revealed && !wasRevealed) {
      const container = document.getElementById('opp-cards-' + p.id);
      setTimeout(() => flipRevealCards(container), 50);
    }

    const nameEl = document.getElementById('opp-name-' + p.id);
    if (nameEl) {
      if (seat === 'left') {
        nameEl.style.cssText = 'position:absolute; top:-20px; left:0; white-space:nowrap;';
      } else if (seat === 'right') {
        nameEl.style.cssText = 'position:absolute; top:-20px; right:0; left:auto; white-space:nowrap;';
      } else if (seat === 'corner-tl') {
        nameEl.style.cssText = 'position:absolute; top:4px; left:29px; white-space:nowrap; z-index:20;';
      } else if (seat === 'corner-tr') {
        nameEl.style.cssText = 'position:absolute; top:4px; right:29px; left:auto; white-space:nowrap; z-index:20;';
      } else {
        nameEl.style.cssText = 'position:absolute; top:calc(100% + 8px); left:50%; transform:translateX(-50%); white-space:nowrap;';
      }
    }
  });
}

function updatePlayerLabel() {
  const el = document.getElementById('player-label');
  if (!el) return;
  const localPlayer = G.players[G.localPlayerIdx];
  if (!localPlayer) return;

  // When a card has been lifted to preview, it's removed from hand — score the remaining hand as-is
  // (previewRemovedCard is not in hand, so hand already reflects the "if I discard this" scenario)
  const scoringHand = previewRemovedCard
    ? localPlayer.hand
    : (G.selectedCardIdx >= 0
        ? localPlayer.hand.filter((_, i) => i !== G.selectedCardIdx)
        : localPlayer.hand);
  const roundScore = scoreHand(scoringHand);
  const isRoundEnd = G.phase === 'roundEnd';

  if (isRoundEnd && localPlayer.wentOut) {
    el.innerHTML = `<span style="color:var(--gold)">${localPlayer.name}</span> <span style="color:rgba(255,255,255,0.4)">· went out · 0</span>`;
  } else {
    const pts = roundScore;
    const color = pts === 0 ? 'var(--green-light)' : pts <= 10 ? 'var(--gold)' : 'rgba(255,255,255,0.5)';
    el.innerHTML = `<span style="color:var(--gold)">${localPlayer.name}</span> <span style="color:${color}">· ${pts}</span>`;
  }
}

function renderPlayerHand() {
  if (dragState) return;
  const hand = document.getElementById('player-hand');
  const localPlayer = G.players[G.localPlayerIdx];
  if (!localPlayer) return;

  hand.innerHTML = '';

  const CARD_W = 80;
  const n = localPlayer.hand.length;

  const maxWidth = window.innerWidth - 32;
  let step;
  if (n <= 1) {
    step = CARD_W;
  } else {
    const idealStep = Math.round(CARD_W * 0.26);
    const maxStep = Math.floor((maxWidth - CARD_W) / (n - 1));
    step = Math.min(idealStep, maxStep);
  }

  const CARD_H = 180;
  const totalWidth = n <= 1 ? CARD_W : step * (n - 1) + CARD_W;
  hand.style.width = totalWidth + 'px';
  hand.style.height = CARD_H + 'px';

  const R = 500;
  const angleDeg = 2;
  const startAngleDeg = -((n - 1) / 2) * angleDeg;

  localPlayer.hand.forEach((card, idx) => {
    const div = createCardElement(card, idx, !!card.faceDown);
    div.setAttribute('data-idx', idx);
    div.setAttribute('data-hand', 'true');

    const θDeg = startAngleDeg + idx * angleDeg;
    const θRad = θDeg * Math.PI / 180;

    const x = idx * step;
    const yOffset = R - R * Math.cos(θRad);

    div.style.left = x + 'px';
    div.style.top  = yOffset + 'px';
    div.style.transform = `rotate(${θDeg}deg)`;
    div.style.transformOrigin = 'bottom center';
    div.style.zIndex = idx + 1;

    if (idx === G.selectedCardIdx && !dragState && !previewRemovedCard) div.style.opacity = '0';

    if (!localPlayer.finishedLastTurn && G.phase !== 'roundEnd') {
      div.addEventListener('click', () => {
        if (isMyTurn() && G.drawnCard !== null) {
          tapCardToDiscard(idx);
        }
      });
      div.addEventListener('mousedown', startDrag);
      div.addEventListener('touchstart', startDrag, { passive: false });
    } else if (G.phase === 'roundEnd') {
      div.addEventListener('click', () => {
        card.faceDown = !card.faceDown;
        renderPlayerHand();
      });
    }

    hand.appendChild(div);
  });
}

// ========================
// CARD ELEMENT BUILDERS
// ========================
const JOKER_LETTER_CLASSES = ['jc-0','jc-1','jc-2','jc-3','jc-4'];
const JOKER_LETTERS = ['J','O','K','E','R'];

function buildPip(card, isLarge) {
  const frag = document.createDocumentFragment();

  function makePip(corner) {
    const pip = document.createElement('div');
    pip.className = 'cp ' + corner;

    if (card.isJoker) {
      const col = document.createElement('div');
      col.className = 'cp-joker';
      const fs = '10px';
      JOKER_LETTERS.forEach((letter, i) => {
        const span = document.createElement('span');
        span.className = JOKER_LETTER_CLASSES[i];
        span.style.fontSize = fs;
        span.textContent = letter;
        col.appendChild(span);
      });
      pip.appendChild(col);
    } else {
      const cardColor = getCardTextColor(card);

      const val = document.createElement('div');
      val.className = 'cp-val';
      val.style.fontSize = '18px';
      val.style.color = cardColor;
      val.textContent = card.val;

      const suit = document.createElement('div');
      suit.className = 'cp-suit';
      suit.style.fontSize = '14px';
      suit.style.color = cardColor;
      suit.textContent = SUIT_SYMBOLS[card.suit] || '';

      pip.appendChild(val);
      pip.appendChild(suit);
    }
    return pip;
  }

  frag.appendChild(makePip('tl'));
  frag.appendChild(makePip('br'));
  return frag;
}

function createCardElement(card, idx, faceDown = false) {
  const el = document.createElement('div');
  el.className = 'card ' + getSuitClass(card) + (isWild(card) ? ' wild-card' : '') + (faceDown ? ' face-down' : '');
  if (!faceDown) el.appendChild(buildPip(card, true));
  return el;
}

function createMiniCardElement(card, faceDown = false) {
  const el = document.createElement('div');
  el.className = 'opp-card-mini ' + getSuitClass(card) + (isWild(card) ? ' wild-card' : '') + (faceDown ? ' face-down' : '');
  if (!faceDown) el.appendChild(buildPip(card, false));
  return el;
}

function flipCard(el, faceDown) {
  el.classList.toggle('face-down', faceDown);
}

function flipRevealCards(containerEl, delayMs = 0) {
  if (!containerEl) return;
  containerEl.querySelectorAll('.opp-card-mini, .card').forEach((card, idx) => {
    setTimeout(() => card.classList.remove('face-down'), delayMs + idx * 80);
  });
}

function flipRevealPlayerHand(delayMs = 0) {
  const hand = document.getElementById('player-hand');
  if (!hand) return;
  hand.querySelectorAll('.card').forEach((card, idx) => {
    setTimeout(() => card.classList.remove('face-down'), delayMs + idx * 80);
  });
}

function getSuitClass(card) {
  if (card.isJoker) return 'suit-joker';
  if (isWild(card)) return 'suit-wild';
  return 'suit-' + card.suit;
}

function getSuitSymbol(card) {
  if (card.isJoker) return '';
  return SUIT_SYMBOLS[card.suit] || card.suit;
}

// ========================
// PILES
// ========================
function renderPiles() {
  const discardDisplay = document.getElementById('discard-pile-display');
  const hasPreview = !!document.getElementById('discard-preview-card');
  discardDisplay.innerHTML = '';

  const topDiscard = G.discardPile[G.discardPile.length - 1];
  if (topDiscard) {
    const el = createCardElement(topDiscard, -1);
    el.className += ' large';
    el.style.position = 'absolute';
    el.style.top = '0'; el.style.left = '0';
    if ((G.phase === 'draw' || G.phase === 'lastTurns') && isMyTurn() && !G.drawnCard) {
      el.style.cursor = 'pointer';
      el.onclick = () => drawFromDiscard();
    }
    discardDisplay.appendChild(el);
  } else {
    const placeholder = document.createElement('div');
    placeholder.style.cssText = 'width:50px;height:70px;border:2px dashed rgba(255,255,255,0.15);border-radius:7px;';
    discardDisplay.appendChild(placeholder);
  }

  // Local player's own preview: the card element is appended directly to discardDisplay
  // by flyCardToDiscardPreview — we just re-append it if it exists and was cleared by innerHTML reset.
  if (hasPreview && previewRemovedCard) {
    const existing = document.getElementById('discard-preview-card');
    if (!existing) {
      const preview = createCardElement(previewRemovedCard, -1);
      preview.id = 'discard-preview-card';
      preview.className += ' large';
      preview.style.cssText = `
        position:absolute; top:0; left:0;
        transform: rotate(3deg);
        outline: 3px solid var(--gold);
        box-shadow: 0 0 18px rgba(200,148,10,0.7), 0 4px 16px rgba(0,0,0,0.5);
        z-index: 10;
      `;
      discardDisplay.appendChild(preview);
    }
  }

  // Observer view: another player has previewed a card — show it hovering
  if (!isMyTurn() && G.previewCard) {
    const preview = createCardElement(G.previewCard, -1);
    preview.id = 'discard-preview-card';
    preview.className += ' large';
    preview.style.cssText = `
      position:absolute; top:0; left:0;
      transform: rotate(3deg);
      outline: 3px solid var(--gold);
      box-shadow: 0 0 18px rgba(200,148,10,0.7), 0 4px 16px rgba(0,0,0,0.5);
      z-index: 10;
    `;
    discardDisplay.appendChild(preview);
  }
}

// ========================
// TOP BAR / SCORES / ACTIONS
// ========================
function updateTopBar() {
  const currentPlayer = G.players[G.currentTurn];
  const turnEl = document.getElementById('center-turn-label');
  if (turnEl) {
    turnEl.textContent = currentPlayer
      ? (isMyTurn() ? '⭐ Your Turn' : `${currentPlayer.name}'s Turn`)
      : '';
  }
}

function updateActionButtons() {
  if (G.phase === 'roundEnd') return;

  const localPlayer = G.players[G.localPlayerIdx];
  const myTurn = isMyTurn();
  const hasDrawn = G.drawnCard !== null;
  // A card is "selected" either via the old index path or via the new previewRemovedCard path
  const hasSelected = G.selectedCardIdx >= 0 || previewRemovedCard !== null || G.selectedCardId !== null;

  const continueBtn = document.getElementById('continue-btn');
  continueBtn.disabled = !(myTurn && hasDrawn && hasSelected);

  const undoBtn = document.getElementById('undo-btn');
  undoBtn.disabled = !(myTurn && hasSelected);

  const goOutBtn = document.getElementById('go-out-btn');
  const someoneElseWentOut = G.players.some(p => p.wentOut && !p.isLocalPlayer);
  let canGoOut = false;
  if (myTurn && hasDrawn && hasSelected && !someoneElseWentOut) {
    // When previewRemovedCard is set, the hand already excludes the selected card
    const remaining = previewRemovedCard
      ? localPlayer.hand
      : localPlayer.hand.filter((_, i) => i !== G.selectedCardIdx);
    canGoOut = isValidHand(remaining);
  }
  goOutBtn.disabled = !canGoOut;
  goOutBtn.title = !myTurn ? "Not your turn"
    : !hasDrawn ? "Draw a card first"
    : !hasSelected ? "Select a card to discard first"
    : someoneElseWentOut ? "Someone already went out"
    : !canGoOut ? "Can't go out with that discard"
    : "";
}

function updateScoresPanel() {
  const rows = document.getElementById('center-scores-rows');
  if (!rows) return;
  rows.innerHTML = '';
  const sorted = [...G.players].sort((a, b) => a.score - b.score);
  sorted.forEach(p => {
    const isActive = G.players[G.currentTurn]?.id === p.id;
    const row = document.createElement('div');
    row.className = 'cscore-row' +
      (p.isLocalPlayer ? ' me' : '') +
      (isActive ? ' active-score' : '');
    row.innerHTML = `<span class="cscore-name">${p.name}</span><span class="cscore-pts">${p.score}</span>`;
    rows.appendChild(row);
  });
}

// ========================
// DEAL ANIMATION
// ========================
function dealCardsAnimated(count, callback) {
  const dealScreen = document.getElementById('dealing-screen');
  dealScreen.classList.add('show');
  document.getElementById('dealing-status').textContent =
    `Round ${G.round}  ·  Dealing ${count} card${count > 1 ? 's' : ''} each...`;

  function getDeckCenter() {
    const el = document.getElementById('draw-pile-visual');
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function getPlayerTargetCenter(playerIdx) {
    const p = G.players[playerIdx];
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

  function flyCard(targetPlayerIdx, cardData, cardInHand, done) {
    const origin = getDeckCenter();
    const target = getPlayerTargetCenter(targetPlayerIdx);

    const flying = document.createElement('div');
    flying.className = 'card face-down';
    flying.style.cssText = `
      position: fixed;
      width: 64px;
      height: 94px;
      left: ${origin.x - 28}px;
      top:  ${origin.y - 41}px;
      z-index: 9998;
      pointer-events: none;
      transition: none;
      border-radius: 7px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.55);
    `;
    document.body.appendChild(flying);
    flying.getBoundingClientRect();

    const dx = target.x - origin.x;
    const dy = target.y - origin.y;

    flying.style.transition = 'transform 0.28s cubic-bezier(0.25, 0.8, 0.4, 1), opacity 0.28s ease';
    flying.style.transform = `translate(${dx}px, ${dy}px) scale(0.88)`;
    flying.style.opacity = '0.92';

    setTimeout(() => {
      document.body.removeChild(flying);
      G.players[targetPlayerIdx].hand.push(cardData);
      if (G.players[targetPlayerIdx].isLocalPlayer) {
        renderPlayerHand();
      } else {
        renderOpponentCards();
      }
      done();
    }, 290);
  }

  const totalCards = count * G.players.length;
  const delayBetween = totalCards <= 12 ? 200 : totalCards <= 20 ? 160 : 130;

  let dealIdx = 0;
  let playerIdx = G.startingPlayer;

  function dealNext() {
    if (dealIdx >= totalCards) {
      dealScreen.classList.remove('show');
      callback();
      return;
    }

    const cardData = G.deck.pop();
    const pIdx = playerIdx;

    playerIdx = (playerIdx + 1) % G.players.length;
    dealIdx++;

    flyCard(pIdx, cardData, dealIdx, () => {
      setTimeout(dealNext, delayBetween);
    });
  }

  setTimeout(dealNext, 350);
}

// ========================
// CARD DRAW / FLY ANIMATIONS
// ========================
function animateCardDraw(fromEl, toEl, faceUp, cardData, callback) {
  const fromRect = fromEl.getBoundingClientRect();
  const toRect   = toEl.getBoundingClientRect();

  const CARD_W = 80, CARD_H = 120;
  const startX = fromRect.left + fromRect.width  / 2 - CARD_W / 2;
  const startY = fromRect.top  + fromRect.height / 2 - CARD_H / 2;

  const flying = faceUp ? createCardElement(cardData, -1) : document.createElement('div');
  if (!faceUp) flying.className = 'card face-down';
  flying.style.cssText = `
    position: fixed;
    width: ${CARD_W}px;
    height: ${CARD_H}px;
    left: ${startX}px;
    top: ${startY}px;
    z-index: 9998;
    pointer-events: none;
    transition: none;
    border-radius: 7px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.55);
  `;
  document.body.appendChild(flying);
  flying.getBoundingClientRect();

  const dx = (toRect.left + toRect.width  / 2) - (startX + CARD_W / 2);
  const dy = (toRect.top  + toRect.height / 2) - (startY + CARD_H / 2);

  flying.style.transition = 'transform 0.6s cubic-bezier(0.25, 0.8, 0.4, 1), opacity 0.6s ease';
  flying.style.transform = `translate(${dx}px, ${dy}px) scale(0.9)`;
  flying.style.opacity = '0.85';

  setTimeout(() => {
    flying.remove();
    callback();
  }, 500);
}

// Stores the card that has been visually "lifted" to the discard preview area
// so it can be restored to the hand if the player undoes.
let previewRemovedCard = null;
let previewRemovedIdx = null;

function resetPreviewState() {
  previewRemovedCard = null;
  previewRemovedIdx = null;
}

function flyCardToDiscardPreview(cardIdx) {
  const localPlayer = G.players[G.localPlayerIdx];
  const card = localPlayer.hand[cardIdx];
  if (!card) return;

  const hand = document.getElementById('player-hand');
  const cardEls = hand.querySelectorAll('.card');
  const cardEl = cardEls[cardIdx];
  const discardTarget = document.getElementById('discard-drop-target');
  if (!cardEl || !discardTarget) return;

  const fromRect = cardEl.getBoundingClientRect();
  const toRect   = discardTarget.getBoundingClientRect();

  const flyCard = cardEl.cloneNode(true);
  flyCard.style.cssText = `
    position:fixed;
    width:${fromRect.width}px; height:${fromRect.height}px;
    left:${fromRect.left}px; top:${fromRect.top}px;
    z-index:9998; pointer-events:none;
    transform: rotate(0deg) scale(1);
    opacity: 1;
    transition: left 0.3s cubic-bezier(0.4,0,0.2,1),
                top 0.3s cubic-bezier(0.4,0,0.2,1),
                transform 0.3s cubic-bezier(0.4,0,0.2,1);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `;
  document.body.appendChild(flyCard);

  // Remove card from hand immediately so drag-reorder won't show it.
  // Store it so we can restore it on undo.
  previewRemovedCard = localPlayer.hand.splice(cardIdx, 1)[0];
  previewRemovedIdx  = cardIdx;
  // Update localHandOrder to reflect removal
  G.localHandOrder = localPlayer.hand.map(c => c.id);

  // selectedCardIdx is now invalid (card removed), use -1 but keep selectedCardId
  G.selectedCardIdx = -1;  // will resolve via ID
  G.selectedCardId = previewRemovedCard.id;
  updateActionButtons();
  updatePlayerLabel();

  // Re-render hand without the selected card
  renderPlayerHand();

  flyCard.getBoundingClientRect();

  const destLeft = toRect.left + (toRect.width  - fromRect.width)  / 2;
  const destTop  = toRect.top  + (toRect.height - fromRect.height) / 2;
  flyCard.style.left      = destLeft + 'px';
  flyCard.style.top       = destTop  + 'px';
  flyCard.style.transform = 'rotate(3deg) scale(1)';

  setTimeout(() => {
    document.body.removeChild(flyCard);
    clearDiscardPreview();
    const preview = createCardElement(previewRemovedCard, -1);
    preview.id = 'discard-preview-card';
    preview.className += ' large';
    preview.style.cssText = `
      position:absolute; top:0; left:0;
      transform: rotate(3deg);
      outline: 3px solid var(--gold);
      box-shadow: 0 0 18px rgba(200,148,10,0.7), 0 4px 16px rgba(0,0,0,0.5);
      z-index: 10;
    `;
    document.getElementById('discard-pile-display').appendChild(preview);

    if (G.phase === 'lastTurns' && !G.revealedSet.has('local_hand')) {
      G.revealedSet.add('local_hand');
      G.players[G.localPlayerIdx].hand.forEach(c => c.faceDown = false);
      renderPlayerHand();
      flipRevealPlayerHand(50);
    }
  }, 310);
}

function flyCardBackToHand(cardIdx, callback) {
  clearDiscardPreview();

  // Restore the removed card back into the hand at its original position
  const localPlayer = G.players[G.localPlayerIdx];
  if (previewRemovedCard) {
    const restoreIdx = Math.min(previewRemovedIdx ?? localPlayer.hand.length, localPlayer.hand.length);
    localPlayer.hand.splice(restoreIdx, 0, previewRemovedCard);
    G.localHandOrder = localPlayer.hand.map(c => c.id);
    previewRemovedCard = null;
    previewRemovedIdx = null;
  }

  // Re-render so the card appears back in hand, then animate from discard area
  renderPlayerHand();

  const hand = document.getElementById('player-hand');
  const discardTarget = document.getElementById('discard-drop-target');
  if (!discardTarget) { if (callback) callback(); return; }

  // Find the card element by its data-idx (which now corresponds to restored position)
  const restoredIdx = G.selectedCardId !== null
    ? localPlayer.hand.findIndex(c => c.id === G.selectedCardId)
    : -1;
  const cardEls = hand.querySelectorAll('.card');
  const cardEl = restoredIdx >= 0 ? cardEls[restoredIdx] : null;

  if (!cardEl) { if (callback) callback(); return; }

  const toRect   = cardEl.getBoundingClientRect();
  const fromRect = discardTarget.getBoundingClientRect();
  const card = localPlayer.hand[restoredIdx];

  const flyCard = createCardElement(card, -1);
  flyCard.className += ' large';
  flyCard.style.cssText = `
    position:fixed;
    width:50px; height:70px;
    left:${fromRect.left + (fromRect.width - 50) / 2}px;
    top:${fromRect.top  + (fromRect.height - 70) / 2}px;
    z-index:9998; pointer-events:none;
    transform: rotate(3deg) scale(1);
    opacity: 1;
    transition: left 0.3s cubic-bezier(0.4,0,0.2,1),
                top 0.3s cubic-bezier(0.4,0,0.2,1),
                transform 0.3s cubic-bezier(0.4,0,0.2,1);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `;
  document.body.appendChild(flyCard);
  cardEl.style.opacity = '0';

  flyCard.getBoundingClientRect();

  flyCard.style.left      = toRect.left + 'px';
  flyCard.style.top       = toRect.top  + 'px';
  flyCard.style.transform = 'rotate(0deg) scale(1)';

  setTimeout(() => {
    document.body.removeChild(flyCard);
    if (cardEl) cardEl.style.opacity = '';
    if (callback) callback();
  }, 310);
}

// ========================
// DRAG & DROP
// ========================
let dragState = null;

function startDrag(e) {
  if (dragState) return;
  const touch = e.touches ? e.touches[0] : e;
  const topEl = document.elementFromPoint(touch.clientX, touch.clientY);
  if (topEl !== e.currentTarget && !e.currentTarget.contains(topEl)) return;

  const target = e.currentTarget;
  const isDrawn = target.getAttribute('data-drawn') === 'true';
  const sourceIdx = parseInt(target.getAttribute('data-idx'));
  const startX = touch.clientX;
  const startY = touch.clientY;

  function commitDrag(t) {
    const rect = target.getBoundingClientRect();
    const hand = document.getElementById('player-hand');

    const grabOffsetX = startX - rect.left;
    const grabOffsetY = startY - rect.top;

    target.style.position = 'fixed';
    target.style.width = rect.width + 'px';
    target.style.height = rect.height + 'px';
    target.style.left = rect.left + 'px';
    target.style.top = rect.top + 'px';
    target.style.transition = 'none';
    target.style.transformOrigin = 'top left';
    target.style.transform = 'none';
    target.style.margin = '0';

    const handCards = Array.from(hand.querySelectorAll('.card'));
    const origLeftEdges = handCards.map(c =>
      c === target ? rect.left : c.getBoundingClientRect().left
    );

    dragState = {
      sourceIdx,
      dropIdx: sourceIdx,
      isDrawn,
      element: target,
      grabOffsetX,
      grabOffsetY,
      origLeftEdges,
    };

    renderDragPreview();

    document.removeEventListener('mousemove', onPendingMove);
    document.removeEventListener('touchmove', onPendingMove);
    document.removeEventListener('mouseup', onPendingCancel);
    document.removeEventListener('touchend', onPendingCancel);

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchend', onDragEnd);
  }

  function onPendingMove(e) {
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > 6) {
      e.preventDefault();
      commitDrag(t);
    }
  }

  function onPendingCancel() {
    document.removeEventListener('mousemove', onPendingMove);
    document.removeEventListener('touchmove', onPendingMove);
    document.removeEventListener('mouseup', onPendingCancel);
    document.removeEventListener('touchend', onPendingCancel);
  }

  document.addEventListener('mousemove', onPendingMove);
  document.addEventListener('touchmove', onPendingMove, { passive: false });
  document.addEventListener('mouseup', onPendingCancel);
  document.addEventListener('touchend', onPendingCancel);
}

function renderDragPreview() {
  if (!dragState) return;
  const localPlayer = G.players[G.localPlayerIdx];
  const n = localPlayer.hand.length;
  const hand = document.getElementById('player-hand');
  const cards = Array.from(hand.querySelectorAll('.card'));
  const src = dragState.sourceIdx;
  const dst = dragState.dropIdx;

  const order = [];
  for (let i = 0; i < n; i++) if (i !== src) order.push(i);
  order.splice(Math.min(dst, order.length), 0, src);

  const srcNewPos = order.indexOf(src);

  const CARD_W = 80;
  const maxWidth = window.innerWidth - 32;
  const step = n <= 1 ? CARD_W : Math.min(Math.round(CARD_W * 0.26), Math.floor((maxWidth - CARD_W) / (n - 1)));
  const ARC_R = 500;
  const angleDeg = 2;
  const startAngleDeg = -((n - 1) / 2) * angleDeg;

  order.forEach((origIdx, newPos) => {
    const card = cards[origIdx];
    if (!card) return;
    const θDeg = startAngleDeg + newPos * angleDeg;
    const θRad = θDeg * Math.PI / 180;
    const x = newPos * step;
    const yOffset = ARC_R - ARC_R * Math.cos(θRad);

    if (origIdx === src) {
      card.style.zIndex = srcNewPos + 1;
    } else {
      card.style.transition = 'left 0.15s ease, top 0.15s ease, transform 0.15s ease';
      card.style.left = x + 'px';
      card.style.top = yOffset + 'px';
      card.style.transform = `rotate(${θDeg}deg)`;
      card.style.zIndex = newPos >= srcNewPos ? newPos + 2 : newPos + 1;
    }
  });
}

function onDragMove(e) {
  if (!dragState) return;
  e.preventDefault();
  const touch = e.touches ? e.touches[0] : e;
  const { element, grabOffsetX, grabOffsetY } = dragState;

  element.style.left = (touch.clientX - grabOffsetX) + 'px';
  element.style.top  = (touch.clientY - grabOffsetY) + 'px';

  if (dragState.isDrawn) return;

  const edges = dragState.origLeftEdges;
  const n = edges.length;
  const ghostLeft = touch.clientX - grabOffsetX;

  let newDrop = n;
  for (let i = 0; i < n; i++) {
    if (ghostLeft < edges[i]) { newDrop = i; break; }
  }

  if (newDrop !== dragState.dropIdx) {
    dragState.dropIdx = newDrop;
    renderDragPreview();
  }
}

function onDragEnd(e) {
  if (!dragState) return;
  const { element } = dragState;

  element.style.position = '';
  element.style.left = '';
  element.style.top = '';
  element.style.width = '';
  element.style.height = '';
  element.style.transform = '';
  element.style.transformOrigin = '';
  element.style.transition = '';
  element.style.zIndex = '';
  element.style.margin = '';

  if (!dragState.isDrawn) {
    const localPlayer = G.players[G.localPlayerIdx];
    const { sourceIdx, dropIdx } = dragState;
    if (dropIdx !== sourceIdx) {
      const card = localPlayer.hand.splice(sourceIdx, 1)[0];
      localPlayer.hand.splice(Math.min(dropIdx, localPlayer.hand.length), 0, card);
    }
    // Persist the new order so Firebase pushes don't reset it
    G.localHandOrder = localPlayer.hand.map(c => c.id);
    // Re-sync selectedCardIdx from stable ID after reorder
    if (G.selectedCardId !== null) {
      G.selectedCardIdx = localPlayer.hand.findIndex(c => c.id === G.selectedCardId);
    }
  }

  dragState = null;

  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.removeEventListener('touchend', onDragEnd);

  if (isMyTurn()) {
    renderGame();
  } else {
    renderPlayerHand();
  }
}

// ========================
// TOAST
// ========================
let toastTimeout = null;
function showToast(msg, duration = 2000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), duration);
}

// ========================
// WENT OUT NOTIFICATION
// ========================
function showWentOut(name) {
  const overlay = document.getElementById('went-out-overlay');
  const banner = document.getElementById('went-out-banner');
  banner.innerHTML = `${name}<br><span style="font-size:16px;opacity:0.7">went out! Last turns...</span>`;
  overlay.classList.add('show');
  setTimeout(() => overlay.classList.remove('show'), 2500);
}