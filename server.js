const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join', room => {
    socket.join(room);
    socket.room = room;
  });

  socket.on('call-user', () => {
    socket.to(socket.room).emit('incoming-call', { from: socket.id });
  });

  socket.on('call-accepted', () => {
    socket.to(socket.room).emit('start-webrtc');
  });

  socket.on('offer', data => {
    socket.to(socket.room).emit('offer', data);
  });

  socket.on('answer', data => {
    socket.to(socket.room).emit('answer', data);
  });

  socket.on('ice-candidate', data => {
    socket.to(socket.room).emit('ice-candidate', data);
  });

  socket.on('disconnect', () => {
    socket.to(socket.room).emit('user-disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
