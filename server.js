JavaScript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const gameState = {
  players: {},
  crystals: [
    { id: 1, x: 200, y: 200, claimedBy: null },
    { id: 2, x: 1400, y: 200, claimedBy: null },
    { id: 3, x: 200, y: 1400, claimedBy: null },
    { id: 4, x: 1400, y: 1400, claimedBy: null }
  ],
  angels: [
    { x: 800, y: 700, speed: 2, state: 'patrol' },
    { x: 800, y: 900, speed: 2, state: 'patrol' }
  ],
  fusedAngel: null,
  gameStartTime: null,
  fused: false,
  exitOpen: false,
  exitPos: { x: 800, y: 800 },
  collapseTimer: 30,
  gameStatus: 'waiting'
};

const SPAWN_POINTS = [
  { x: 100, y: 100 },
  { x: 1500, y: 100 },
  { x: 100, y: 1500 },
  { x: 1500, y: 1500 }
];

const PLAYER_COLORS = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f'];

io.on('connection', (socket) => {
  const playerCount = Object.keys(gameState.players).length;

  if (playerCount >= 4) {
    socket.emit('roomFull');
    return;
  }

  const slot = playerCount;
  gameState.players[socket.id] = {
    id: socket.id,
    slot: slot,
    x: SPAWN_POINTS[slot].x,
    y: SPAWN_POINTS[slot].y,
    color: PLAYER_COLORS[slot],
    crystalId: slot + 1,
    hasCrystal: false,
    alive: true
  };

  io.emit('stateUpdate', gameState);

  if (Object.keys(gameState.players).length === 4 && gameState.gameStatus === 'waiting') {
    gameState.gameStatus = 'playing';
    gameState.gameStartTime = Date.now();
    io.emit('gameStart', gameState);
  }

  socket.on('playerMove', (data) => {
    const p = gameState.players[socket.id];
    if (p && p.alive) {
      p.x = data.x;
      p.y = data.y;
    }
  });

  socket.on('claimCrystal', (crystalId) => {
    const p = gameState.players[socket.id];
    const c = gameState.crystals.find(c => c.id === crystalId);
    if (p && c && p.crystalId === crystalId && !c.claimedBy) {
      c.claimedBy = socket.id;
      p.hasCrystal = true;
      gameState.angels.forEach(angel => {
        angel.speed += 1;
        angel.targetX = p.x;
        angel.targetY = p.y;
      });

      const allClaimed = gameState.crystals.every(c => c.claimedBy !== null);
      if (allClaimed) {
        gameState.exitOpen = true;
        gameState.exitPos = { x: Math.floor(Math.random() * 1200) + 200, y: Math.floor(Math.random() * 1200) + 200 };
      }
      io.emit('crystalClaimed', { crystalId, playerId: socket.id, exitOpen: gameState.exitOpen, exitPos: gameState.exitPos });
    }
  });

  socket.on('disconnect', () => {
    delete gameState.players[socket.id];
    io.emit('stateUpdate', gameState);
  });
});

setInterval(() => {
  if (gameState.gameStatus !== 'playing') return;

  const elapsedTime = (Date.now() - gameState.gameStartTime) / 1000;

  if (elapsedTime > 90 && !gameState.fused) {
    gameState.fused = true;
    gameState.fusedAngel = {
      x: (gameState.angels[0].x + gameState.angels[1].x) / 2,
      y: (gameState.angels[0].y + gameState.angels[1].y) / 2,
      speed: 4.5
    };
  }

  const targets = Object.values(gameState.players).filter(p => p.alive);
  if (targets.length > 0) {
    if (!gameState.fused) {
      gameState.angels.forEach((angel, idx) => {
        const closestPlayer = targets[idx % targets.length];
        const dx = closestPlayer.x - angel.x;
        const dy = closestPlayer.y - angel.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
          angel.x += (dx / dist) * angel.speed;
          angel.y += (dy / dist) * angel.speed;
        }

        if (dist < 20) {
          closestPlayer.alive = false;
        }
      });
    } else {
      let closest = targets[0];
      let minDist = Infinity;
      targets.forEach(p => {
        const d = Math.hypot(p.x - gameState.fusedAngel.x, p.y - gameState.fusedAngel.y);
        if (d < minDist) {
          minDist = d;
          closest = p;
        }
      });
      if (closest) {
        const dx = closest.x - gameState.fusedAngel.x;
        const dy = closest.y - gameState.fusedAngel.y;
        gameState.fusedAngel.x += (dx / minDist) * gameState.fusedAngel.speed;
        gameState.fusedAngel.y += (dy / minDist) * gameState.fusedAngel.speed;
        if (minDist < 25) closest.alive = false;
      }
    }
  }

  if (gameState.exitOpen) {
    gameState.collapseTimer -= 1 / 60;
    if (gameState.collapseTimer <= 0) {
      gameState.gameStatus = 'dead';
      io.emit('gameOver', { won: false, reason: 'El laberinto se colapsó por completo.' });
    }
  }

  if (gameState.exitOpen) {
    const alivePlayers = Object.values(gameState.players).filter(p => p.alive);
    const allAtExit = alivePlayers.every(p => Math.hypot(p.x - gameState.exitPos.x, p.y - gameState.exitPos.y) < 40);
    if (alivePlayers.length > 0 && allAtExit) {
      gameState.gameStatus = 'escaped';
      io.emit('gameOver', { won: true, reason: '¡Lograron escapar y fusionar las partes de Dios!' });
    }
  }

  io.emit('stateUpdate', gameState);
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en ejecución en puerto ${PORT}`));
