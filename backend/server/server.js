const express = require("express");
const app = express();
const cors = require('cors')
const loginRoute = require('./routes/userLogin')
const registerRoute = require('./routes/userSignUp')
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

app.listen(SERVER_PORT, (req, res) => {
    console.log(`The backend service is running on port ${SERVER_PORT} and waiting for requests.`);
})
