const express = require("express");
const app = express();
const cors = require('cors')
const loginRoute = require('./routes/userLogin')
const registerRoute = require('./routes/userSignUp')
const classroomsRoute = require('./routes/classrooms')
const quizzesRoute = require('./routes/quizzes')
const dbConnection = require('./config/db.config')

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
app.use('/classrooms', classroomsRoute)
app.use('/classrooms/:classroomId/quizzes', quizzesRoute)

// Test-only one-click logins; set ENABLE_DEV_LOGIN=true in .env to turn them on. Never enable in production.
if (process.env.ENABLE_DEV_LOGIN === 'true') {
    app.use('/user', require('./routes/devLogin'))
    console.log('Test logins are ON (POST /user/dev-login). Do not use this setting in production.')
}

app.listen(SERVER_PORT, (req, res) => {
    console.log(`The backend service is running on port ${SERVER_PORT} and waiting for requests.`);
})
