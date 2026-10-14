const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const userModel = require('../models/userModel')
const { generateAccessToken } = require('../utilities/generateToken')

// FOR TESTING ONLY. server.js mounts this router only when ENABLE_DEV_LOGIN=true.
// Logs in as a built-in test account for the given role, creating it the first time.
const TEST_ACCOUNTS = {
    professor: { name: 'Test Professor', email: 'test.professor@studentgraider.dev' },
    student: { name: 'Test Student', email: 'test.student@studentgraider.dev' },
}

router.post('/dev-login', async (req, res) => {
    const { role } = req.body
    const account = TEST_ACCOUNTS[role]
    if (!account) return res.status(400).send({ message: "Role must be professor or student" })

    try {
        let user = await userModel.findOne({ email: account.email })
        if (!user) {
            // Random password nobody knows, so the account can only be reached through this route
            const password = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10)
            user = await userModel.create({ ...account, password, role })
        }

        // The test student joins classes like anyone else: search, request, professor approves
        const accessToken = generateAccessToken(user._id, user.email, user.name, user.role)
        res.send({ accessToken })
    } catch (err) {
        if (err.code === 11000) return res.status(409).send({ message: `A real account is already using the name "${account.name}"` })
        res.status(500).send({ message: "Internal server error" })
    }
})

module.exports = router;
