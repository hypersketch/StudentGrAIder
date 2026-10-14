const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { userValidation } = require('../models/userValidator')
const userModel = require('../models/userModel')
const { NAME_COLLATION, normalizeName } = userModel

const EMAIL_TAKEN = "An account with that email already exists"
const NAME_TAKEN = "That name is already taken. Add a middle initial or last name to tell yourself apart."

router.post('/signup', async (req, res) => {
    const { error } = userValidation(req.body);
    if (error) return res.status(400).send({ message: error.errors[0].message });

    const { email, password, role } = req.body
    const name = normalizeName(req.body.name)

    try {
        const existingUser = await userModel.findOne({ email: email.toLowerCase() })
        if (existingUser) return res.status(409).send({ message: EMAIL_TAKEN })

        const existingName = await userModel.findOne({ name }).collation(NAME_COLLATION)
        if (existingName) return res.status(409).send({ message: NAME_TAKEN })

        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        const newUser = new userModel({ name, email, password: hashedPassword, role })
        const savedUser = await newUser.save()
        res.send(savedUser)
    } catch (err) {
        // Two signups for the same name or email at the same moment: the unique index catches the second one
        if (err.code === 11000) return res.status(409).send({ message: err.keyPattern?.name ? NAME_TAKEN : EMAIL_TAKEN })
        res.status(400).send({ message: "Error trying to create new user" })
    }
})

module.exports = router;
