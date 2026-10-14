const request = require('supertest');
const bcrypt = require('bcrypt');
const { buildApp, connect, disconnect, clearDB } = require('./testSetup');
const userModel = require('../models/userModel');

// Capture emails instead of sending them
jest.mock('../utilities/mailer', () => ({ sendMail: jest.fn(async () => null) }));
const { sendMail } = require('../utilities/mailer');

const app = buildApp();

beforeAll(async () => { await connect(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => {
    await clearDB();
    sendMail.mockClear();
    await userModel.create({ name: 'Sam Student', email: 'sam@example.com', password: await bcrypt.hash('oldpassword', 10), role: 'student' });
});

const forgot = (email) => request(app).post('/user/forgot-password').send({ email });
const reset = (token, password) => request(app).post('/user/reset-password').send({ token, password });
const login = (password) => request(app).post('/user/login').send({ email: 'sam@example.com', password });
// The token is the end of the link in the last email sent
const emailedToken = () => sendMail.mock.calls.at(-1)[0].text.match(/reset-password\?token=([a-f0-9]+)/)[1];

describe('POST /user/forgot-password', () => {
    test('emails a reset link that starts with the test recovery line', async () => {
        const res = await forgot('SAM@example.com');
        expect(res.status).toBe(200);
        expect(sendMail).toHaveBeenCalledTimes(1);

        const email = sendMail.mock.calls[0][0];
        expect(email.to).toBe('sam@example.com');
        expect(email.text.split('\n')[0]).toBe('This is a test recovery from student GrAIder');
        expect(email.text).toMatch(/Enter your new password twice/);
        expect(email.html).toMatch(/This is a test recovery from student GrAIder/);

        // Only a hash of the token is stored
        const user = await userModel.findOne({ email: 'sam@example.com' });
        expect(user.resetTokenHash).toBeDefined();
        expect(user.resetTokenHash).not.toBe(emailedToken());
    });

    test('answers the same for an unknown email, without sending anything', async () => {
        const known = await forgot('sam@example.com');
        const unknown = await forgot('nobody@example.com');
        expect(unknown.status).toBe(200);
        expect(unknown.body.message).toBe(known.body.message);
        expect(sendMail).toHaveBeenCalledTimes(1);
    });

    test('rejects an invalid email with 400', async () => {
        expect((await forgot('not-an-email')).status).toBe(400);
    });

    test("says so when the email can't be sent", async () => {
        sendMail.mockRejectedValueOnce(new Error('SMTP down'));
        const res = await forgot('sam@example.com');
        expect(res.status).toBe(500);
        expect(res.body.message).toMatch(/couldn't send the email/);
    });
});

describe('POST /user/reset-password', () => {
    test('sets the new password, and the link only works once', async () => {
        await forgot('sam@example.com');
        const token = emailedToken();

        const res = await reset(token, 'newpassword');
        expect(res.status).toBe(200);
        expect((await login('newpassword')).status).toBe(200);
        expect((await login('oldpassword')).status).toBe(401);

        expect((await reset(token, 'anotherpassword')).status).toBe(400);
    });

    test('rejects expired links, wrong tokens, and short passwords', async () => {
        await forgot('sam@example.com');
        const token = emailedToken();

        expect((await reset(token, 'short')).status).toBe(400);
        expect((await reset('0'.repeat(64), 'newpassword')).status).toBe(400);

        await userModel.updateOne({ email: 'sam@example.com' }, { resetTokenExpires: new Date(Date.now() - 1000) });
        const expired = await reset(token, 'newpassword');
        expect(expired.status).toBe(400);
        expect(expired.body.message).toMatch(/expired/);
        expect((await login('oldpassword')).status).toBe(200);
    });

    test('a newer email replaces the older link', async () => {
        await forgot('sam@example.com');
        const first = emailedToken();
        await forgot('sam@example.com');
        expect((await reset(first, 'newpassword')).status).toBe(400);
        expect((await reset(emailedToken(), 'newpassword')).status).toBe(200);
    });
});
