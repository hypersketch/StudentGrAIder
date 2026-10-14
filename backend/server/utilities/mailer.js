const nodemailer = require('nodemailer')
const dotenv = require('dotenv');
dotenv.config();

// Real email when SMTP_HOST is set in .env (with SMTP_PORT, SMTP_USER, SMTP_PASS, and optionally MAIL_FROM).
// Otherwise a free Ethereal test inbox: nothing reaches a real address, and each email gets a preview link instead.
let transporter
const getTransporter = () => {
    if (!transporter) {
        transporter = process.env.SMTP_HOST
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

// Sends { to, subject, text, html }. Returns the Ethereal preview link when using the test inbox, otherwise null.
const sendMail = async (message) => {
    const info = await (await getTransporter()).sendMail({
        from: process.env.MAIL_FROM || 'Student GrAIder <no-reply@studentgraider.dev>',
        ...message,
    })
    return nodemailer.getTestMessageUrl(info) || null
}

module.exports = { sendMail }
