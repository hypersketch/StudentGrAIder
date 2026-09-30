const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { userValidation } = require('../models/userValidator')
const userModel = require('../models/userModel')

router.post('/signup', async (req, res) => {
    const { error } = userValidation(req.body);
    if (error) return res.status(400).send({ message: error.errors[0].message });

    const { name, email, password, role } = req.body

    try {
        const existingUser = await userModel.findOne({ email: email.toLowerCase() })
        if (existingUser) return res.status(409).send({ message: "An account with that email already exists" })

        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        const newUser = new userModel({ name, email, password: hashedPassword, role })
        const savedUser = await newUser.save()
        res.send(savedUser)
    } catch (err) {
        res.status(400).send({ message: "Error trying to create new user" })
    }
})

module.exports = router;
