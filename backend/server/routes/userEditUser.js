const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const userModel = require('../models/userModel')
const { userValidation } = require('../models/userValidator');
const { generateAccessToken } = require('../utilities/generateToken');

router.post('/editUser', async (req, res) => {
    const { error } = userValidation(req.body);
    if (error) return res.status(400).send({ message: error.errors[0].message });

    const { userId, username, email, password } = req.body

    const existingUser = await userModel.findOne({ username })
    if (existingUser) {
        const existingUserId = JSON.stringify(existingUser._id).replace(/["]+/g, '')
        if (existingUserId !== userId) return res.status(409).send({ message: "Username is taken, pick another" })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    userModel.findByIdAndUpdate(userId, { username, email, password: hashedPassword }, function (err, updatedUser) {
        if (err) {
            console.log(err);
        } else {
            const accessToken = generateAccessToken(updatedUser._id, email, username)
            res.header('Authorization', accessToken).send({ accessToken })
        }
    });
})

module.exports = router;
