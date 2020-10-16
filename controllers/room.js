module.exports.set = function (app, admin, crypto) {

  // Enter a room, given its id
  app.get('/room/:room', (req, res) => {
    if (roomCodeHash(req.params.room) == req.cookies.room) {
      const patientName = req.cookies.patientName
      const userType = patientName ? 'patient' : 'doctor'
      var doctorName = ''

      // Get doctor data from session cookie
      admin.auth().verifySessionCookie(req.cookies.session || '', true)
        .then(async (userData) => {
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

  // Patient joins a call after submitting the details form
  app.post('/join-call', async (req, res) => {
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


  // Mark the call as ended when the 'end call' is pressed by the doctor
  app.post('/end-call', async (req, res) => {
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


  // Helper hash function for room code verification for joining rooms
  roomCodeHash = (roomCode) => {
    return crypto.createHash('md5').update(roomCode).digest('hex')
  }

}

