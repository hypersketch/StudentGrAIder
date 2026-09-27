const request = require('supertest');
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

describe('POST /user/signup', () => {
    test('registers a new user successfully', async () => {
        const res = await request(app).post('/user/signup').send(validUser);
        expect(res.status).toBe(200);
        expect(res.body.username).toBe(validUser.username);
        expect(res.body.email).toBe(validUser.email);
        expect(res.body.password).not.toBe(validUser.password); // password must be hashed
    });

    test('rejects duplicate username with 409', async () => {
        await request(app).post('/user/signup').send(validUser);
        const res = await request(app).post('/user/signup').send(validUser);
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/taken/i);
    });

    test('rejects username shorter than 6 characters with 400', async () => {
        const res = await request(app).post('/user/signup').send({
            ...validUser, username: 'abc'
        });
        expect(res.status).toBe(400);
    });

    test('rejects invalid email format with 400', async () => {
        const res = await request(app).post('/user/signup').send({
            ...validUser, email: 'not-an-email'
        });
        expect(res.status).toBe(400);
    });

    test('rejects password shorter than 8 characters with 400', async () => {
        const res = await request(app).post('/user/signup').send({
            ...validUser, password: 'short'
        });
        expect(res.status).toBe(400);
    });

    test('rejects missing fields with 400', async () => {
        const res = await request(app).post('/user/signup').send({});
        expect(res.status).toBe(400);
    });
});
