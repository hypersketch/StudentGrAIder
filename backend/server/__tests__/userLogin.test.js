const request = require('supertest');
const jwt = require('jsonwebtoken');
const { buildApp, connect, disconnect, clearDB } = require('./testSetup');

const app = buildApp();

beforeAll(async () => { await connect(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await clearDB(); });

const validUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123'
};

async function registerUser(overrides = {}) {
    return request(app).post('/user/signup').send({ ...validUser, ...overrides });
}

describe('POST /user/login', () => {
    test('logs in with valid credentials and returns accessToken', async () => {
        await registerUser();
        const res = await request(app).post('/user/login').send({
            username: validUser.username,
            password: validUser.password
        });
        expect(res.status).toBe(200);
        expect(res.body.accessToken).toBeDefined();
    });

    test('JWT payload does not contain password', async () => {
        await registerUser();
        const res = await request(app).post('/user/login').send({
            username: validUser.username,
            password: validUser.password
        });
        const decoded = jwt.decode(res.body.accessToken);
        expect(decoded.password).toBeUndefined();
        expect(decoded.username).toBe(validUser.username);
        expect(decoded.email).toBe(validUser.email);
    });

    test('rejects wrong password with 401', async () => {
        await registerUser();
        const res = await request(app).post('/user/login').send({
            username: validUser.username,
            password: 'wrongpassword'
        });
        expect(res.status).toBe(401);
    });

    test('rejects non-existent username with 401', async () => {
        const res = await request(app).post('/user/login').send({
            username: 'nobody1',
            password: 'password123'
        });
        expect(res.status).toBe(401);
    });

    test('rejects username shorter than 6 characters with 400', async () => {
        const res = await request(app).post('/user/login').send({
            username: 'abc',
            password: 'password123'
        });
        expect(res.status).toBe(400);
    });

    test('rejects password shorter than 8 characters with 400', async () => {
        const res = await request(app).post('/user/login').send({
            username: validUser.username,
            password: 'short'
        });
        expect(res.status).toBe(400);
    });

    test('register then login round-trip succeeds', async () => {
        const signupRes = await registerUser();
        expect(signupRes.status).toBe(200);

        const loginRes = await request(app).post('/user/login').send({
            username: validUser.username,
            password: validUser.password
        });
        expect(loginRes.status).toBe(200);
        expect(loginRes.body.accessToken).toBeDefined();
    });
});
