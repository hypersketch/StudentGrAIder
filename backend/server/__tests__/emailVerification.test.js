// Signing up with an email you own: the account works only after the emailed link is opened
const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
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
    sendMail.mockReset();
    sendMail.mockImplementation(async () => null);
});

const sam = { name: 'Sam Student', email: 'sam@example.com', password: 'password123', role: 'student' };
const signup = (overrides = {}) => request(app).post('/user/signup').send({ ...sam, ...overrides });
const login = (password = sam.password) => request(app).post('/user/login').send({ email: sam.email, password });
const verify = (token) => request(app).post('/user/verify-email').send({ token });
const resend = (email = sam.email) => request(app).post('/user/resend-verification').send({ email });
// The token is the end of the link in the last email sent
const emailedToken = () => sendMail.mock.calls.at(-1)[0].text.match(/verify-email\?token=([a-f0-9]+)/)[1];

describe('signing up', () => {
    test('emails a verification link and saves only a hash of it', async () => {
        const res = await signup();
        expect(res.status).toBe(200);
        expect(res.body.verifyTokenHash).toBeUndefined();
        expect(sendMail).toHaveBeenCalledTimes(1);
        const email = sendMail.mock.calls[0][0];
        expect(email.to).toBe('sam@example.com');
        expect(email.text).toMatch(/http:\/\/localhost:8096\/verify-email\?token=[a-f0-9]{64}/);

        const user = await userModel.findOne({ email: sam.email });
        expect(user.emailVerified).toBe(false);
        expect(user.verifyTokenHash).not.toBe(emailedToken());
        expect(user.verifyTokenExpires.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
    });

    test('cannot log in before verifying (403 with unverified flag)', async () => {
        await signup();
        const res = await login();
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ unverified: true });
        expect(res.body.accessToken).toBeUndefined();
    });

    test('a wrong password still says incorrect, not unverified', async () => {
        await signup();
        const res = await login('wrongpassword');
        expect(res.status).toBe(401);
        expect(res.body.unverified).toBeUndefined();
    });

    test('if the email cannot be sent, no account is kept', async () => {
        sendMail.mockImplementation(async () => { throw new Error('mail down'); });
        const res = await signup();
        expect(res.status).toBe(500);
        expect(await userModel.countDocuments()).toBe(0);
    });

    test('signing up again with an unverified email replaces the old account and sends a new link', async () => {
        await signup({ name: 'Imposter' });
        const res = await signup();
        expect(res.status).toBe(200);
        const users = await userModel.find({ email: sam.email });
        expect(users).toHaveLength(1);
        expect(users[0].name).toBe('Sam Student');
        expect(sendMail).toHaveBeenCalledTimes(2);
    });

    test('a verified email still cannot be taken', async () => {
        await signup();
        await verify(emailedToken());
        expect((await signup({ name: 'Someone Else' })).status).toBe(409);
    });
});

describe('POST /user/verify-email', () => {
    test('verifies the email, logs the person in, and login works afterwards', async () => {
        await signup();
        const res = await verify(emailedToken());
        expect(res.status).toBe(200);
        expect(jwt.decode(res.body.accessToken)).toMatchObject({ email: sam.email, role: 'student' });

        const user = await userModel.findOne({ email: sam.email });
        expect(user.emailVerified).toBe(true);
        expect(user.verifyTokenHash).toBeUndefined();
        expect(user.verifyTokenExpires).toBeUndefined(); // so the cleanup never deletes it
        expect((await login()).status).toBe(200);
    });

    test('a link works only once', async () => {
        await signup();
        const token = emailedToken();
        expect((await verify(token)).status).toBe(200);
        expect((await verify(token)).status).toBe(400);
    });

    test('expired, wrong, or missing tokens are 400', async () => {
        await signup();
        const token = emailedToken();
        expect((await verify('not-a-real-token')).status).toBe(400);
        expect((await request(app).post('/user/verify-email').send({})).status).toBe(400);

        await userModel.updateOne({ email: sam.email }, { verifyTokenExpires: new Date(Date.now() - 1000) });
        expect((await verify(token)).status).toBe(400);
    });
});

describe('POST /user/resend-verification', () => {
    test('sends a new link and the old one stops working', async () => {
        await signup();
        const oldToken = emailedToken();
        const res = await resend('SAM@example.com');
        expect(res.status).toBe(200);
        expect(sendMail).toHaveBeenCalledTimes(2);
        expect((await verify(oldToken)).status).toBe(400);
        expect((await verify(emailedToken())).status).toBe(200);
    });

    test('same answer for unknown and already verified emails, and nothing is sent', async () => {
        await userModel.create({ name: 'Old User', email: 'old@example.com', password: await bcrypt.hash('password123', 4), role: 'student' });
        const unknown = await resend('nobody@example.com');
        const verified = await resend('old@example.com');
        expect(unknown.status).toBe(200);
        expect(verified.body).toEqual(unknown.body);
        expect(sendMail).not.toHaveBeenCalled();
    });

    test('invalid email is 400', async () => {
        expect((await resend('not-an-email')).status).toBe(400);
    });
});

describe('older accounts and password resets', () => {
    test('accounts made before verification existed still log in', async () => {
        await userModel.create({ ...sam, password: await bcrypt.hash(sam.password, 4) });
        expect((await login()).status).toBe(200);
    });

    test('resetting the password from an emailed link also verifies the email', async () => {
        await signup();
        await request(app).post('/user/forgot-password').send({ email: sam.email });
        const resetToken = sendMail.mock.calls.at(-1)[0].text.match(/reset-password\?token=([a-f0-9]+)/)[1];
        expect((await request(app).post('/user/reset-password').send({ token: resetToken, password: 'newpassword1' })).status).toBe(200);

        const user = await userModel.findOne({ email: sam.email });
        expect(user.emailVerified).toBe(true);
        expect(user.verifyTokenExpires).toBeUndefined();
        expect((await login('newpassword1')).status).toBe(200);
    });

    test('unverified accounts expire through a database cleanup index', async () => {
        await userModel.syncIndexes();
        const indexes = await userModel.collection.indexes();
        expect(indexes.find((i) => i.key.verifyTokenExpires)).toMatchObject({ expireAfterSeconds: 0 });
    });
});
