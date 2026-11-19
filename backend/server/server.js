const express = require("express");
const app = express();
const cors = require('cors')
const loginRoute = require('./routes/userLogin')
const registerRoute = require('./routes/userSignUp')
const passwordResetRoute = require('./routes/passwordReset')
const deleteAccountRoute = require('./routes/deleteAccount')
const classroomsRoute = require('./routes/classrooms')
const quizzesRoute = require('./routes/quizzes')
const attemptsRoute = require('./routes/attempts')
const gradesRoute = require('./routes/grades')
const dbConnection = require('./config/db.config')
const { finishExpiredAttempts } = require('./utilities/finishAttempt')
const { mailMode } = require('./utilities/mailer')

// Load every model at startup so Mongoose creates its collection and indexes,
// even before a route uses it
require('./models/userModel')
require('./models/classroomModel')
require('./models/quizModel')
require('./models/attemptModel')

require('dotenv').config();
const SERVER_PORT = 8081

dbConnection()
app.use(cors({origin: '*'}))
app.use(express.json())
app.use('/user', loginRoute)
app.use('/user', registerRoute)
app.use('/user', passwordResetRoute)
app.use('/user', deleteAccountRoute)
app.use('/classrooms', classroomsRoute)
app.use('/classrooms/:classroomId/quizzes', quizzesRoute)
app.use('/classrooms/:classroomId/quizzes/:quizId/attempts', attemptsRoute)
app.use('/classrooms/:classroomId/grades', gradesRoute)

// Test-only one-click logins; set ENABLE_DEV_LOGIN=true in .env to turn them on. Never enable in production.
if (process.env.ENABLE_DEV_LOGIN === 'true') {
    app.use('/user', require('./routes/devLogin'))
    console.log('Test logins are ON (POST /user/dev-login). Do not use this setting in production.')
}

setInterval(() => {
    finishExpiredAttempts()
        .then((count) => { if (count) console.log(`Time ran out on ${count} quiz attempt${count === 1 ? '' : 's'}; submitted the saved answers.`) })
        .catch((err) => console.log(`Could not submit timed-out attempts: ${err.message}`))
}, 60 * 1000)

app.listen(SERVER_PORT, (req, res) => {
    console.log(`The backend service is running on port ${SERVER_PORT} and waiting for requests.`);
    const mailNote = { gmail: `from Gmail (${process.env.GMAIL_USER})`, smtp: `through ${process.env.SMTP_HOST}`, test: 'to the Ethereal test inbox (not delivered; set GMAIL_USER and GMAIL_APP_PASSWORD to send real email)' }
    console.log(`Password reset emails are sent ${mailNote[mailMode()]}.`)
})
