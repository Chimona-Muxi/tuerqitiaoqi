import {
  applyAction,
  cellName,
  createInitialState,
  getLegalActions,
  mustCapture,
  pieceAt,
  scoreSummary
} from "./engine.mjs";
import { chooseAiAction } from "./ai.mjs";

const els = {
  board: document.querySelector("#board"),
  modeCaption: document.querySelector("#modeCaption"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
  aiPanel: document.querySelector("#aiPanel"),
  localPanel: document.querySelector("#localPanel"),
  difficultySelect: document.querySelector("#difficultySelect"),
  newGameButton: document.querySelector("#newGameButton"),
  newLocalButton: document.querySelector("#newLocalButton"),
  playerCards: document.querySelector("#playerCards"),
  turnMeta: document.querySelector("#turnMeta"),
  statusTitle: document.querySelector("#statusTitle"),
  capturePill: document.querySelector("#capturePill"),
  maxPill: document.querySelector("#maxPill"),
  chainPill: document.querySelector("#chainPill"),
  metrics: document.querySelector("#metrics"),
  logList: document.querySelector("#logList"),
  toast: document.querySelector("#toast")
};

let mode = "ai";
let difficulty = "steady";
let game = createGame();
let selectedPieceId = "";
let aiThinking = false;
let toastTimer = 0;

function createGame() {
  return createInitialState({
    mode,
    names: mode === "ai" ? ["你", "AI"] : ["南方", "北方"]
  });
}

function isHumanTurn() {
  return mode === "local" || game.current === 0 || game.winner !== null;
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function setMode(nextMode) {
  if (mode === nextMode) return;
  mode = nextMode;
  selectedPieceId = "";
  game = createGame();
  render();
}

function newGame() {
  selectedPieceId = "";
  game = createGame();
  render();
}

function actionsForSelected() {
  if (!selectedPieceId) return [];
  return getLegalActions(game).filter((action) => action.pieceId === selectedPieceId);
}

function selectPiece(piece) {
  if (!piece || piece.owner !== game.current) return false;
  if (!isHumanTurn()) return false;
  const actions = getLegalActions(game).filter((action) => action.pieceId === piece.id);
  if (!actions.length) return false;
  selectedPieceId = piece.id;
  render();
  return true;
}

function applySelected(action) {
  const result = applyAction(game, action);
  if (!result.ok) {
    showToast(result.reason);
    return;
  }
  game = result.state;
  selectedPieceId = game.chain?.pieceId || "";
  render();
}

function onSquareClick(row, col) {
  if (!isHumanTurn()) {
    showToast("等 AI 走完");
    return;
  }
  if (game.winner !== null) return;

  const piece = pieceAt(game, row, col);
  if (piece?.owner === game.current && selectPiece(piece)) return;

  const action = actionsForSelected().find((candidate) => candidate.to.row === row && candidate.to.col === col);
  if (action) {
    applySelected(action);
    queueAiMove();
    return;
  }

  if (mustCapture(game)) showToast("这一手必须吃子");
}

function pieceClass(piece) {
  return piece.owner === 0 ? "south" : "north";
}

function renderBoard() {
  const actions = actionsForSelected();
  const targetMap = new Map(actions.map((action) => [`${action.to.row},${action.to.col}`, action]));
  els.board.innerHTML = "";

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const square = document.createElement("button");
      square.type = "button";
      square.className = `square ${(row + col) % 2 ? "cool" : "warm"}`;
      square.dataset.cell = cellName(row, col);
      square.setAttribute("aria-label", cellName(row, col));
      square.addEventListener("click", () => onSquareClick(row, col));

      const action = targetMap.get(`${row},${col}`);
      if (action) square.classList.add(action.type === "jump" ? "capture-target" : "target");

      const piece = pieceAt(game, row, col);
      if (piece) {
        const pieceEl = document.createElement("div");
        pieceEl.className = `piece ${pieceClass(piece)}${piece.king ? " king" : ""}`;
        pieceEl.textContent = piece.king ? "" : game.players[piece.owner].label;
        square.append(pieceEl);
        if (piece.id === selectedPieceId) square.classList.add("selected");
      }

      els.board.append(square);
    }
  }
}

function renderPlayers() {
  els.playerCards.innerHTML = game.players.map((player) => {
    const active = game.current === player.id && game.winner === null;
    const turnLabel = mode === "ai"
      ? (player.id === 0 ? "玩家" : "AI")
      : (player.id === 0 ? "先手" : "后手");
    return `
      <div class="player-card ${active ? "active" : ""}">
        <span class="player-dot" style="background:${player.color}"></span>
        <div>
          <strong>${player.name}</strong>
          <small>${player.label}方 · ${turnLabel}</small>
        </div>
        <span>${active ? "行动" : ""}</span>
      </div>
    `;
  }).join("");
}

function renderTopBar() {
  els.turnMeta.textContent = game.winner === null ? `第 ${game.turn} 手` : "终局";
  if (game.winner !== null) {
    els.statusTitle.textContent = `${game.players[game.winner].name} 获胜`;
  } else if (mode === "ai" && game.current === 1) {
    els.statusTitle.textContent = "AI 思考中";
  } else {
    els.statusTitle.textContent = `轮到 ${game.players[game.current].name}`;
  }

  const capture = mustCapture(game);
  els.capturePill.classList.toggle("active", capture);
  els.maxPill.classList.toggle("active", capture);
  els.chainPill.classList.toggle("active", Boolean(game.chain));
}

function renderMetrics() {
  els.metrics.innerHTML = scoreSummary(game).map((item) => `
    <div class="metric">
      <span>${item.name}</span>
      <strong>${item.pieces} / ${item.kings}</strong>
    </div>
  `).join("");
}

function renderLog() {
  els.logList.innerHTML = game.log.slice(0, 16).map((item) => `<div class="log-item">${item}</div>`).join("");
}

function renderPanels() {
  els.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  els.modeCaption.textContent = mode === "ai" ? "人机对弈" : "同屏对弈";
  els.aiPanel.classList.toggle("hidden", mode !== "ai");
  els.localPanel.classList.toggle("hidden", mode !== "local");
}

function render() {
  renderPanels();
  renderBoard();
  renderPlayers();
  renderTopBar();
  renderMetrics();
  renderLog();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queueAiMove() {
  if (aiThinking || mode !== "ai" || game.winner !== null || game.current !== 1) return;
  aiThinking = true;
  render();
  await delay(320);

  while (mode === "ai" && game.current === 1 && game.winner === null) {
    const action = chooseAiAction(game, difficulty, 1);
    if (!action) break;
    const result = applyAction(game, action);
    if (!result.ok) break;
    game = result.state;
    selectedPieceId = game.chain?.pieceId || "";
    render();
    if (game.current !== 1 || game.winner !== null) break;
    await delay(260);
  }

  selectedPieceId = "";
  aiThinking = false;
  render();
}

els.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

els.difficultySelect.addEventListener("change", () => {
  difficulty = els.difficultySelect.value;
});

els.newGameButton.addEventListener("click", newGame);
els.newLocalButton.addEventListener("click", newGame);

render();
