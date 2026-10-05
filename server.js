
 
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Objeto para guardar el estado de todos los jugadores conectados
const players = {};

io.on('connection', (socket) => {
  console.log('Jugador conectado:', socket.id);

  // Crear un nuevo jugador con posición inicial
  players[socket.id] = {
    x: 100,
    y: 100,
    id: socket.id
  };

  // Enviar la lista de todos los jugadores al usuario que recién entra
  socket.emit('currentPlayers', players);

  // Avisar a los demás jugadores que alguien nuevo se conectó
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Manejar el movimiento del jugador
  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y;
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  // Manejar desconexión
  socket.on('disconnect', () => {
    console.log('Jugador desconectado:', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
