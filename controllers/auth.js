module.exports.set = function (app, admin) {

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
        async (sessionCookie) => {
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

}
