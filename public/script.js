const socket = io("https://wheat-candy-myrtle.glitch.me");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startCallBtn = document.getElementById("startCallBtn");
const statusText = document.getElementById("statusText");

let localStream;
let peerConnection;
let isCallActive = false;

const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    console.log("Media stream initialized.");
  } catch (err) {
    console.error("Error accessing media devices.", err);
    statusText.textContent = "Error accessing media devices. " + err.message;
  }
}

function setupPeerConnection() {
  peerConnection = new RTCPeerConnection(config);

  peerConnection.onicecandidate = event => {
    console.log("ICE Candidate:", event.candidate);
    if (event.candidate) {
      socket.emit("ice-candidate", { to: peerId, candidate: event.candidate });
    }
  };

  peerConnection.oniceconnectionstatechange = event => {
    console.log("ICE Connection State Change:", peerConnection.iceConnectionState);
    if (peerConnection.iceConnectionState === 'failed') {
      statusText.textContent = "Connection failed. Please try again.";
    }
  };

  peerConnection.ontrack = event => {
    console.log("Received remote stream.");
    remoteVideo.srcObject = event.streams[0];
  };

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });
  console.log("Peer connection setup completed.");
}

startCallBtn.addEventListener("click", () => {
  if (isCallActive) {
    // End the call
    socket.emit("end-call");
    startCallBtn.textContent = "Start Call";
    statusText.textContent = "Call Ended";
    isCallActive = false;
  } else {
    // Start the call
    socket.emit("call-user");
    startCallBtn.textContent = "Connecting...";
    statusText.textContent = "Awaiting peer response...";
    isCallActive = true;
  }
});

socket.on("start-webrtc", async ({ from }) => {
  console.log("Starting WebRTC connection...");
  await initMedia();
  setupPeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  console.log("Sending offer:", offer);
  socket.emit("offer", { to: from, offer });
});

socket.on("incoming-call", ({ from }) => {
  console.log(`Incoming call from ${from}`);
  const acceptCall = confirm("Incoming call. Accept?");
  if (acceptCall) {
    socket.emit("call-accepted", { to: from });
    startCallBtn.textContent = "End Call";
    statusText.textContent = "Call in progress...";
    isCallActive = true;
  } else {
    socket.emit("call-rejected", { to: from });
    statusText.textContent = "Call Rejected";
  }
});

socket.on("call-ended", () => {
  startCallBtn.textContent = "Start Call";
  statusText.textContent = "Call Ended";
  isCallActive = false;
});

socket.on("offer", async ({ offer, to }) => {
  console.log("Received offer:", offer);
  if (!peerConnection) setupPeerConnection();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  console.log("Sending answer:", answer);
  socket.emit("answer", { to, answer });
});

socket.on("answer", async ({ answer }) => {
  console.log("Received answer:", answer);
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice-candidate", async ({ candidate }) => {
  console.log("Received ICE candidate:", candidate);
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error("Failed to add ICE candidate:", err);
  }
});

socket.on("no-peer", () => {
  statusText.textContent = "No peer available. Waiting for connection...";
  startCallBtn.textContent = "Start Call";
  isCallActive = false;
});

initMedia();
