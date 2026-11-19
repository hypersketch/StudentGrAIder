const nodemailer = require('nodemailer')
const dotenv = require('dotenv');
dotenv.config();

// Where email goes, checked in this order:
//   1. Gmail: GMAIL_USER + GMAIL_APP_PASSWORD (an app password from your Google account, not your normal password)
//   2. Any SMTP server: SMTP_HOST (with SMTP_PORT, SMTP_USER, SMTP_PASS)
//   3. Otherwise a free Ethereal test inbox: nothing reaches a real address, and each email gets a preview link instead.
const gmailSettings = () => {
    const user = process.env.GMAIL_USER?.trim()
    // Google shows app passwords in groups of four ("abcd efgh ijkl mnop"); the spaces aren't part of it
    const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '')
    return user && pass ? { user, pass } : null
}

// Which kind of sending is set up: 'gmail', 'smtp', or 'test' (Ethereal)
const mailMode = () => (gmailSettings() ? 'gmail' : process.env.SMTP_HOST ? 'smtp' : 'test')

let transporter
const getTransporter = () => {
    if (!transporter) {
        const gmail = gmailSettings()
        transporter = gmail
            ? Promise.resolve(nodemailer.createTransport({ service: 'gmail', auth: gmail }))
            : process.env.SMTP_HOST
            ? Promise.resolve(nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: Number(process.env.SMTP_PORT) === 465,
                auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            }))
            : nodemailer.createTestAccount().then((account) => nodemailer.createTransport({
                host: account.smtp.host,
                port: account.smtp.port,
                secure: account.smtp.secure,
                auth: { user: account.user, pass: account.pass },
            }))
        // Try again next time if setting up failed (e.g. no internet)
        transporter.catch(() => { transporter = undefined })
    }
    return transporter
}

// Gmail sends from the signed-in address anyway, so default to it instead of a made-up one
const fromAddress = () => {
    if (process.env.MAIL_FROM) return process.env.MAIL_FROM
    const gmail = gmailSettings()
    return gmail ? `Student GrAIder <${gmail.user}>` : 'Student GrAIder <no-reply@studentgraider.dev>'
}

// Sends { to, subject, text, html }. Returns the Ethereal preview link when using the test inbox, otherwise null.
const sendMail = async (message) => {
    const info = await (await getTransporter()).sendMail({ from: fromAddress(), ...message })
    return nodemailer.getTestMessageUrl(info) || null
}

// Logs in to the mail server without sending anything; throws if the login is wrong
const verifyMail = async () => (await getTransporter()).verify()

module.exports = { sendMail, verifyMail, mailMode }
