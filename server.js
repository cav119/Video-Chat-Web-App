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

/////////////////

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

emailHTMLFuture = (dateString, doctorName, roomCode) => {
  return `<style>body{font-family: Arial, Helvetica, sans-serif;}</style> <h4>This email is confirmation that an appointment has been scheduled on Mediochat.</h4> <h3>Appointment details:</h3> <ul id="details"> <li>Date and Time: ${dateString}</li><li>Doctor: ${doctorName}</li><li><b>Access Code: ${roomCode}</b></li></ul> <h4>How to access the appointment</h4> <ol id="steps"> <li>Visit <a href="mediochat.herokuapp.com">mediochat.herokuapp.com</a> on your <b>computer's web browser</b></li><li>Enter the access code <b>${roomCode}</b> and click the 'Start Call' button</li><li>Fill in the form with your details and click the 'Call' button</li></ol> <br><p>Please do not reply to this email, as this is an automated email sent by Mediochat.</p><p>If you have any questions about your appointment, please directly contact your doctor directly.</p>`
}

emailHTMLNow = (doctorName, roomCode) => {
  return `<style>body{font-family: Arial, Helvetica, sans-serif;}</style> <h2>Your appointment is starting right now!</h2> <p style="font-size: large;">The access code for the appointment with ${doctorName} is <b>${roomCode}</b></p><h4>How to access the appointment</h4> <ol id="steps"> <li>Visit <a href="mediochat.herokuapp.com">mediochat.herokuapp.com</a> on your <b>computer's web browser</b></li><li>Enter the access code <b>${roomCode}</b> and click the 'Start Call' button</li><li>Fill in the form with your details and click the 'Call' button</li></ol> <br><p>Please do not reply to this email, as this is an automated email sent by Mediochat.</p>`
}

emailHTMLCancelled = (doctorName, dateString) => {
  return `<style>body{font-family: Arial, Helvetica, sans-serif;}</style> <h4>The appointment with ${doctorName} scheduled for ${dateString} has been cancelled.</h4> <p>If you think this was a mistake, please contact your doctor directly.</p><p>Please do not reply to this email, as this is an automated email sent by Mediochat.</p>`
}


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

////////////////////////////////

// Home
app.get('/', (req, res) => {
  res.render('home', { errorFlash: req.flash('error'), csrfToken: req.csrfToken() })
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
        req.flash('error', 'This call has already finished.')
        res.redirect('/')
        return
      }
    } else {
      req.flash('error', 'The code you entered is invalid.')
      res.redirect('/')
      return
    }
  } catch (error) {
    req.flash('error', 'An internal server error occurred: ' + error)
    res.redirect('/')
    return
  }

  // set a cookie such that a user cannot directly go to /room/code without joining through here
  const options = { maxAge: 60 * 60 * 1000, httpOnly: true }
  res.cookie('room', roomCodeHash(code), options)
  res.cookie('patientName', name + ' ' + surname, options)
  res.redirect(`/room/${code}`)
})

// Start an upcoming call from a doctor's dashboard
app.get('/start-call/:room', async(req, res) => {
  const roomCode = req.params.room

  admin.auth().verifySessionCookie(req.cookies.session || '', true)
  .then(async(userData) => {
    try {
      // Get the user account details from firebase
      const userRef = admin.firestore().collection('users').doc(`${userData.uid}`)
      const callQuery = admin.firestore().collection('rooms').doc(roomCode)
      const call = await callQuery.get()
      if (call.exists) {
        // check that the call hasn't finished and that the call creator is the logged in user
        if (call.data().finished || !call.data().doctorID.isEqual(userRef)) {
          req.flash('error', 'The call you tried to access has either finished or could not be found.')
          res.redirect('/dashboard')
          return
        }

        const options = { maxAge: 60 * 60 * 1000 , httpOnly: true }
        res.cookie('room', roomCodeHash(`${roomCode}`), options)
        res.redirect(`/room/${roomCode}`)

      } else {
        req.flash('error', 'The call you tried to access could not be found.')
        res.redirect('/dashboard')
        return
      }
    } catch (error) {
      res.status(500).send("Internal server error: Could not find the logged in user")
      return
    }
  })
  .catch((error) => {
    res.status(500).send("Internal server error: Could not find the logged in user")
    return
  })
})

// Enter a room, given its id
app.get('/room/:room', (req, res) => {
  if (roomCodeHash(req.params.room) == req.cookies.room) {
    const patientName = req.cookies.patientName
    const userType = patientName ? 'patient' : 'doctor'
    var doctorName = '' 

    // Get doctor data from session cookie
    admin.auth().verifySessionCookie(req.cookies.session || '', true)
    .then(async(userData) => {
      try {
        // Get the user account details from firebase
        const userRef = admin.firestore().collection('users').doc(`${userData.uid}`)
        const userDoc = await userRef.get()
        if (!userDoc.exists) {
          res.status(500).send("Internal server error: Could not find the logged in user")
          return
        }
        doctorName = 'Dr. ' + userDoc.data().name + ' ' + userDoc.data().surname
        res.render('room', { roomId: req.params.room, userType: userType, patientName: patientName, doctorName: doctorName })

      } catch (error) {
        res.status(500).send("Internal server error: Could not find the logged in user")
        return
      }
    })
    .catch((error) => {
      // if not doctor nor patient, redirect to home
      if (patientName === undefined) {
        res.redirect('/')
        return
      }
      res.render('room', { roomId: req.params.room, userType: userType, patientName: patientName, doctorName: doctorName })
    })
    
  } else {
    req.flash('error', 'Please complete the verification form on the home page.')
    res.redirect('/')
  }
})

// Helper hash function for room code verification for joining rooms
roomCodeHash = (roomCode) => {
  return crypto.createHash('md5').update(roomCode).digest('hex')
} 

// If could not send an email after creating the room, delete it
emailErrorCallback = async(roomCode) => {
  console.log("Deleting this: " + roomCode)
  try {
    const roomRef = admin.firestore().collection('rooms').doc(`${roomCode}`)
    await roomRef.delete()
    return true
  } catch (error) {
    return false
  }
}

// Creates a call for a doctor: generates code and room
app.post('/create-call', async(req, res) => {

  // Ensure that the request is from a logged in user and get their UID
  var doctorID = ''
  try {
    const result = await admin.auth().verifySessionCookie(req.cookies.session || '', true)
    doctorID = result.uid
  } catch (error) {
    res.status(401).send('Unauthorised request: user is not logged in')
    return
  }

  const roomCode = Math.floor(100000 + Math.random() * 900000) // both the 6-digit access code and ID
    
  const email = req.body.email
  // const mobile = req.body.mobile
  const startNow = req.body.startNow
  const dateStr = req.body.startDate
  const timeStr = req.body.startTime
  const tzOffset = parseInt(req.body.tzOffset)

  const actualDate = new Date(Date.parse(dateStr + "T" + timeStr))
  actualDate.setTime(LOCAL_DEBUG ? actualDate.getTime() : actualDate.getTime() + tzOffset)
  // Issue seems to be the remote server, needs to take in the client's timezone offset

  const startsAt = startNow == 'on' ? new Date(Date.now()) : actualDate
  if (startsAt < new Date(Date.now() + tzOffset)) {
    req.flash('error', 'Please select a date and time in the future.')
    res.redirect('/dashboard')
    return
  }

  if (email == '') {
    req.flash('error', 'Please provide the patient\'s email or mobile phone.')
    res.redirect('/dashboard')
    return
  }

  try {
    // create room in firebase
    const doctorRef = admin.firestore().collection('users').doc(doctorID)
    const newRoomRef = admin.firestore().collection('rooms').doc(`${roomCode}`)
    await newRoomRef.set({
      'doctorID': doctorRef,
      'finished': false,
      'startsAt': admin.firestore.Timestamp.fromDate(startsAt),
      'patientEmail': email,
    })

    // get the doctor name
    const userDoc = await doctorRef.get()
    if (!userDoc.exists) {
      res.status(500).send("Could not find the user")
      return
    }
    const doctorName = userDoc.data().name + " " + userDoc.data().surname

    const dateString = dateStr + " at " + timeStr
    transporter.sendMail({
      from: "Mediochat " + EMAIL,
      to: email,
      subject: startNow == 'on' ? "APPOINTMENT STARTING NOW" : "NEW APPOINTMENT SCHEDULED by " + doctorName,
      html: startNow == 'on' ? emailHTMLNow(doctorName, roomCode) : emailHTMLFuture(dateString, doctorName, roomCode)
    }, (err, info) => {
      if (err) {
        emailErrorCallback(roomCode)
        return
      }
    })

  } catch (error) {
    req.flash('error', 'Could not create the call due to an internal server error.')
    res.redirect('/dashboard')
    return
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

// Mark the call as ended when the 'end call' is pressed by the doctor
app.post('/end-call', async(req, res) => {
  const roomId = req.body.roomId
  if (roomCodeHash(roomId) == req.cookies.room) { 
    try {
      // set the room as finished
      const roomRef = admin.firestore().collection('rooms').doc(`${roomId}`)
      await roomRef.update({ finished: true })
    } catch (error) {
      console.log("ERROR: ", error)
      res.status(401).send()
      return
    }

    res.clearCookie('room')
    res.status(200).send()
    return
  }
  res.status(401).send()
})

// Signup page
app.get('/signup', (req, res) => {
  res.render('signup', {})
})

// Forgot password page
app.get('/forgot-password', (req, res) => {
  // should check if already logged in, else just redirect
  res.render('forgotPassword', {})
})

// Login page
app.get('/login', (req, res) => {
  // If logged in, redirect to dashboard.
  admin.auth().verifySessionCookie(req.cookies.session || '', true)
  .then(() => {
    res.redirect('/dashboard')
  })
  // Otherwise, render the login page
  .catch((error) => {
    res.render('login', {})
  })
})

// Login process via Firebase (also responsible for logging in after signup)
app.post('/login', (req, res) => {
  const idToken = req.body.idToken
  const isSignup = req.body.signup
  
  // 5 days cookie, in millisecond
  const expiresIn = 60 * 60 * 24 * 5 * 1000
  const options = { maxAge: expiresIn, httpOnly: true }

  admin.auth().createSessionCookie(idToken, { expiresIn })
  .then(
    async(sessionCookie) => {
      // get the user id from the idToken and create the user in firebase
      if (isSignup) {
        const name = req.body.name
        const surname = req.body.surname

        var userID = ''
        try {
          const result = await admin.auth().verifySessionCookie(sessionCookie, true)
          userID = result.uid // the user's id in firebase
        } catch (error) {
          res.status(401).send('Unauthorised request')
          return
        }

        // create the new user (empty name and surname for now)
        const newUserRef = admin.firestore().collection('users').doc(`${userID}`)
        await newUserRef.set({
          'name': name,
          'surname': surname,
        })
      }

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

  admin.auth().verifySessionCookie(req.cookies.session || '', true)
  .then(async(userData) => {
    
    const doctorRef = admin.firestore().collection('users').doc(userData.uid)
    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const myCalls = admin.firestore().collection('rooms').where('doctorID', '==', doctorRef)
      const upcomingCalls = await myCalls.where('startsAt', '>', admin.firestore.Timestamp.fromDate(yesterday)).get()

      const upcomingCallsList = []
      const todaysCallsList = []

      const today = new Date()
      upcomingCalls.forEach(call => {
        const callData = call.data()
        const roomData = {
          'roomCode': call.id,
          'startsAt': callData.startsAt.toDate()
        }
        // if today's date matches, add to today's list
        if (roomData.startsAt.toDateString() == today.toDateString()) {
          roomData['finished'] = callData.finished  // add finished field to today's calls list
          todaysCallsList.push(roomData)
        // if not finished and date is after today, then put in upcoming list
        } else if (!callData.finished && roomData.startsAt > today) {
          upcomingCallsList.push(roomData)
        }
        // ignore if it is finished and not today
      })

      res.render('dashboard', { csrfToken: req.csrfToken(), errorFlash: req.flash('error'), doctorID: userData.uid,
                                upcomingCalls: upcomingCallsList, todaysCalls: todaysCallsList })
    } catch (error) {
      console.log(error)
      res.status(500).send(error)
    }
    return
  })
  .catch((error) => {
    res.redirect('/login')
  })
})


// Post request to load call history from the dashboard (NOT FULLY PROTECTED)
app.post('/call-history', async(req, res) => {
  try {
    const doctorID = req.body.doctorID
    const doctorRef = admin.firestore().collection('users').doc(doctorID)
    const pastCalls = await admin.firestore().collection('rooms')
                    .where('doctorID', '==', doctorRef)
                    .where('finished', '==', true)
                    .orderBy('startsAt', 'desc')
                    .get()

    const pastCallsList = []
    pastCalls.forEach(call => {
      const callData = call.data()
      const roomData = {
        roomCode: call.id,
        startsAt: callData.startsAt.toDate()
      }
      pastCallsList.push(roomData)
    })
    res.json(pastCallsList)
    
  } catch (error) {
    res.status(401).send('Unauthorised access or error occurred')
  }
})


// Delete a call from the dashboard (NOT FULLY PROTECTED)
app.post('/delete-call', async(req, res) => {
  const roomId = req.body.roomID
  const doctorId = req.body.doctorID
  try {
    // CHECK THAT THE ROOM'S DOCTOR IS THE SAME AS THE DOCTOR_ID, AVAILABLE IN DASHBOARD!
    // same process as in /start-call/
    const roomRef = admin.firestore().collection('rooms').doc(`${roomId}`)
    // get the call date time
    const roomDoc = await roomRef.get()
    if (!roomDoc.exists) {
      res.status(500).send("Could not find the user")
      return
    }
    const dateString = roomDoc.data().startsAt.toDate().toDateString()
    const email = roomDoc.data().patientEmail
    // delete it
    await roomRef.delete()

    // get the doctor name
    const doctorRef = admin.firestore().collection('users').doc(`${doctorId}`)
    const userDoc = await doctorRef.get()
    if (!userDoc.exists) {
      res.status(500).send("Could not find the user")
      return
    }
    const doctorName = userDoc.data().name + " " + userDoc.data().surname

    // send email to the patient saying the appointment was cancelled
    transporter.sendMail({
      from: "Mediochat " + EMAIL,
      to: email,
      subject: "APPOINTMENT CANCELLED by " + doctorName,
      html: emailHTMLCancelled(doctorName, dateString)
    }, (err, info) => {})
    
  } catch (error) {
    console.log("ERROR (could not delete call): ", error)
    res.status(401).send()
    return
  }
  res.status(200).send()
})


// Account and profile settings page
app.get('/account', (req, res) => {
  // check if logged in
  const sessionCookie = req.cookies.session || ''
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