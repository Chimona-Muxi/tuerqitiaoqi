import { applyAction, alivePieces, BOARD_SIZE, getLegalActions, pieceAt } from "./engine.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function opponent(playerId) {
  return playerId === 0 ? 1 : 0;
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function centerScore(piece) {
  const mid = (BOARD_SIZE - 1) / 2;
  return 8 - Math.abs(piece.row - mid) - Math.abs(piece.col - mid);
}

function advancement(piece) {
  if (piece.king) return 0;
  return piece.owner === 0 ? BOARD_SIZE - 1 - piece.row : piece.row;
}

function threatenedPieces(state, owner) {
  const enemy = opponent(owner);
  const threatened = new Set();
  for (const action of getLegalActions({ ...clone(state), current: enemy, chain: null, winner: null })) {
    if (action.type === "jump" && action.captured) threatened.add(action.captured.id);
  }
  return threatened;
}

export function evaluateState(state, aiPlayer = 1) {
  if (state.winner === aiPlayer) return 100000;
  if (state.winner === opponent(aiPlayer)) return -100000;

  const threatenedMine = threatenedPieces(state, aiPlayer);
  const threatenedTheirs = threatenedPieces(state, opponent(aiPlayer));
  let score = 0;

  for (const piece of state.pieces) {
    if (!piece.alive) continue;
    const sign = piece.owner === aiPlayer ? 1 : -1;
    score += sign * (piece.king ? 260 : 100);
    score += sign * centerScore(piece) * (piece.king ? 2 : 3);
    score += sign * advancement(piece) * 5;
    if (piece.row === 0 || piece.row === BOARD_SIZE - 1 || piece.col === 0 || piece.col === BOARD_SIZE - 1) score += sign * 5;
    if ((piece.owner === aiPlayer ? threatenedMine : threatenedTheirs).has(piece.id)) score -= sign * 34;
  }

  const aiActions = getLegalActions({ ...clone(state), current: aiPlayer, chain: null, winner: null });
  const humanActions = getLegalActions({ ...clone(state), current: opponent(aiPlayer), chain: null, winner: null });
  score += aiActions.length * 2.5;
  score -= humanActions.length * 2;

  return score;
}

function actionScore(state, action, aiPlayer) {
  const applied = applyAction(state, action);
  if (!applied.ok) return -Infinity;
  let score = evaluateState(applied.state, aiPlayer);
  if (action.type === "jump") score += 85 + action.captures * 35;
  const piece = applied.state.pieces.find((item) => item.id === action.pieceId);
  if (piece?.king && !pieceAt(state, piece.row, piece.col)) score += 24;
  return score;
}

function minimax(state, depth, aiPlayer, alpha = -Infinity, beta = Infinity) {
  const actions = getLegalActions(state);
  if (depth === 0 || state.winner !== null || !actions.length) return evaluateState(state, aiPlayer);

  const maximizing = state.current === aiPlayer;
  let best = maximizing ? -Infinity : Infinity;

  for (const action of actions) {
    const applied = applyAction(state, action);
    if (!applied.ok) continue;
    const value = minimax(applied.state, applied.state.current === state.current ? depth : depth - 1, aiPlayer, alpha, beta);

    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }

  return best;
}

export function chooseAiAction(state, difficulty = "steady", aiPlayer = 1) {
  const actions = getLegalActions(state);
  if (!actions.length) return null;

  const jumps = actions.filter((action) => action.type === "jump");
  if (difficulty === "easy") {
    if (jumps.length && Math.random() < 0.75) return randomItem(jumps);
    return randomItem(actions);
  }

  if (difficulty === "steady") {
    const ranked = actions
      .map((action) => ({ action, score: actionScore(state, action, aiPlayer) + Math.random() * 4 }))
      .sort((a, b) => b.score - a.score);
    return ranked[0].action;
  }

  const depth = alivePieces(state).length <= 10 ? 5 : 4;
  const ranked = actions
    .map((action) => {
      const applied = applyAction(state, action);
      const score = applied.ok
        ? minimax(applied.state, applied.state.current === state.current ? depth : depth - 1, aiPlayer)
        : -Infinity;
      return { action, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0].action;
}
