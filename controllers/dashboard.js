module.exports.set = function (app, admin, transporter, LOCAL_DEBUG) {

  // Start an upcoming call from a doctor's dashboard
  app.get('/start-call/:room', async (req, res) => {
    const roomCode = req.params.room

    admin.auth().verifySessionCookie(req.cookies.session || '', true)
      .then(async (userData) => {
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

            const options = { maxAge: 60 * 60 * 1000, httpOnly: true }
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

  // Creates a call for a doctor: generates code and room
  app.post('/create-call', async (req, res) => {

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
      req.flash('error', 'Could not create the call due to an internal server error')
      res.redirect('/dashboard')
      return
    }

    // if should start now, go to room, otherwise, back to dashboard
    if (startNow == 'on') {
      const options = { maxAge: 60 * 60 * 1000, httpOnly: true }
      res.cookie('room', roomCodeHash(`${roomCode}`), options)
      res.redirect(`/room/${roomCode}`)
    } else {
      res.redirect('dashboard')
    }
  })


  // Doctor call dashboard
  app.get('/dashboard', (req, res) => {

    admin.auth().verifySessionCookie(req.cookies.session || '', true)
      .then(async (userData) => {
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

          res.render('dashboard', {
            csrfToken: req.csrfToken(), errorFlash: req.flash('error'), doctorID: userData.uid,
            upcomingCalls: upcomingCallsList, todaysCalls: todaysCallsList
          })
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


  // Post request to load call history from the dashboard
  app.post('/call-history', async (req, res) => {
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


  // Delete a call from the dashboard
  app.post('/delete-call', async (req, res) => {
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
      }, (err, info) => { })

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
      .then(async (userData) => {
        try {
          // Get the user account details from firebase
          const userRef = admin.firestore().collection('users').doc(`${userData.uid}`)
          const userDoc = await userRef.get()
          if (!userDoc.exists) {
            res.status(500).send("Could not find the user")
            return
          }

          res.render('account', { email: userData.email, userDetails: userDoc.data(), csrfToken: req.csrfToken() })
        } catch (error) {
          res.status(500).send("Could not find the user")
        }
        return
      })
      .catch((error) => {
        res.redirect('/login')
      })
  })

}

// Some email related helper functions
emailHTMLFuture = (dateString, doctorName, roomCode) => {
  return `<style>body{font-family: Arial, Helvetica, sans-serif;}</style> <h4>This email is confirmation that an appointment has been scheduled on Mediochat.</h4> <h3>Appointment details:</h3> <ul id="details"> <li>Date and Time: ${dateString}</li><li>Doctor: ${doctorName}</li><li><b>Access Code: ${roomCode}</b></li></ul> <h4>How to access the appointment</h4> <ol id="steps"> <li>Visit <a href="mediochat.herokuapp.com">mediochat.herokuapp.com</a> on your <b>computer's web browser</b></li><li>Enter the access code <b>${roomCode}</b> and click the 'Start Call' button</li><li>Fill in the form with your details and click the 'Call' button</li></ol> <br><p>Please do not reply to this email, as this is an automated email sent by Mediochat.</p><p>If you have any questions about your appointment, please directly contact your doctor directly.</p>`
}

emailHTMLNow = (doctorName, roomCode) => {
  return `<style>body{font-family: Arial, Helvetica, sans-serif;}</style> <h2>Your appointment is starting right now!</h2> <p style="font-size: large;">The access code for the appointment with ${doctorName} is <b>${roomCode}</b></p><h4>How to access the appointment</h4> <ol id="steps"> <li>Visit <a href="mediochat.herokuapp.com">mediochat.herokuapp.com</a> on your <b>computer's web browser</b></li><li>Enter the access code <b>${roomCode}</b> and click the 'Start Call' button</li><li>Fill in the form with your details and click the 'Call' button</li></ol> <br><p>Please do not reply to this email, as this is an automated email sent by Mediochat.</p>`
}

emailHTMLCancelled = (doctorName, dateString) => {
  return `<style>body{font-family: Arial, Helvetica, sans-serif;}</style> <h4>The appointment with ${doctorName} scheduled for ${dateString} has been cancelled.</h4> <p>If you think this was a mistake, please contact your doctor directly.</p><p>Please do not reply to this email, as this is an automated email sent by Mediochat.</p>`
}

// If could not send an email after creating the room, delete it
emailErrorCallback = async (roomCode) => {
  console.log("Deleting this: " + roomCode)
  try {
    const roomRef = admin.firestore().collection('rooms').doc(`${roomCode}`)
    await roomRef.delete()
    return true
  } catch (error) {
    return false
  }
}
