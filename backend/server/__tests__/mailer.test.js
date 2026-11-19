// Which mail service the mailer picks, and the Brevo request it sends. fetch is faked, so nothing is sent.
const { sendMail, verifyMail, mailMode } = require('../utilities/mailer');

const ok = (body = {}) => ({ ok: true, json: async () => body });

beforeEach(() => {
    global.fetch = jest.fn(async () => ok({ messageId: 'abc' }));
});

afterEach(() => {
    process.env.BREVO_API_KEY = '';
    process.env.GMAIL_USER = '';
    process.env.GMAIL_APP_PASSWORD = '';
    delete process.env.MAIL_FROM;
    delete global.fetch;
});

describe('mailMode', () => {
    test('Brevo beats Gmail, Gmail beats SMTP, and nothing set means the test inbox', () => {
        expect(mailMode()).toBe('test');
        process.env.GMAIL_USER = 'me@gmail.com';
        process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';
        expect(mailMode()).toBe('gmail');
        process.env.BREVO_API_KEY = 'key';
        expect(mailMode()).toBe('brevo');
    });
});

describe('sending with Brevo', () => {
    beforeEach(() => { process.env.BREVO_API_KEY = 'test-key'; });

    test('posts the email with the key and the MAIL_FROM sender', async () => {
        process.env.MAIL_FROM = 'Student GrAIder <me@gmail.com>';
        const result = await sendMail({ to: 'student@example.com', subject: 'Hi', text: 'Plain', html: '<p>Html</p>' });

        expect(result).toBeNull();
        const [url, options] = global.fetch.mock.calls[0];
        expect(url).toBe('https://api.brevo.com/v3/smtp/email');
        expect(options.method).toBe('POST');
        expect(options.headers['api-key']).toBe('test-key');
        expect(JSON.parse(options.body)).toEqual({
            sender: { name: 'Student GrAIder', email: 'me@gmail.com' },
            to: [{ email: 'student@example.com' }],
            subject: 'Hi',
            textContent: 'Plain',
            htmlContent: '<p>Html</p>',
        });
    });

    test('without MAIL_FROM the sender is GMAIL_USER', async () => {
        process.env.GMAIL_USER = 'me@gmail.com';
        await sendMail({ to: 'a@example.com', subject: 'Hi', text: 'Plain' });
        expect(JSON.parse(global.fetch.mock.calls[0][1].body).sender).toEqual({ name: 'Student GrAIder', email: 'me@gmail.com' });
    });

    test('a Brevo error is thrown with its message', async () => {
        global.fetch = jest.fn(async () => ({ ok: false, status: 400, statusText: 'Bad Request', json: async () => ({ message: 'sender not valid' }) }));
        await expect(sendMail({ to: 'a@example.com', subject: 'Hi', text: 'x' })).rejects.toThrow('Brevo answered 400: sender not valid');
    });

    test('verifyMail checks the key against the account endpoint', async () => {
        await verifyMail();
        expect(global.fetch.mock.calls[0][0]).toBe('https://api.brevo.com/v3/account');
    });
});
