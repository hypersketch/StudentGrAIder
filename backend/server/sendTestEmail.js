// Checks that password reset emails can be sent, without going through the website.
// Usage (from backend/server):  node sendTestEmail.js you@example.com
const { sendMail, verifyMail, mailMode } = require('./utilities/mailer')

const to = process.argv[2]
if (!to) {
    console.log('Usage: node sendTestEmail.js <email address to send to>')
    process.exit(1)
}

const modes = {
    brevo: 'Brevo (BREVO_API_KEY)',
    gmail: `Gmail (${process.env.GMAIL_USER})`,
    smtp: `SMTP server ${process.env.SMTP_HOST}`,
    test: 'the Ethereal test inbox (no BREVO_API_KEY or GMAIL_USER / GMAIL_APP_PASSWORD set, so nothing reaches a real inbox)',
}

const main = async () => {
    console.log(`Sending with ${modes[mailMode()]}`)
    await verifyMail()
    console.log('Logged in to the mail service.')
    const previewUrl = await sendMail({
        to,
        subject: 'Student GrAIder test email',
        text: 'If you can read this, Student GrAIder can send password reset emails.',
    })
    console.log(`Sent to ${to}.${previewUrl ? ` Read it here: ${previewUrl}` : ' Check that inbox (and its spam folder).'}`)
}

main().catch((err) => {
    console.log(`Could not send: ${err.message}`)
    if (mailMode() === 'gmail' && /535|Username and Password|BadCredentials/i.test(err.message)) {
        console.log('Gmail refused the login. GMAIL_APP_PASSWORD must be an app password (Google Account > Security > App passwords,')
        console.log('needs 2-Step Verification on), not your normal Gmail password.')
    }
    if (mailMode() === 'brevo' && /sender/i.test(err.message)) {
        console.log('Brevo refused the sender. Verify the MAIL_FROM address in Brevo (Senders, Domains & Dedicated IPs > Senders).')
    }
    process.exit(1)
})
