module.exports.set = function (app) {
	// Home
	app.get('/', (req, res) => {
		res.render('home', { errorFlash: req.flash('error'), csrfToken: req.csrfToken() })
	})

	// About
	app.get('/about', (req, res) => {
		res.render('about', {})
	})
}