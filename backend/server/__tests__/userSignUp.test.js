const request = require('supertest');
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

describe('POST /user/signup', () => {
    test('registers a new user successfully', async () => {
        const res = await request(app).post('/user/signup').send(validUser);
        expect(res.status).toBe(200);
        expect(res.body.name).toBe(validUser.name);
        expect(res.body.email).toBe(validUser.email);
        expect(res.body.role).toBe(validUser.role);
        expect(res.body.createdAt).toBeDefined();
        expect(res.body.password).toBeUndefined(); // hash must never be sent back
    });

    test('rejects duplicate email with 409', async () => {
        await request(app).post('/user/signup').send(validUser);
        const res = await request(app).post('/user/signup').send({ ...validUser, name: 'Someone Else' });
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/already exists/i);
    });

    test('treats emails as case-insensitive for duplicates', async () => {
        await request(app).post('/user/signup').send(validUser);
        const res = await request(app).post('/user/signup').send({ ...validUser, email: 'TEST@Example.com' });
        expect(res.status).toBe(409);
    });

    test('allows two users with the same name', async () => {
        await request(app).post('/user/signup').send(validUser);
        const res = await request(app).post('/user/signup').send({ ...validUser, email: 'other@example.com' });
        expect(res.status).toBe(200);
    });

    test('rejects name shorter than 2 characters with 400', async () => {
        const res = await request(app).post('/user/signup').send({
            ...validUser, name: 'a'
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

    test('rejects missing or invalid role with 400', async () => {
        const { role, ...noRole } = validUser;
        const missing = await request(app).post('/user/signup').send(noRole);
        expect(missing.status).toBe(400);

        const invalid = await request(app).post('/user/signup').send({ ...validUser, role: 'admin' });
        expect(invalid.status).toBe(400);
    });

    test('rejects missing fields with 400', async () => {
        const res = await request(app).post('/user/signup').send({});
        expect(res.status).toBe(400);
    });
});
