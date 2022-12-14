'use strict';

// Look after different browser vendors' ways of calling the getUserMedia()
// API method:
// Opera --> getUserMedia
// Chrome --> webkitGetUserMedia
// Firefox --> mozGetUserMedia
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

// Clean-up function:
// collect garbage before unloading browser's window
window.onbeforeunload = function (e) {
  hangup();
}

// Data channel information
var m_sendChannel, receiveChannel;
var sendButton = document.getElementById("sendButton");
var sendTextarea = document.getElementById("dataChannelSend");
var receiveTextarea = document.getElementById("dataChannelReceive");

// HTML5 <video> elements
var m_localVideo = document.querySelector('#localVideo');
var m_remoteVideo = document.querySelector('#remoteVideo');

// Handler associated with Send button
sendButton.onclick = sendData;

// Flags...
var m_isChannelReady = false;
var m_isInitiator = false;//是否为会话发起者
var m_isStarted = false;

// WebRTC data structures
// Streams
var m_localStream;
var m_remoteStream;

// PeerConnection
var m_peerConnection;

// PeerConnection ICE protocol configuration (either Firefox or Chrome)
var pc_config = webrtcDetectedBrowser === 'firefox' ?
  { 'iceServers': [{ 'url': 'stun:23.21.150.121' }] } :// IP address
  { 'iceServers': [{ 'url': 'stun:stun.l.google.com:19302' }] };

var pc_constraints = {
  'optional': [
    { 'DtlsSrtpKeyAgreement': true }
  ]
};

var sdpConstraints = {};

// Let's get started: prompt user for input (room name)
var room = "yang";//prompt('Enter room name:');

// Connect to signaling server
var socket = io.connect("http://localhost:8181");

// Send 'Create or join' message to singnaling server
if (room !== '') {
  console.log('Create or join room', room);
  socket.emit('create or join', room);
}

// Set getUserMedia constraints
var constraints = { video: true, audio: false };
//adapter.js

// From this point on, execution proceeds based on asynchronous events...

// getUserMedia() handlers...
function handleUserMediaCall(stream) {
  m_localStream = stream;
  attachMediaStream(m_localVideo, stream);
  console.log('Adding local stream.');
  sendMessage('got user media');
}

function handleUserMediaError(error) {
  console.log('navigator.getUserMedia error: ', error);
}

// Server-mediated message exchanging...

// 1. Server-->Client...
// Handle 'created' message coming back from server:
// this peer is the initiator
socket.on('created', function (room) {
  console.log('Created room ' + room);
  m_isInitiator = true;

  // Call getUserMedia()
  //navigator.getUserMedia(constraints, handleUserMediaCall, handleUserMediaError);
  navigator.mediaDevices.getDisplayMedia({video: true}).then(handleUserMediaCall, handleUserMediaError);
  console.log('Getting user media with constraints', constraints);

  checkAndStart();
});

// Handle 'full' message coming back from server:
// this peer arrived too late :-(
socket.on('full', function (room) {
  console.log('Room ' + room + ' is full');
});

// Handle 'join' message coming back from server:
// another peer is joining the channel
socket.on('join', function (room) {
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  m_isChannelReady = true;
});

// Handle 'joined' message coming back from server:
// this is the second peer joining the channel
socket.on('joined', function (room) {
  console.log('This peer has joined room ' + room);
  m_isChannelReady = true;

  // Call getUserMedia()
  navigator.getUserMedia(constraints, handleUserMediaCall, handleUserMediaError);
  console.log('Getting user media with constraints', constraints);
});

// Server-sent log message...
socket.on('log', function (array) {
  console.log.apply(console, array);
});

// Receive message from the other peer via the signaling server
socket.on('broadcastmessage', function (message) {
  console.log('Received message:', message);
  if (message === 'got user media') {
    checkAndStart();
  }
  else if (message.type === 'offer') {
    if (!m_isInitiator && !m_isStarted) {
      checkAndStart();
    }
    m_peerConnection.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  }
  else if (message.type === 'answer' && m_isStarted) {
    m_peerConnection.setRemoteDescription(new RTCSessionDescription(message));
  }
  else if (message.type === 'candidate' && m_isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label, candidate: message.candidate
    });
    m_peerConnection.addIceCandidate(candidate);
  }
  else if (message === 'bye' && m_isStarted) {
    handleRemoteHangup();
  }
});

// 2. Client-->Server

// Send message to the other peer via the signaling server
function sendMessage(message) {
  console.log('Sending message: ', message);
  socket.emit('broadcastmessage', message);
}

// Channel negotiation trigger function
function checkAndStart() {
  if (!m_isStarted && typeof m_localStream != 'undefined' && m_isChannelReady) {
    createPeerConnection();
    m_isStarted = true;
    if (m_isInitiator) {
      doCall();
    }
  }
}

// PeerConnection management...
function createPeerConnection() {
  try {
    m_peerConnection = new RTCPeerConnection(pc_config, pc_constraints);
    m_peerConnection.addStream(m_localStream);
    m_peerConnection.onicecandidate = handleIceCandidate;
    console.log('Created RTCPeerConnnection with:\n' + ' config: \'' + JSON.stringify(pc_config) + '\'; \n' + ' constraints: \'' + JSON.stringify(pc_constraints) + '\'.');

  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;

  }

  m_peerConnection.onaddstream = handleRemoteStreamAdded;

  m_peerConnection.onremovestream = handleRemoteStreamRemoved;
  if (m_isInitiator) {
    try {

      // Create a reliable data channel
      m_sendChannel = m_peerConnection.createDataChannel("sendDataChannel", { reliable: true });
      trace('Created send data channel');
    } catch (e) {
      alert('Failed to create data channel. ');
      trace('createDataChannel() failed with exception: ' + e.message);
    }

    m_sendChannel.onopen = handleSendChannelStateChange;
    m_sendChannel.onmessage = handleMessage;
    m_sendChannel.onclose = handleSendChannelStateChange;
  } else {
    // Joiner
    m_peerConnection.ondatachannel = gotReceiveChannel;
  }
}

// Data channel management
function sendData() {
  var data = sendTextarea.value;
  if (m_isInitiator) {
    m_sendChannel.send(data);
  }
  else {
    receiveChannel.send(data);
  }
  trace('Sent data: ' + data);
}

// Handlers...
function gotReceiveChannel(event) {
  trace('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = handleMessage;
  receiveChannel.onopen = handleReceiveChannelStateChange;
  receiveChannel.onclose = handleReceiveChannelStateChange;
}

function handleMessage(event) {
  trace('Received message: ' + event.data);
  receiveTextarea.value += event.data + '\n';
}

function handleSendChannelStateChange() {
  var readyState = m_sendChannel.readyState;
  trace('Send channel state is: ' + readyState);

  // If channel ready, enable user's input
  if (readyState == "open") {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}

function handleReceiveChannelStateChange() {
  var readyState = receiveChannel.readyState;
  trace('Receive channel state is: ' + readyState);

  // If channel ready, enable user's input
  if (readyState == "open") {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}

// ICE candidates management
function handleIceCandidate(event) {
  console.log('handleIceCandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });

  } else {
    console.log('End of candidates.');
  }
}

// Create Offer
function doCall() {
  console.log('Creating Offer...');
  m_peerConnection.createOffer(setLocalAndSendMessage, onSignalingError, sdpConstraints);
}

// Signaling error handler
function onSignalingError(error) {
  console.log('Failed to create signaling message : ' + error.name);
}

// Create Answer
function doAnswer() {
  console.log('Sending answer to peer.');
  m_peerConnection.createAnswer(setLocalAndSendMessage, onSignalingError, sdpConstraints);
}

// Success handler for both createOffer()
// and createAnswer()
function setLocalAndSendMessage(sessionDescription) {
  m_peerConnection.setLocalDescription(sessionDescription);
  sendMessage(sessionDescription);
}

// Remote stream handlers...
function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  attachMediaStream(m_remoteVideo, event.stream);
  console.log('Remote stream attached!!.');
  m_remoteStream = event.stream;
  m_remoteVideo.play();
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

// Clean-up functions...
function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  m_isInitiator = false;
}

function stop() {
  m_isStarted = false;
  if (m_sendChannel) m_sendChannel.close();
  if (receiveChannel) receiveChannel.close();
  if (m_peerConnection) m_peerConnection.close();
  m_peerConnection = null;
  sendButton.disabled = true;
}