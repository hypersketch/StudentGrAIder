const nodemailer = require('nodemailer')
const dotenv = require('dotenv');
dotenv.config();

// Where email goes, checked in this order:
//   1. Brevo: BREVO_API_KEY, sent over HTTPS. Use this on hosts that block email ports, like Render's free plan.
//      The sender (MAIL_FROM, or GMAIL_USER) must be a sender you verified in Brevo.
//   2. Gmail: GMAIL_USER + GMAIL_APP_PASSWORD (an app password from your Google account, not your normal password)
//   3. Any SMTP server: SMTP_HOST (with SMTP_PORT, SMTP_USER, SMTP_PASS)
//   4. Otherwise a free Ethereal test inbox: nothing reaches a real address, and each email gets a preview link instead.
const gmailSettings = () => {
    const user = process.env.GMAIL_USER?.trim()
    // Google shows app passwords in groups of four ("abcd efgh ijkl mnop"); the spaces aren't part of it
    const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '')
    return user && pass ? { user, pass } : null
}

const brevoKey = () => process.env.BREVO_API_KEY?.trim()

// Which kind of sending is set up: 'brevo', 'gmail', 'smtp', or 'test' (Ethereal)
const mailMode = () => (brevoKey() ? 'brevo' : gmailSettings() ? 'gmail' : process.env.SMTP_HOST ? 'smtp' : 'test')

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

// Gmail sends from the signed-in address anyway, and Brevo only sends from a verified address,
// so default to GMAIL_USER instead of a made-up one
const fromAddress = () => {
    if (process.env.MAIL_FROM) return process.env.MAIL_FROM
    const gmailUser = process.env.GMAIL_USER?.trim()
    return gmailUser ? `Student GrAIder <${gmailUser}>` : 'Student GrAIder <no-reply@studentgraider.dev>'
}

// "Student GrAIder <me@gmail.com>" -> { name: 'Student GrAIder', email: 'me@gmail.com' }
const parseAddress = (address) => {
    const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(address)
    return match ? { name: match[1] || undefined, email: match[2] } : { email: address.trim() }
}

const BREVO_API = 'https://api.brevo.com/v3'

const brevoRequest = async (path, options = {}) => {
    const res = await fetch(`${BREVO_API}${path}`, {
        ...options,
        headers: { 'api-key': brevoKey(), 'content-type': 'application/json', accept: 'application/json' },
    })
    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(`Brevo answered ${res.status}: ${body.message || res.statusText}`)
    }
    return res.json()
}

const sendWithBrevo = async ({ to, subject, text, html }) => {
    await brevoRequest('/smtp/email', {
        method: 'POST',
        body: JSON.stringify({
            sender: parseAddress(fromAddress()),
            to: [{ email: to }],
            subject,
            textContent: text,
            ...(html && { htmlContent: html }),
        }),
    })
}

// Sends { to, subject, text, html }. Returns the Ethereal preview link when using the test inbox, otherwise null.
const sendMail = async (message) => {
    if (mailMode() === 'brevo') {
        await sendWithBrevo(message)
        return null
    }
    const info = await (await getTransporter()).sendMail({ from: fromAddress(), ...message })
    return nodemailer.getTestMessageUrl(info) || null
}

// Logs in to the mail service without sending anything; throws if the login is wrong
const verifyMail = async () => {
    if (mailMode() === 'brevo') return brevoRequest('/account')
    return (await getTransporter()).verify()
}

module.exports = { sendMail, verifyMail, mailMode }
