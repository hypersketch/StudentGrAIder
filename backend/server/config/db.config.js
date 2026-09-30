const mongoose = require('mongoose')
const dotenv = require('dotenv')
dotenv.config()

module.exports = () => {
    mongoose.connect(process.env.DB_URL)
        .then(() => console.log(`The backend has connected to the MongoDB database "${mongoose.connection.name}".`))
        .catch((error) => console.log(`${error} could not connect`))
}
