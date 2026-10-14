// Refreshing a login so active users stay logged in
const {
    useTestDatabase,
    request, app, student, auth,
} = require('./quizFixtures');

useTestDatabase();

describe('POST /user/refresh-token', () => {
    const jwt = require('jsonwebtoken');
    const userModel = require('../models/userModel');

    test('swaps a valid login for a fresh one', async () => {
        const user = await userModel.create({ name: 'Sam', email: 'sam@example.com', password: 'hash', role: 'student' });
        const old = jwt.sign({ id: user._id, email: user.email, name: user.name, role: user.role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5m' });
        const res = await request(app).post('/user/refresh-token').set({ Authorization: `Bearer ${old}` });
        expect(res.status).toBe(200);
        const fresh = jwt.decode(res.body.accessToken);
        expect(fresh).toMatchObject({ id: String(user._id), role: 'student', name: 'Sam' });
        expect(fresh.exp).toBeGreaterThan(jwt.decode(old).exp);
    });

    test('refuses expired logins and deleted accounts', async () => {
        const expired = jwt.sign({ id: 'x' }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: -10 });
        expect((await request(app).post('/user/refresh-token').set({ Authorization: `Bearer ${expired}` })).status).toBe(401);
        expect((await request(app).post('/user/refresh-token').set(auth(student))).status).toBe(401); // no such user
        expect((await request(app).post('/user/refresh-token')).status).toBe(401);
    });
});
