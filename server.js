const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 3000 });

const boardSize = 15;
let board = Array.from({ length: boardSize }, () => Array(boardSize).fill(0));

let players = []; 
let currentPlayer = -1;
let rematchVotes = new Set();
let score = { player1: 0, player2: 0 };

function checkWin(x, y, color) {
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  for (let [dx, dy] of dirs) {
    let count = 1;
    for (let d = -1; d <= 1; d += 2) {
      let nx = x + dx * d;
      let ny = y + dy * d;
      while (board[ny] && board[ny][nx] === color) {
        count++;
        nx += dx * d;
        ny += dy * d;
      }
    }
    if (count >= 5) return true;
  }
  return false;
}

function broadcast(msg) {
  players.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  });
}

function resetBoardAndTurn() {
  board = Array.from({ length: boardSize }, () => Array(boardSize).fill(0));
  currentPlayer = -1;
  rematchVotes.clear();
}

function notifyPlayer(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

server.on('connection', (ws) => {
  if (players.length >= 2) {
    ws.send(JSON.stringify({ type: 'full' }));
    ws.close();
    return;
  }

  const playerIndex = players.length + 1; 
  const playerColor = playerIndex === 1 ? -1 : 1;

  ws.playerIndex = playerIndex;
  ws.playerColor = playerColor;
  players.push(ws);

  notifyPlayer(ws, {
    type: 'init',
    color: playerColor,
    playerIndex,
    score,
    playerCount: players.length
  });

  if (players.length === 2) {
    currentPlayer = -1;
    broadcast({ type: 'ready' });
    broadcast({ type: 'update', board });
  }

  ws.on('message', (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (msg.type === 'move' && board[msg.y][msg.x] === 0 && ws.playerColor === currentPlayer) {
      board[msg.y][msg.x] = currentPlayer;

      if (checkWin(msg.x, msg.y, currentPlayer)) {
        const winnerIndex = ws.playerIndex;
        if (winnerIndex === 1) score.player1++;
        else score.player2++;

        broadcast({ type: 'update', board, lastMove: { x: msg.x, y: msg.y } });
        broadcast({ type: 'win', winner: currentPlayer, score });
        currentPlayer = null;
      } else {
        currentPlayer *= -1;
        broadcast({ type: 'update', board, lastMove: { x: msg.x, y: msg.y } });
      }
    }

    if (msg.type === 'rematch') {
      rematchVotes.add(ws);
      const opponent = players.find(p => p !== ws);
      if (opponent) {
        notifyPlayer(opponent, { type: 'rematch-request' });
      }

      if (rematchVotes.size === 2) {
        players.forEach(p => {
          p.playerColor *= -1; // Farba sa prehadzuje
          notifyPlayer(p, {
            type: 'init',
            color: p.playerColor,
            playerIndex: p.playerIndex,
            score,
            playerCount: 2
          });
        });
        resetBoardAndTurn();
        currentPlayer = -1;
        broadcast({ type: 'ready' });
        broadcast({ type: 'update', board });
      }
    }
  });

  ws.on('close', () => {
    const index = players.indexOf(ws);
    players = players.filter(p => p !== ws);

    const remaining = players[0];
    if (remaining) {
      remaining.playerIndex = 1;
      remaining.playerColor = -1;
      score = { player1: 0, player2: 0 };

      notifyPlayer(remaining, {
        type: 'info',
        message: 'Druhý hráč sa odpojil.',
      });

      notifyPlayer(remaining, {
        type: 'init',
        color: -1,
        playerIndex: 1,
        score,
        playerCount: 1
      });
    }

    resetBoardAndTurn();
  });
});

console.log("WebSocket server beží na porte 3000");
