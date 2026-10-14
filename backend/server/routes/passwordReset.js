const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const userModel = require('../models/userModel')
const { forgotPasswordValidation, resetPasswordValidation } = require('../models/userValidator')
const { sendMail } = require('../utilities/mailer')

const RESET_LINK_MINUTES = 60
// Where the emailed link points; set FRONTEND_URL in .env once the site is hosted somewhere else
const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:8096'

// Only a hash of the token is stored, so a leaked database can't be used to reset passwords
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

const recoveryEmail = (user, link) => {
    const text = [
        'This is a test recovery from student GrAIder',
        '',
        `Hi ${user.name},`,
        '',
        `We received a request to reset the password for your Student GrAIder account (${user.email}).`,
        '',
        'To choose a new password:',
        '1. Open the link below (or copy it into your browser).',
        '2. Enter your new password twice.',
        '3. Log in with your new password.',
        '',
        link,
        '',
        `This link expires in ${RESET_LINK_MINUTES} minutes and can only be used once.`,
        '',
        "If you didn't ask to reset your password, you can ignore this email. Your password won't change.",
    ].join('\n')

    const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    const html = `
        <p><strong>This is a test recovery from student GrAIder</strong></p>
        <p>Hi ${escape(user.name)},</p>
        <p>We received a request to reset the password for your Student GrAIder account (${escape(user.email)}).</p>
        <p>To choose a new password:</p>
        <ol>
            <li>Open the link below (or copy it into your browser).</li>
            <li>Enter your new password twice.</li>
            <li>Log in with your new password.</li>
        </ol>
        <p><a href="${escape(link)}">Reset my password</a></p>
        <p>This link expires in ${RESET_LINK_MINUTES} minutes and can only be used once.</p>
        <p>If you didn't ask to reset your password, you can ignore this email. Your password won't change.</p>`

    return { to: user.email, subject: 'Reset your Student GrAIder password', text, html }
}

// Emails a reset link. Always answers the same way, so it can't be used to find out which emails have accounts.
router.post('/forgot-password', async (req, res) => {
    const { error } = forgotPasswordValidation(req.body);
    if (error) return res.status(400).send({ message: error.errors[0].message });

    const sent = { message: "If an account uses that email, we've sent it a link to reset the password." }

    try {
        const user = await userModel.findOne({ email: req.body.email.toLowerCase() })
        if (!user) return res.send(sent)

        const token = crypto.randomBytes(32).toString('hex')
        user.resetTokenHash = hashToken(token)
        user.resetTokenExpires = new Date(Date.now() + RESET_LINK_MINUTES * 60 * 1000)
        await user.save()

        const previewUrl = await sendMail(recoveryEmail(user, `${frontendUrl()}/reset-password?token=${token}`))
        // With the Ethereal test inbox there's no real email to open, so show where to read it
        if (previewUrl) {
            console.log(`Password reset email for ${user.email}: ${previewUrl}`)
            return res.send({ ...sent, previewUrl })
        }
        res.send(sent)
    } catch (err) {
        console.log(`Could not send password reset email: ${err.message}`)
        res.status(500).send({ message: "We couldn't send the email. Please try again later." })
    }
})

// Sets a new password from a reset link. The link works once, then stops.
router.post('/reset-password', async (req, res) => {
    const { error } = resetPasswordValidation(req.body);
    if (error) return res.status(400).send({ message: error.errors[0].message });

    try {
        const user = await userModel.findOne({
            resetTokenHash: hashToken(req.body.token),
            resetTokenExpires: { $gt: new Date() },
        })
        if (!user) return res.status(400).send({ message: "This reset link is invalid or has expired. Ask for a new one." })

        user.password = await bcrypt.hash(req.body.password, 10)
        user.resetTokenHash = undefined
        user.resetTokenExpires = undefined
        await user.save()
        res.send({ message: "Your password has been reset. You can log in now." })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

module.exports = router;
