const express = require("express");
const router = express.Router();
const { userLoginValidation } = require('../models/userValidator')
const userModel = require('../models/userModel')
const bcrypt = require('bcrypt')
const { generateAccessToken } = require('../utilities/generateToken')

router.post('/login', async (req, res) => {
    const { error } = userLoginValidation(req.body);
    if (error) return res.status(400).send({ message: error.errors[0].message });

    const { username, password } = req.body

    try {
        const user = await userModel.findOne({ username })
        if (!user) return res.status(401).send({ message: "Username or password is incorrect" })

        const isPasswordValid = await bcrypt.compare(password, user.password)
        if (!isPasswordValid) return res.status(401).send({ message: "Username or password is incorrect" })

        const accessToken = generateAccessToken(user._id, user.email, user.username)
        res.header('Authorization', accessToken).send({ accessToken })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

module.exports = router;
