const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { userValidation } = require('../models/userValidator')
const userModel = require('../models/userModel')

router.post('/signup', async (req, res) => {
    const { error } = userValidation(req.body);
    if (error) return res.status(400).send({ message: error.errors[0].message });

    const { username, email, password } = req.body

    try {
        const existingUser = await userModel.findOne({ username })
        if (existingUser) return res.status(409).send({ message: "Username is taken, pick another" })

        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        const newUser = new userModel({ username, email, password: hashedPassword })
        const savedUser = await newUser.save()
        res.send(savedUser)
    } catch (err) {
        res.status(400).send({ message: "Error trying to create new user" })
    }
})

module.exports = router;
