// Configuration
const socket = io();
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302'},
    ],
    iceCandidatePoolSize: 8,
    iceTransportPolicy: 'all'
};

// DOM elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const hangupButton = document.getElementById('hangupButton');
const statusDiv = document.getElementById('status');
const incomingCallNotification = document.getElementById('incomingCallNotification');
const acceptCallButton = document.getElementById('acceptCall');
const rejectCallButton = document.getElementById('rejectCall');

// Global variables
let localStream;
let peerConnection;
let isCaller = false;
let otherPeerActive = false;

// Logging functions
function addLog(message) {
    const logContent = document.getElementById('logContent');
    const logEntry = document.createElement('div');
    logEntry.textContent = message;
    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;
    
    // Keep only the last 20 logs
    if (logContent.children.length > 20) {
        logContent.removeChild(logContent.children[0]);
    }
}

function formatICECandidate(candidate) {
    if (!candidate) return "null";
        return `Protocol: ${candidate.protocol || 'unknown'}
    Type: ${candidate.type}
    Address: ${candidate.address || candidate.ip || 'unknown'}
    Port: ${candidate.port}
    Priority: ${candidate.priority}
    Candidate: ${candidate.candidate}`;
}

// Initialize the app
async function init() {
    try {
        // Request permissions only after user interaction
        startButton.addEventListener('click', async () => {
            if (!localStream) {
                try {
                    addLog("Requesting camera and microphone access...");
                    localStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: true
                    });
                    localVideo.srcObject = localStream;
                    addLog("Media access granted");
                    statusDiv.textContent = 'Ready to call';
                    
                    // Check if other peer is active
                    socket.emit('check-peer');
                    setupSocketListeners();
                    
                } catch (err) {
                    addLog(`Error getting media devices: ${err.name}: ${err.message}`);
                    statusDiv.textContent = `Error: ${err.message}`;
                    statusDiv.className = 'error';
                }
            }
            startCall();
        });
        
        // Set up button event listeners
        hangupButton.addEventListener('click', () => {
            addLog("User clicked hangup button");
            hangUp();
        });
        acceptCallButton.addEventListener('click', acceptCall);
        rejectCallButton.addEventListener('click', rejectCall);
        
        addLog("App initialized. Click Start Call to begin.");
    } catch (err) {
        addLog(`Initialization error: ${err}`);
        statusDiv.textContent = `Error: ${err.message}`;
        statusDiv.className = 'error';
    }
}

// Set up socket.io event listeners
function setupSocketListeners() {
    socket.on('peer-active', () => {
        otherPeerActive = true;
        addLog("Peer is available");
        statusDiv.textContent = 'Peer is available';
    });
    
    socket.on('no-peer', () => {
        otherPeerActive = false;
        addLog("No peer available");
        statusDiv.textContent = 'No peer available';
        statusDiv.className = 'error';
    });
    
    socket.on('offer', async (offer) => {
        if (peerConnection) {
            addLog("Already in a call, rejecting new offer");
            return;
        }
        
        incomingCallNotification.style.display = 'block';
        isCaller = false;
        addLog(`Received offer: ${offer.type}`);
        
        createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        addLog("Remote description set");
        statusDiv.textContent = 'Incoming call...';
    });
    
    socket.on('answer', async (answer) => {
        if (!peerConnection) return;
        addLog(`Received answer: ${answer.type}`);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        addLog("Remote description updated with answer");
        statusDiv.textContent = 'Call connected!';
        statusDiv.className = 'success';
    });
    
    socket.on('ice-candidate', async (candidate) => {
        if (!peerConnection) return;
        addLog(`Received remote ICE candidate: ${candidate.candidate}`);
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            addLog("Successfully added remote ICE candidate");
        } catch (err) {
            addLog(`Error adding ICE candidate: ${err}`);
        }
    });
    
    // In setupSocketListeners():
    socket.on('hangup', () => {
        addLog("Remote peer hung up");

        // Clean up connection
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        // Stop remote stream
        if (remoteVideo.srcObject) {
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
            remoteVideo.srcObject = null;
        }

        // Reset UI
        startButton.disabled = false;
        hangupButton.disabled = true;
        statusDiv.textContent = 'Remote peer ended the call';
        statusDiv.className = 'error';

        initMedia();
    });
}

// Create RTCPeerConnection
function createPeerConnection() {
    addLog("Creating new peer connection");
    peerConnection = new RTCPeerConnection(configuration);
  
   setInterval(async () => {
        if (peerConnection.iceConnectionState === 'connected') {
            const stats = await peerConnection.getStats();
            stats.forEach(report => {
                if (report.type === 'candidate-pair' && report.nominated) {
                    const localCandidate = stats.get(report.localCandidateId);
                    const remoteCandidate = stats.get(report.remoteCandidateId);
                    
                    addLog(`ACTIVE CONNECTION:
                    Local Candidate:  ${localCandidate.address}:${localCandidate.port} (${localCandidate.candidateType})
                    Remote Candidate: ${remoteCandidate.address}:${remoteCandidate.port} (${remoteCandidate.candidateType})
                    Protocol: ${localCandidate.protocol}
                    Packets Sent: ${report.packetsSent}
                    Round-Trip Time: ${report.currentRoundTripTime}s`);
                }
            });
        }
    }, 2000);
    
    // Add local stream to connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
        addLog(`Added local track: ${track.kind}`);
    });
    
    // ICE candidate handler
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          if (event.candidate.candidate.includes('typ srflx')) {
                const stunServer = getStunServerFromCandidate(event.candidate);
                addLog(`STUN-derived Server Reflexive Candidate:
                Server: ${stunServer}
                Public IP: ${event.candidate.address}
                Protocol: ${event.candidate.protocol}
                Priority: ${event.candidate.priority}`, 
                'color: #4caf50; font-weight: bold');
                socket.emit('ice-candidate', event.candidate);
          }
          else if (event.candidate.candidate.includes('typ relay')) {
              addLog(`TURN Relay Candidate via: ${event.candidate.address}:${event.candidate.port}`, 
                    'color: #2196F3; font-weight: bold');
              socket.emit('ice-candidate', event.candidate);
          }
          else{
            const candidateStr = `New local ICE candidate: ${event.candidate.candidate}`;
            addLog(candidateStr);
            addLog(formatICECandidate(event.candidate));
            socket.emit('ice-candidate', event.candidate);
          }
        } else {
            addLog("ICE gathering complete");
        }
    };
    
    // Remote stream handler
    peerConnection.ontrack = (event) => {
        addLog(`Received remote ${event.track.kind} track`);
        remoteVideo.srcObject = event.streams[0];
    };
    
    // ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        addLog(`ICE connection state changed to: ${state}`);
        statusDiv.textContent += `\nICE state: ${state}`;
        
        if (state === 'failed' || state === 'disconnected') {
            addLog("ICE connection failed, attempting restart...");
            peerConnection.restartIce();}
    };
    
    peerConnection.onicegatheringstatechange = () => {
        addLog(`ICE gathering state: ${peerConnection.iceGatheringState}`);
    };
    
    peerConnection.onsignalingstatechange = () => {
        addLog(`Signaling state: ${peerConnection.signalingState}`);
    };
    
    peerConnection.onnegotiationneeded = () => {
        addLog("Negotiation needed");
    };
    
    // For debugging
    window.peerConnection = peerConnection;
}

// Helper to identify STUN servers
function getStunServerFromCandidate(candidate) {
    // Parse candidate to find STUN server
    const match = candidate.candidate.match(/raddr (\S+) rport (\d+)/);
    return match ? `${match[1]}:${match[2]}` : 'unknown-stun-server';
}

// Start a call
async function startCall() {
    if (!otherPeerActive) {
        addLog("No peer available to call");
        statusDiv.textContent = 'No peer available to call';
        statusDiv.className = 'error';
        return;
    }
    
    isCaller = true;
    createPeerConnection();
    
    try {
        addLog("Creating offer...");
        const offer = await peerConnection.createOffer();
        addLog(`Created offer: ${offer.type}`);
        
        await peerConnection.setLocalDescription(offer);
        addLog("Local description set");
        
        socket.emit('offer', offer);
        addLog("Offer sent to remote peer");
        
        // Enable hangup button immediately for caller
        hangupButton.disabled = false;
        startButton.disabled = true;
        statusDiv.textContent = 'Calling...';
    } catch (err) {
        addLog(`Error starting call: ${err}`);
        hangUp();
        statusDiv.textContent = `Error: ${err.message}`;
        statusDiv.className = 'error';
    }
}

// Accept an incoming call
async function acceptCall() {
    incomingCallNotification.style.display = 'none';
    addLog("Accepting incoming call...");
    
    try {
        const answer = await peerConnection.createAnswer();
        addLog(`Created answer: ${answer.type}`);
        
        await peerConnection.setLocalDescription(answer);
        addLog("Local description set for answer");
        
        socket.emit('answer', answer);
        addLog("Answer sent to remote peer");
        
        // Enable hangup button for answerer too
        hangupButton.disabled = false;
        startButton.disabled = true;
        statusDiv.textContent = 'Call connected!';
        statusDiv.className = 'success';
    } catch (err) {
        addLog(`Error accepting call: ${err}`);
        hangUp();
        statusDiv.textContent = `Error: ${err.message}`;
        statusDiv.className = 'error';
    }
}

// Reject an incoming call
function rejectCall() {
    incomingCallNotification.style.display = 'none';
    addLog("Call rejected");
    if (peerConnection) {
        hangUp();
    }
    socket.emit('reject-call');
    statusDiv.textContent = 'Call rejected';
}

// Hangup the call:
function hangUp() {
    addLog("Hanging up call...");
  
    startButton.disabled = false;
    hangupButton.disabled = true;
    
    // Clean up local connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Stop all media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    
    // Reset UI
    startButton.disabled = false;
    hangupButton.disabled = true;
    incomingCallNotification.style.display = 'none';
    
    // Notify remote peer regardless of who initiated
    socket.emit('hangup');
    
  
    if (localStream || remoteVideo.srcObject) {
          socket.emit('hangup');
          addLog("System: Hangup signal sent");
    }
  
    // Reset state
    statusDiv.textContent = 'Call ended';
    statusDiv.className = '';
    isCaller = false;
    
    addLog("Call terminated");
    
    // Reinitialize media (optional)
    initMedia();
}

async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        addLog("Media reinitialized after hangup");
    } catch (err) {
        addLog(`Error reinitializing media: ${err}`);
    }
}

// Initialize the app when the page loads
window.addEventListener('load', init);