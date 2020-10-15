const LOCAL_DEBUG = false
const SECRET_KEY = process.env.SECRET || 'SECRET'
const EMAIL = process.env.EMAIL
const EMAIL_PASS = process.env.EMAIL_PASS

// Express app and Node server
const express = require('express')
const app = express()
const server = require('http').Server(app)

// Socket.io server
const io = require('socket.io')(server)

// PeerJS server
const { ExpressPeerServer } = require('peer')
const peerServer = ExpressPeerServer(server, {
  debug: LOCAL_DEBUG
})
if (!LOCAL_DEBUG) {
  app.use('/peer', peerServer) // peer server running on /peer path
}

// Other Node packages
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const csrfMiddleware = require('csurf')({ cookie: true })
const admin = require('firebase-admin')
const crypto = require('crypto')
const flash = require('connect-flash')
const session = require('express-session')
const nodemailer = require('nodemailer')

// Application and external package setup
app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(cookieParser(SECRET_KEY))
app.use(csrfMiddleware)

app.use(session({
  cookie: { maxAge: 60000 },
  saveUninitialized: true,
  resave: 'true',
  secret: SECRET_KEY
}))
app.use(flash())
app.use(express.static(__dirname));

// Setup Firebase API backend
const serviceAccount = require('./serviceAccountKey.json')
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://mediochat.firebaseio.com'
})

// Setup email
const transporter = nodemailer.createTransport({
  service: 'hotmail',
  auth: {
    user: EMAIL,
    pass: EMAIL_PASS
  }
})


// Middleware to force HTTPS connections
app.all('*', (req, res, next) => {
  if (!LOCAL_DEBUG) {
    if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
      return res.redirect('https://' + req.get('host') + req.url);
    }
  }
  next();  
})

// Middleware to set the CSRF token as a cookie
app.all('*', (req, res, next) => {
  res.cookie('XSRF-TOKEN', req.csrfToken())
  next()
})


/////////// ROUTES //////////

var indexRoutes = require('./controllers/index')
indexRoutes.set(app)

var authRoutes = require('./controllers/auth')
authRoutes.set(app, admin)

var dashboardRoutes = require('./controllers/dashboard')
dashboardRoutes.set(app, admin, transporter, LOCAL_DEBUG)

var roomRoutes = require('./controllers/room')
roomRoutes.set(app, admin, crypto)


///////// SOCKET SERVER /////////

const users = {}  // global object holding all users (should change later)

// Socket Server Events
io.on('connection', socket => {
  socket.on('join-room', (roomId, userId, userName) => {
    users[socket.id] = {
      userId: userId,
      userName: userName
    } // for the chat
    socket.join(roomId)
    socket.to(roomId).broadcast.emit('user-connected', userId, userName)

    // broadcast to the room that a user has disconnected
    socket.on('disconnect', () => {
      socket.to(roomId).broadcast.emit('user-disconnected', userId, userName)
      delete users[socket.id]
    })
  })
  socket.on('new-user', name => {
   users[socket.id] = name
 })
  // chat 
  socket.on('send-chat-message', message => {
    socket.broadcast.emit('chat-message', { message: message, name: users[socket.id].userName })
  })
})

server.listen(process.env.PORT || 3000)