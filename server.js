const LOCAL_DEBUG = true

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
const { v4: uuidV4 } = require('uuid')
const admin = require('firebase-admin')

// Application and external package setup
app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(cookieParser())
app.use(csrfMiddleware)

// Setup Firebase API backend
const serviceAccount = require('./serviceAccountKey.json')
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://mediochat.firebaseio.com'
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

// Home
app.get('/', (req, res) => {
  res.render('home', { csrfToken: req.csrfToken() }) // pass in the CSRF token
})

// Patient joins a call after submitting the details form
app.post('/join-call', (req, res) => {
  const name = req.body.name;
  const surname = req.body.surname;
  const dob = req.body.dob; // comes in the format YYYY-MM-DD
  const code = req.body.code;

  console.log(name, surname, dob, code)

  // do validation and check if code is valid (appointment exists in firebase)
  res.redirect(`/${uuidV4()}`)
})


// Signup page
app.get('/signup', (req, res) => {
  res.render('signup', {})
})


// Login page
app.get('/login', (req, res) => {
  res.render('login', {})
})

// Login process via Firebase (also responsible for logging in after signup)
app.post('/login', (req, res) => {
  const idToken = req.body.idToken
  
  // 5 days cookie
  const expiresIn = 60 * 60 * 24 * 5 * 1000 // time must be in ms

  admin.auth().createSessionCookie(idToken, { expiresIn })
  .then(
    (sessionCookie) => {
    const options = { maxAge: expiresIn, httpOnly: true }
    res.cookie('session', sessionCookie, options)
    res.end(JSON.stringify({ status: 'success' }))
    console.log('success')
    },
    (error) => {
      console.log('error: ', error)
      res.status(401).send("Unauthorised request")
    }
  )
})

// Logout the user
app.get('/logout', (req, res) => {
  // if there was no session in the first place, redirect to /login
  if (!req.cookies.session) {
    res.redirect('/login')
    return
  }
  // otherwise, just clear the session cookie and redirect home
  res.clearCookie('session')
  res.redirect('/')
})


// Doctor call dashboard
app.get('/dashboard', (req, res) => {
  const sessionCookie = req.cookies.session || ''

  // check if logged in
  admin.auth().verifySessionCookie(sessionCookie, true)
  .then(() => {
    // If authorised, render the view
    res.render('dashboard', {})
  })
  .catch((error) => {
    res.redirect('/login')
  })
})

// Account and profile settings page
app.get('/account', (req, res) => {
  const sessionCookie = req.cookies.session || ''

  // check if logged in
  admin.auth().verifySessionCookie(sessionCookie, true)
  .then(() => {
    // If authorised, render the view
    res.render('account', {})
  })
  .catch((error) => {
    res.redirect('/login')
  })
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