const DEBUG = true

// Express app and Node server
const express = require('express')
const app = express()
const server = require('http').Server(app)
// Socket.io server
const io = require('socket.io')(server)

// PeerJS server
const { ExpressPeerServer } = require('peer')
const peerServer = ExpressPeerServer(server, {
  debug: DEBUG
})
if (DEBUG) {
  app.use('/peer', peerServer) // peer server running on /peer path
}


const bodyParser = require('body-parser');
const { v4: uuidV4 } = require('uuid')

app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(bodyParser.urlencoded({ extended: true }));

// Home
app.get('/', (req, res) => {
  res.render('home', {})
})

// Patient joins a call after submitting the details form
app.post('/join-call', (req, res) => {
  const name = req.body.name;
  const surname = req.body.surname;
  const dob = req.body.dob; // comes in the format YYYY-MM-DD
  const code = req.body.code;

  // do validation and check if code is valid (appointment exists in firebase)
  res.redirect('/call')
})

// Start call
app.get('/call', (req, res) => {
  res.redirect(`/${uuidV4()}`)
})

// Enter a room, given its id
app.get('/:room', (req, res) => {
  res.render('room', { roomId: req.params.room })
})

io.on('connection', socket => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId)
    socket.to(roomId).broadcast.emit('user-connected', userId)

    // broadcast to the room that a user has disconnected
    socket.on('disconnect', () => {
      socket.to(roomId).broadcast.emit('user-disconnected', userId)
    })
  })
})

server.listen(process.env.PORT || 3000)