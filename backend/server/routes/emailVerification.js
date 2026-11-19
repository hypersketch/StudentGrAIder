const express = require("express");
const router = express.Router();
const z = require('zod')
const userModel = require('../models/userModel')
const { sendVerificationEmail, hashToken } = require('../utilities/emailVerification')
const { generateAccessToken } = require('../utilities/generateToken')

// Opened from the link emailed at signup. Marks the email as verified and logs the person in.
router.post('/verify-email', async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : ''
    if (!token) return res.status(400).send({ message: "This verification link is invalid or has expired" })

    try {
        const user = await userModel.findOne({ verifyTokenHash: hashToken(token), verifyTokenExpires: { $gt: new Date() } })
        if (!user) return res.status(400).send({ message: "This verification link is invalid or has expired. Ask for a new one." })

        user.emailVerified = true
        user.verifyTokenHash = undefined
        user.verifyTokenExpires = undefined
        await user.save()
        res.send({ message: "Your email is verified", accessToken: generateAccessToken(user._id, user.email, user.name, user.role) })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Sends the verification link again. Always answers the same way, so it can't be used to find out which emails have accounts.
router.post('/resend-verification', async (req, res) => {
    const parsed = z.object({ email: z.string().email('Please Input a valid email') }).safeParse(req.body)
    if (!parsed.success) return res.status(400).send({ message: parsed.error.errors[0].message })

    const sent = { message: "If that email has an account waiting to be verified, we've sent it a new link." }

    try {
        const user = await userModel.findOne({ email: parsed.data.email.toLowerCase() })
        if (!user || user.emailVerified !== false) return res.send(sent)

        const previewUrl = await sendVerificationEmail(user)
        if (previewUrl) {
            console.log(`Verification email for ${user.email}: ${previewUrl}`)
            return res.send({ ...sent, previewUrl })
        }
        res.send(sent)
    } catch (err) {
        console.log(`Could not send verification email: ${err.message}`)
        res.status(500).send({ message: "We couldn't send the email. Please try again later." })
    }
})

module.exports = router;
