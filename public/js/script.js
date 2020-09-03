const socket = io('/')

var optionsDebug = {
  host: '/',
  port: 3001
}
var optionsProduction = {
  host: '/',
  path: '/peer',
  port: 443
}
var LOCAL_DEBUG = true
const myPeer = new Peer(undefined, LOCAL_DEBUG ? optionsDebug : optionsProduction)

const videoGrid = document.getElementById('video-grid')
const myVideo = document.createElement('video')
myVideo.className = 'localVideo';
myVideo.muted = true // mute local video

const peers = {}

// Access video/audio stream via browser
navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
}).then(stream => {
  myVideo.srcObject = stream
  myVideo.addEventListener('loadedmetadata', () => {
    myVideo.play()
  })
  document.getElementById('localVideoGrid').append(myVideo)

  // when someone tries to call us, answer the call by sending our stream
  myPeer.on('call', call => {
    call.answer(stream)
    const video = document.createElement('video')
    video.id = 'peerVideo';

    // load the video stream of the user trying to call us on our screen
    call.on('stream', userVideoStream => {
      addVideoStream(video, userVideoStream)
    })
  })

  // Connect to a new user when they join
  socket.on('user-connected', (userId, userName) => {
    connectToNewUser(userId, stream);
    appendMessage(`${userName} has connected`, 1, 1);
  })
})

// Remove peer object when the disconnect (via the socket)
socket.on('user-disconnected', (userId, userName) => {
  if (peers[userId]){
    peers[userId].close();
    appendMessage(`${userName} has disconected`, 1, 1)
  };
})

// When the peer connects to the peerJS server
myPeer.on('open', peerId => {
  if (USER_TYPE == 'doctor') {
    socket.emit('join-room', ROOM_ID, peerId, DOCTOR_NAME)
  } else if (USER_TYPE == 'patient') {
    socket.emit('join-room', ROOM_ID, peerId, PATIENT_NAME)
  }
})

// Connect another peer, display the video and add to the peers object
function connectToNewUser(userId, stream) {
  const call = myPeer.call(userId, stream)
  const video = document.createElement('video')
  call.on('stream', userVideoStream => {
    addVideoStream(video, userVideoStream)
  })

  call.on('close', () => {
    video.remove()
  })

  peers[userId] = call
}

// Attach a stream to a video element and show it on screen
function addVideoStream(video, stream) {
  video.srcObject = stream
  video.addEventListener('loadedmetadata', () => {
    video.play()
  })
  video.id="peerVideo"
  videoGrid.append(video)
}


/*********** CHAT ***************/

const messageContainer = document.getElementById('chat')
const messageForm = document.getElementById('send-container')
const messageInput = document.getElementById('message-input')

appendMessage('You connected', 0, 1)

socket.on('chat-message', data => {
  appendMessage(`${data.name} \n ${data.message}`, 1, 0)
})


messageForm.addEventListener('submit', e => {
  e.preventDefault()
  const message = messageInput.value
  if (message.split(" ").join("") !== ""){
    document.createElement('user')
    appendMessage(`You \n ${message}`, 0, 0)
    socket.emit('send-chat-message', message)
    messageInput.value = ''
  }
})

//second argument represents side of chat "left/right" and third represents box size
function appendMessage(message, side, size) {
  const messageElement = document.createElement('div')
  if(side === 0){
    messageElement.setAttribute("id", "user")
  } else {
    messageElement.setAttribute("id", "peer")
  }
  if(size === 1){
    messageElement.style.minHeight = "10px";
  }
  messageElement.innerText = message
  var dt = new Date();
  //messageElement.innerHTML += "<p><span id=\"datetime\" class=\"time-left\"></span></p>";
  //messageElement.append(dt.toLocaleTimeString());
  messageContainer.append(messageElement)
  messageContainer.scrollBy(0, 100); 
}

/************ BUTTONS ***************/

function mute() {
  const peerVideo = document.getElementById("peerVideo")
  if(peerVideo.muted){
    peerVideo.muted = false;
  } else {
    peerVideo.muted = true;
  }
}

function endCall() {
  ///////////////////////////////////
  //sending info when call ends code/
  ///////////////////////////////////
  history.go(-1)
}