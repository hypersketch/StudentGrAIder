const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { buildApp, connect, disconnect, clearDB } = require('./testSetup');
const userModel = require('../models/userModel');
const classroomModel = require('../models/classroomModel');

// buildApp() leaves the dev login out, like server.js without ENABLE_DEV_LOGIN
const appWithout = buildApp();
const app = buildApp();
app.use('/user', require('../routes/devLogin'));

beforeAll(async () => { await connect(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await clearDB(); });

const devLogin = (role) => request(app).post('/user/dev-login').send({ role });

describe('POST /user/dev-login', () => {
    test('does not exist unless the router is mounted', async () => {
        const res = await request(appWithout).post('/user/dev-login').send({ role: 'professor' });
        expect(res.status).toBe(404);
    });

    test.each(['professor', 'student'])('logs in as the test %s', async (role) => {
        const res = await devLogin(role);
        expect(res.status).toBe(200);
        expect(jwt.decode(res.body.accessToken)).toMatchObject({ role, name: `Test ${role[0].toUpperCase()}${role.slice(1)}` });
    });

    test('reuses the same account on later logins', async () => {
        const first = jwt.decode((await devLogin('professor')).body.accessToken);
        const second = jwt.decode((await devLogin('professor')).body.accessToken);
        expect(second.id).toBe(first.id);
        expect(await userModel.countDocuments()).toBe(1);
    });

    test('enrolls the test student in every class, from any professor, only once', async () => {
        const professor = jwt.decode((await devLogin('professor')).body.accessToken);
        await classroomModel.create({ className: 'Test', courseCode: 'T1', professorId: professor.id });
        await classroomModel.create({ className: 'Other', courseCode: 'T2', professorId: new mongoose.Types.ObjectId() });
        await devLogin('student');
        const student = jwt.decode((await devLogin('student')).body.accessToken);
        const classes = await classroomModel.find();
        expect(classes).toHaveLength(2);
        classes.forEach((c) => expect(c.students.map(String)).toEqual([student.id]));
    });

    test('rejects any other role with 400', async () => {
        const res = await devLogin('admin');
        expect(res.status).toBe(400);
    });
});
