const io = require('socket.io')(server);

// Store peers by socket ID
let peers = {};

io.on('connection', socket => {
  console.log('A user connected: ' + socket.id);
  
  // Register the user with their socket ID
  peers[socket.id] = socket;

  // When a user wants to call another peer
  socket.on('call-user', () => {
    console.log(`Call request from ${socket.id}`);

    // Check if there's another peer to connect with
    let otherPeer = null;
    for (let id in peers) {
      if (id !== socket.id) {
        otherPeer = peers[id];
        break;
      }
    }

    if (otherPeer) {
      // Emit the incoming call event to the other peer
      otherPeer.emit('incoming-call', { from: socket.id });
    } else {
      // If no peer is available, emit 'no-peer'
      socket.emit('no-peer');
    }
  });

  // Handle call acceptance
  socket.on('call-accepted', ({ to }) => {
    peers[to].emit('start-webrtc', { from: socket.id });
  });

  // Handle call rejection
  socket.on('call-rejected', ({ to }) => {
    peers[to].emit('call-ended');
  });

  // Handle offer and answer events
  socket.on('offer', offer => {
    peers[offer.to].emit('offer', offer);
  });

  socket.on('answer', answer => {
    peers[answer.to].emit('answer', answer);
  });

  // Handle ICE candidates
  socket.on('ice-candidate', candidate => {
    peers[candidate.to].emit('ice-candidate', candidate);
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    delete peers[socket.id];
  });
});
