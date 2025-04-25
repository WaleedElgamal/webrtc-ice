const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));


const server = http.createServer(app);
const io = socketIo(server);

let activePeers = new Set();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    activePeers.add(socket.id);
    
    // Notify other peers about new connection
    socket.broadcast.emit('peer-active');
    
    socket.on('check-peer', () => {
        if (activePeers.size > 1) {
            socket.emit('peer-active');
            console.log(`${socket.id}: Peer available`);
        } else {
            socket.emit('no-peer');
            console.log(`${socket.id}: No peer available`);
        }
    });
    
    socket.on('offer', (offer) => {
        console.log(`Offer received from ${socket.id}`);
        socket.broadcast.emit('offer', offer);
    });
    
    socket.on('answer', (answer) => {
        console.log(`Answer received from ${socket.id}`);
        socket.broadcast.emit('answer', answer);
    });
    
    socket.on('ice-candidate', (candidate) => {
        console.log(`ICE candidate from ${socket.id}: ${candidate.candidate}`);
        socket.broadcast.emit('ice-candidate', candidate);
    });
    
   socket.on('hangup', () => {
    console.log(`${socket.id} hung up`);
    socket.broadcast.emit('hangup');  // Make sure this is broadcast to all
});
    
    socket.on('reject-call', () => {
        console.log(`${socket.id} rejected call`);
        socket.broadcast.emit('call-rejected');
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        activePeers.delete(socket.id);
        
        if (activePeers.size > 0) {
            io.emit('peer-active');
        } else {
            io.emit('no-peer');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});