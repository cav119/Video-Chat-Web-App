const socket = io('/')
const myPeer = new Peer(undefined, {
  host: '/',
  port: '3001'
})

const videoGrid = document.getElementById('video-grid')
const myVideo = document.createElement('video')
myVideo.muted = true // mute local video

const peers = {}

// Access video/audio stream via browser
navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
}).then(stream => {
  addVideoStream(myVideo, stream)

  // when someone tries to call us, answer the call by sending our stream
  myPeer.on('call', call => {
    call.answer(stream)
    const video = document.createElement('video')

    // load the video stream of the user trying to call us on our screen
    call.on('stream', userVideoStream => {
      addVideoStream(video, userVideoStream)
    })
  })

  // Connect to a new user when they join
  socket.on('user-connected', userId => {
    connectToNewUser(userId, stream)
  })
})

// Remove peer object when the disconnect (via the socket)
socket.on('user-disconnected', userId => {
  if (peers[userId]) peers[userId].close()
})

// When the peer connects to the peerJS server
myPeer.on('open', id => {
  socket.emit('join-room', ROOM_ID, id)
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
  videoGrid.append(video)
}