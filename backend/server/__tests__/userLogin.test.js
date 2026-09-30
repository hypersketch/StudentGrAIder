const request = require('supertest');
const jwt = require('jsonwebtoken');
const { buildApp, connect, disconnect, clearDB } = require('./testSetup');

const app = buildApp();

beforeAll(async () => { await connect(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await clearDB(); });

const validUser = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: 'student'
};

async function registerUser(overrides = {}) {
    return request(app).post('/user/signup').send({ ...validUser, ...overrides });
}

describe('POST /user/login', () => {
    test('logs in with valid credentials and returns accessToken', async () => {
        await registerUser();
        const res = await request(app).post('/user/login').send({
            email: validUser.email,
            password: validUser.password
        });
        expect(res.status).toBe(200);
        expect(res.body.accessToken).toBeDefined();
    });

    test('JWT payload has id, name, email, role and no password', async () => {
        await registerUser();
        const res = await request(app).post('/user/login').send({
            email: validUser.email,
            password: validUser.password
        });
        const decoded = jwt.decode(res.body.accessToken);
        expect(decoded.password).toBeUndefined();
        expect(decoded.id).toBeDefined();
        expect(decoded.name).toBe(validUser.name);
        expect(decoded.email).toBe(validUser.email);
        expect(decoded.role).toBe(validUser.role);
    });

    test('email is case-insensitive', async () => {
        await registerUser();
        const res = await request(app).post('/user/login').send({
            email: 'TEST@example.com',
            password: validUser.password
        });
        expect(res.status).toBe(200);
    });

    test('rejects wrong password with 401', async () => {
        await registerUser();
        const res = await request(app).post('/user/login').send({
            email: validUser.email,
            password: 'wrongpassword'
        });
        expect(res.status).toBe(401);
    });

    test('rejects non-existent email with 401', async () => {
        const res = await request(app).post('/user/login').send({
            email: 'nobody@example.com',
            password: 'password123'
        });
        expect(res.status).toBe(401);
    });

    test('rejects invalid email format with 400', async () => {
        const res = await request(app).post('/user/login').send({
            email: 'not-an-email',
            password: 'password123'
        });
        expect(res.status).toBe(400);
    });

    test('rejects password shorter than 8 characters with 400', async () => {
        const res = await request(app).post('/user/login').send({
            email: validUser.email,
            password: 'short'
        });
        expect(res.status).toBe(400);
    });

    test('register then login round-trip succeeds', async () => {
        const signupRes = await registerUser();
        expect(signupRes.status).toBe(200);

        const loginRes = await request(app).post('/user/login').send({
            email: validUser.email,
            password: validUser.password
        });
        expect(loginRes.status).toBe(200);
        expect(loginRes.body.accessToken).toBeDefined();
    });
});
