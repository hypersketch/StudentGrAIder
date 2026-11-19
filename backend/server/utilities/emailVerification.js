const crypto = require("crypto");
const { sendMail } = require('./mailer')

// How long the link emailed at signup works. An account still unverified after this is deleted.
const VERIFY_LINK_HOURS = 24

// Only a hash of the token is stored, so a leaked database can't be used to verify accounts
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

// Where the emailed link points; set FRONTEND_URL in .env once the site is hosted somewhere else
const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:8096'

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const verificationEmail = (user, link) => {
    const text = [
        `Hi ${user.name},`,
        '',
        `Thanks for signing up for Student GrAIder. Open the link below to confirm this is your email (${user.email}) and finish creating your account:`,
        '',
        link,
        '',
        `This link works for ${VERIFY_LINK_HOURS} hours. If you didn't sign up, you can ignore this email and the account will be removed.`,
    ].join('\n')

    const html = `
        <p>Hi ${escape(user.name)},</p>
        <p>Thanks for signing up for Student GrAIder. Click below to confirm this is your email (${escape(user.email)}) and finish creating your account:</p>
        <p><a href="${escape(link)}">Verify my email</a></p>
        <p>This link works for ${VERIFY_LINK_HOURS} hours. If you didn't sign up, you can ignore this email and the account will be removed.</p>`

    return { to: user.email, subject: 'Verify your Student GrAIder email', text, html }
}

// Gives an unverified user a fresh link (replacing any older one), saves it, and emails it.
// Returns the Ethereal preview link when using the test inbox, otherwise null.
const sendVerificationEmail = async (user) => {
    const token = crypto.randomBytes(32).toString('hex')
    user.emailVerified = false
    user.verifyTokenHash = hashToken(token)
    user.verifyTokenExpires = new Date(Date.now() + VERIFY_LINK_HOURS * 60 * 60 * 1000)
    await user.save()
    return sendMail(verificationEmail(user, `${frontendUrl()}/verify-email?token=${token}`))
}

module.exports = { sendVerificationEmail, hashToken, VERIFY_LINK_HOURS }
