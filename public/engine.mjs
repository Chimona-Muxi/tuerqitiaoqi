export const BOARD_SIZE = 8;

export const PLAYERS = [
  { id: 0, label: "南", name: "你", color: "#166a5c", direction: -1, kingRow: 0 },
  { id: 1, label: "北", name: "AI", color: "#c64d43", direction: 1, kingRow: 7 }
];

const ORTHO_DIRS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function cellName(row, col) {
  return `${String.fromCharCode(65 + col)}${BOARD_SIZE - row}`;
}

export function inBoard(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function createInitialState({ mode = "ai", names = ["你", "AI"] } = {}) {
  const pieces = [];
  let id = 1;

  for (let row = 1; row <= 2; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      pieces.push({ id: `n${id}`, owner: 1, row, col, king: false, alive: true });
      id += 1;
    }
  }

  for (let row = 5; row <= 6; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      pieces.push({ id: `s${id}`, owner: 0, row, col, king: false, alive: true });
      id += 1;
    }
  }

  return {
    boardSize: BOARD_SIZE,
    variant: "turkish",
    mode,
    turn: 1,
    current: 0,
    winner: null,
    chain: null,
    players: PLAYERS.map((player, index) => ({
      ...player,
      name: names[index] || player.name
    })),
    pieces,
    log: ["新局开始"]
  };
}

export function pieceAt(state, row, col) {
  return state.pieces.find((piece) => piece.alive && piece.row === row && piece.col === col) || null;
}

export function alivePieces(state, owner = null) {
  return state.pieces.filter((piece) => piece.alive && (owner === null || piece.owner === owner));
}

function manDirs(piece) {
  return [
    { dr: PLAYERS[piece.owner].direction, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 }
  ];
}

function actionId(type, piece, row, col, captured = null) {
  const base = `${type}:${piece.id}:${cellName(row, col)}`;
  return captured ? `${base}:${captured.id}` : base;
}

export function describeAction(action) {
  const from = cellName(action.from.row, action.from.col);
  const to = cellName(action.to.row, action.to.col);
  return action.type === "jump" ? `${from}x${to}` : `${from}-${to}`;
}

function buildMove(piece, row, col) {
  return {
    id: actionId("move", piece, row, col),
    type: "move",
    pieceId: piece.id,
    owner: piece.owner,
    from: { row: piece.row, col: piece.col },
    to: { row, col },
    captures: 0
  };
}

function buildJump(piece, row, col, captured) {
  return {
    id: actionId("jump", piece, row, col, captured),
    type: "jump",
    pieceId: piece.id,
    owner: piece.owner,
    from: { row: piece.row, col: piece.col },
    to: { row, col },
    captured: { id: captured.id, row: captured.row, col: captured.col },
    captures: 1
  };
}

function rawMovesForPiece(state, piece) {
  const result = [];
  if (piece.king) {
    for (const dir of ORTHO_DIRS) {
      let row = piece.row + dir.dr;
      let col = piece.col + dir.dc;
      while (inBoard(row, col) && !pieceAt(state, row, col)) {
        result.push(buildMove(piece, row, col));
        row += dir.dr;
        col += dir.dc;
      }
    }
    return result;
  }

  for (const dir of manDirs(piece)) {
    const row = piece.row + dir.dr;
    const col = piece.col + dir.dc;
    if (inBoard(row, col) && !pieceAt(state, row, col)) result.push(buildMove(piece, row, col));
  }
  return result;
}

function rawJumpsForPiece(state, piece) {
  const result = [];
  if (piece.king) {
    for (const dir of ORTHO_DIRS) {
      let row = piece.row + dir.dr;
      let col = piece.col + dir.dc;
      let captured = null;

      while (inBoard(row, col)) {
        const occupant = pieceAt(state, row, col);
        if (!captured && !occupant) {
          row += dir.dr;
          col += dir.dc;
          continue;
        }
        if (!captured && occupant?.owner === piece.owner) break;
        if (!captured && occupant?.owner !== piece.owner) {
          captured = occupant;
          row += dir.dr;
          col += dir.dc;
          continue;
        }
        if (captured && !occupant) {
          result.push(buildJump(piece, row, col, captured));
          row += dir.dr;
          col += dir.dc;
          continue;
        }
        break;
      }
    }
    return result;
  }

  for (const dir of manDirs(piece)) {
    const midRow = piece.row + dir.dr;
    const midCol = piece.col + dir.dc;
    const row = piece.row + dir.dr * 2;
    const col = piece.col + dir.dc * 2;
    const captured = pieceAt(state, midRow, midCol);
    if (
      inBoard(row, col)
      && captured
      && captured.owner !== piece.owner
      && !pieceAt(state, row, col)
    ) {
      result.push(buildJump(piece, row, col, captured));
    }
  }
  return result;
}

function crownIfNeeded(piece) {
  const player = PLAYERS[piece.owner];
  if (!piece.king && piece.row === player.kingRow) {
    piece.king = true;
    return true;
  }
  return false;
}

function simulateJump(state, action) {
  const next = clone(state);
  const piece = next.pieces.find((item) => item.alive && item.id === action.pieceId);
  const captured = next.pieces.find((item) => item.alive && item.id === action.captured.id);
  if (!piece || !captured) return { state: next, piece: null, becameKing: false };
  piece.row = action.to.row;
  piece.col = action.to.col;
  captured.alive = false;
  const becameKing = crownIfNeeded(piece);
  return { state: next, piece, becameKing };
}

function chainLength(state, action) {
  const { state: next, piece, becameKing } = simulateJump(state, action);
  if (!piece || becameKing) return 1;
  const more = rawJumpsForPiece(next, piece);
  if (!more.length) return 1;
  return 1 + Math.max(...more.map((candidate) => chainLength(next, candidate)));
}

function withMaxCaptureLengths(state, jumps) {
  if (!jumps.length) return [];
  const annotated = jumps.map((action) => ({
    ...action,
    captures: chainLength(state, action)
  }));
  const maxCaptures = Math.max(...annotated.map((action) => action.captures));
  return annotated.filter((action) => action.captures === maxCaptures);
}

export function getLegalActions(state) {
  if (state.winner !== null) return [];
  const playerId = state.current;

  if (state.chain?.pieceId) {
    const piece = state.pieces.find((item) => item.alive && item.id === state.chain.pieceId && item.owner === playerId);
    return piece ? withMaxCaptureLengths(state, rawJumpsForPiece(state, piece)) : [];
  }

  const pieces = alivePieces(state, playerId);
  const jumps = pieces.flatMap((piece) => rawJumpsForPiece(state, piece));
  if (jumps.length) return withMaxCaptureLengths(state, jumps);
  return pieces.flatMap((piece) => rawMovesForPiece(state, piece));
}

function actionMatches(action, input) {
  if (typeof input === "string") return action.id === input;
  return action.id === input.id
    || (
      action.type === input.type
      && action.pieceId === input.pieceId
      && action.to.row === input.to?.row
      && action.to.col === input.to?.col
    );
}

function opponent(playerId) {
  return playerId === 0 ? 1 : 0;
}

function finishTurn(state, movedPlayer) {
  const other = opponent(movedPlayer);
  state.chain = null;
  state.current = other;
  state.turn += 1;

  if (!alivePieces(state, other).length || !getLegalActions(state).length) {
    state.winner = movedPlayer;
    state.log.unshift(`${state.players[movedPlayer].name} 获胜`);
  }
}

export function applyAction(state, input) {
  const legal = getLegalActions(state);
  const action = legal.find((candidate) => actionMatches(candidate, input));
  if (!action) return { ok: false, reason: "这步不合法", state };

  const next = clone(state);
  const playerId = state.current;
  const piece = next.pieces.find((item) => item.alive && item.id === action.pieceId);
  if (!piece) return { ok: false, reason: "棋子不存在", state };

  const wasKing = piece.king;
  piece.row = action.to.row;
  piece.col = action.to.col;

  if (action.type === "jump") {
    const captured = next.pieces.find((item) => item.alive && item.id === action.captured.id);
    if (captured) captured.alive = false;
  }

  const becameKing = crownIfNeeded(piece);
  const label = describeAction(action);
  const suffix = becameKing ? "，升王" : "";
  next.log.unshift(`${next.players[playerId].name} ${action.type === "jump" ? "吃子" : "移动"} ${label}${suffix}`);

  if (action.type === "jump" && wasKing === piece.king) {
    const more = withMaxCaptureLengths(next, rawJumpsForPiece(next, piece));
    if (more.length) {
      next.chain = { player: playerId, pieceId: piece.id };
      next.current = playerId;
      next.updatedAt = Date.now();
      return { ok: true, action, state: next };
    }
  }

  finishTurn(next, playerId);
  next.updatedAt = Date.now();
  return { ok: true, action, state: next };
}

export function scoreSummary(state) {
  return state.players.map((player) => {
    const pieces = alivePieces(state, player.id);
    const kings = pieces.filter((piece) => piece.king).length;
    return {
      id: player.id,
      name: player.name,
      label: player.label,
      pieces: pieces.length,
      kings
    };
  });
}

export function mustCapture(state) {
  return getLegalActions(state).some((action) => action.type === "jump");
}
