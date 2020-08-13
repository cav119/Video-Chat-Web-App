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
const { start } = require('repl')
const { assert } = require('console')
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
  // should be under the rooms collection, where code is the document ID
  // ie if code not found or the room is finished, then invalid

  res.redirect(`/room/${code}`)
})

// Enter a room, given its id
app.get('/room/:room', (req, res) => {
  res.render('room', { roomId: req.params.room })
})

// Creates a call for a doctor: generates code and room
app.post('/create-call', async(req, res) => {

  // Ensure that the request is from a logged in user and get their UID
  var doctorID = ''
  try {
    const result = await admin.auth().verifySessionCookie(req.cookies.session || '', true)
    doctorID = result.uid
  } catch (error) {
    res.status(401).send('Unauthorised request')
    return
  }

  const roomCode = Math.floor(100000 + Math.random() * 900000) // both the 6-digit access code and ID
    
  const email = req.body.email
  const mobile = req.body.mobile
  const startNow = req.body.startNow
  const startTime = req.body.startTime

  const startsAt = startNow == 'on' ? new Date(Date.now()) : new Date(startTime)
  if (startsAt < new Date(Date.now())) {
    res.status(401).send('Must select a date in the future')
    return
  }

  // create room in firebase
  try {
    const doctorRef = admin.firestore().collection('users').doc(doctorID) // do some validation maybe? not entirely necessary tbh
    const newRoomRef = admin.firestore().collection('rooms').doc(`${roomCode}`)
    await newRoomRef.set({
      'doctorID': doctorRef,
      'finished': false,
      'startsAt': admin.firestore.Timestamp.fromDate(startsAt)
    })
  } catch (error) {
    console.log("ERROR: ", error)
    return
  }
  
  if (email == '' || mobile == '') {
    console.log(`NOTE: PLEASE PROVIDE AT LEAST AN EMAIL OR A MOBILE NUMBER TO SEND THE CODE`)
  }

  // if should start now, go to room, otherwise, back to dashboard
  if (startNow == 'on') {
    res.redirect(`/room/${roomCode}`)
  } else {
    res.redirect('dashboard')
  }
})


// Signup page
app.get('/signup', (req, res) => {
  res.render('signup', {})
})


// Login page
app.get('/login', (req, res) => {
  // should check if already logged in, else just redirect
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
  .then((userData) => {
    // If authorised, render the view
    // const userID = userData.uid
    // get user information from firebase
    
    // get list of all rooms where the doctorID matches (for history and upcoming)

    res.render('dashboard', { csrfToken: req.csrfToken() })
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
  .then((userData) => {
    // If authorised, render the view
    const userID = userData.uid
    // use this to get user data from firebase
    res.render('account', {})
  })
  .catch((error) => {
    res.redirect('/login')
  })
})

// Socket Server Events
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