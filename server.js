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
const crypto = require('crypto')

// Application and external package setup
app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(cookieParser())
app.use(csrfMiddleware)

// Setup Firebase API backend
const serviceAccount = require('./serviceAccountKey.json')
const { firestore } = require('firebase-admin')
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
app.post('/join-call', async(req, res) => {
  const name = req.body.name;
  const surname = req.body.surname;
  const dob = req.body.dob; // comes in the format YYYY-MM-DD
  const code = req.body.code;

  try {
    const callQuery = admin.firestore().collection('rooms').doc(code)
    const call = await callQuery.get()
    if (call.exists) {
      if (call.data().finished) {
        res.status(401).send('This call has already finished (flash to home)')
        return
      }
    } else {
      res.status(401).send('Invalid access code (need to flash a message to home page)')
      return
    }
  } catch (error) {
    res.status(500).send('Error occurred: ' + error)
    return
  }

  // set a cookie such that a user cannot directly go to /room/code without joining through here
  const options = { maxAge: 60 * 60 * 1000, httpOnly: true }
  res.cookie('room', roomCodeHash(code), options)
  res.redirect(`/room/${code}`)
})

// Enter a room, given its id
app.get('/room/:room', (req, res) => {
  if (roomCodeHash(req.params.room) == req.cookies.room) {
    res.render('room', { roomId: req.params.room })
  } else {
    res.status(401).send('Unauthorised access: flash to home page (tried to enter thru URL w/o verification on home page)')
  }
})

// Helper hash function for room code verification for joining rooms
roomCodeHash = (roomCode) => {
  return crypto.createHash('md5').update(roomCode).digest('hex')
} 

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
    const options = { maxAge: 60 * 60 * 1000 , httpOnly: true }
    res.cookie('room', roomCodeHash(`${roomCode}`), options)
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
  const isSignup = req.body.signup
  
  // 5 days cookie, in millisecond
  const expiresIn = 60 * 60 * 24 * 5 * 1000

  admin.auth().createSessionCookie(idToken, { expiresIn })
  .then(
    async(sessionCookie) => {
      // get the user id from the idToken and create the user in firebase
      if (isSignup) {
        var userID = ''
        try {
          const result = await admin.auth().verifySessionCookie(sessionCookie, true)
          userID = result.uid
        } catch (error) {
          res.status(401).send('Unauthorised request')
          return
        }

        // create the new user (empty name and surname for now)
        const newUserRef = admin.firestore().collection('users').doc(`${userID}`)
        await newUserRef.set({
          'name': 'Empty name',
          'surname': 'Empty surname',
        })
      }

      const options = { maxAge: expiresIn, httpOnly: true }
      res.cookie('session', sessionCookie, options)
      res.end(JSON.stringify({ status: 'success' }))
    },
    (error) => {
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
  .then(async(userData) => {
    // If authorised, render the view
    const doctorRef = admin.firestore().collection('users').doc(userData.uid)
    // get list of all rooms where the doctorID matches (for history and upcoming)
    try {
      const myCalls = admin.firestore().collection('rooms').where('doctorID', '==', doctorRef)
      const pastCalls = await myCalls.where('finished', '==', true).orderBy('startsAt').get()
      // const upcomingCalls = await myCalls.where('startsAt', '>', admin.firestore.Timestamp.fromDate(new Date(Date.now()))).get()

      const pastCallsList = []
      pastCalls.forEach(call => {
        const callData = call.data()
        const roomData = {
          roomCode: call.id,
          startsAt: callData.startsAt.toDate()
        }
        pastCallsList.push(roomData)
      })

      const upcomingCallsList = []
      // console.log("UPCOMING CALLS =============")
      // upcomingCalls.forEach(call => {
      //   console.log(call.id, '=>', call.data())
      // })

      res.render('dashboard', { csrfToken: req.csrfToken(), callHistory: pastCallsList, upcomingCalls: upcomingCallsList})
    } catch (error) {
      res.status(500).send(error)
    }
    return
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
  .then(async(userData) => {
    try {
      // Get the user account details from firebase
      const userRef = admin.firestore().collection('users').doc(`${userData.uid}`)
      const userDoc = await userRef.get()
      if (!userDoc.exists) {
        res.status(500).send("Could not find the user")
        return
      }
      res.render('account', {email: userData.email, userDetails: userDoc.data(), csrfToken: req.csrfToken()})
    } catch (error) {
      res.status(500).send("Could not find the user")
    }
    return
  })
  .catch((error) => {
    res.redirect('/login')
  })
})

/*
  NEED TO MAKE A POST VIEW TO UPDATE USER DETAILS, SHOULD ALSO PROBABLY REFACTOR THE ACCOUNT VIEW BY DIFFERENT PARTS,
  IE PASSWORD CHANGE IS DIFFERENT TO NAME CHANGE, ETC.
*/

const users = {}  // global object holding all users (should change later)

// Socket Server Events
io.on('connection', socket => {
  socket.on('join-room', (roomId, userId) => {
    users[socket.id] = userId // for the chat
    socket.join(roomId)
    socket.to(roomId).broadcast.emit('user-connected', userId)

    // broadcast to the room that a user has disconnected
    socket.on('disconnect', () => {
      socket.to(roomId).broadcast.emit('user-disconnected', userId)
    })
  })
  // socket.on('new-user', name => {
  //   users[socket.id] = name
  // })
  // chat 
  socket.on('send-chat-message', message => {
    socket.broadcast.emit('chat-message', { message: message, name: users[socket.id] })
  })
})

server.listen(process.env.PORT || 3000)