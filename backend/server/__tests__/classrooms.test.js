const request = require('supertest');
const mongoose = require('mongoose');
const { buildApp, connect, disconnect, clearDB } = require('./testSetup');
const { generateAccessToken } = require('../utilities/generateToken');
const classroomModel = require('../models/classroomModel');

const app = buildApp();

beforeAll(async () => { await connect(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await clearDB(); });

// Tokens for made-up users; the routes only trust the JWT, not the users collection
const tokenFor = (role, id = new mongoose.Types.ObjectId()) =>
    ({ id, token: generateAccessToken(id, `${role}@example.com`, 'Test', role) });

const professor = tokenFor('professor');
const otherProfessor = tokenFor('professor');
const student = tokenFor('student');
const auth = ({ token }) => ({ Authorization: `Bearer ${token}` });

const createClass = (user = professor, body = { className: 'Intro to CS', courseCode: 'cs101' }) =>
    request(app).post('/classrooms').set(auth(user)).send(body);

const mcQuestion = { type: 'multiple_choice', text: '2 + 2?', options: ['3', '4'], correctOptionIndex: 1, points: 2 };

describe('POST /classrooms', () => {
    test('professor creates a class', async () => {
        const res = await createClass();
        expect(res.status).toBe(201);
        expect(res.body.courseCode).toBe('CS101');
        expect(res.body.professorId).toBe(String(professor.id));
    });

    test('rejects students with 403', async () => {
        const res = await createClass(student);
        expect(res.status).toBe(403);
    });

    test('rejects missing token with 401', async () => {
        const res = await request(app).post('/classrooms').send({ className: 'X', courseCode: 'Y' });
        expect(res.status).toBe(401);
    });

    test('rejects missing fields with 400', async () => {
        const res = await createClass(professor, { className: 'Intro to CS' });
        expect(res.status).toBe(400);
    });

    test('rejects a duplicate course code for the same professor with 409', async () => {
        await createClass();
        const res = await createClass();
        expect(res.status).toBe(409);
    });
});

describe('GET /classrooms', () => {
    test('professor sees only their own classes', async () => {
        await createClass();
        await createClass(otherProfessor, { className: 'Other', courseCode: 'OT200' });
        const res = await request(app).get('/classrooms').set(auth(professor));
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].courseCode).toBe('CS101');
    });

    test('student sees only classes they are enrolled in', async () => {
        const { body: enrolled } = await createClass();
        await createClass(professor, { className: 'Other', courseCode: 'OT200' });
        await classroomModel.updateOne({ _id: enrolled._id }, { $push: { students: student.id } });
        const res = await request(app).get('/classrooms').set(auth(student));
        expect(res.body).toHaveLength(1);
        expect(res.body[0]._id).toBe(enrolled._id);
    });
});

describe('POST /classrooms/:id/quizzes', () => {
    test('professor creates a quiz in their class', async () => {
        const { body: classroom } = await createClass();
        const res = await request(app).post(`/classrooms/${classroom._id}/quizzes`).set(auth(professor)).send({
            title: 'Quiz 1',
            timeLimitMinutes: 10,
            questions: [mcQuestion, { type: 'true_false', text: 'Sky is blue', correctOptionIndex: 0 }, { type: 'open_response', text: 'Explain', sampleAnswer: 'Because' }],
        });
        expect(res.status).toBe(201);
        expect(res.body.classroomId).toBe(classroom._id);
        expect(res.body.questions).toHaveLength(3);
        expect(res.body.questions[1].options).toEqual(['True', 'False']);
    });

    test('rejects a professor who does not own the class with 403', async () => {
        const { body: classroom } = await createClass();
        const res = await request(app).post(`/classrooms/${classroom._id}/quizzes`).set(auth(otherProfessor))
            .send({ title: 'Quiz 1', questions: [mcQuestion] });
        expect(res.status).toBe(403);
    });

    test('rejects students with 403', async () => {
        const { body: classroom } = await createClass();
        const res = await request(app).post(`/classrooms/${classroom._id}/quizzes`).set(auth(student))
            .send({ title: 'Quiz 1', questions: [mcQuestion] });
        expect(res.status).toBe(403);
    });

    test('returns 404 for an unknown or malformed class id', async () => {
        const unknown = await request(app).post(`/classrooms/${new mongoose.Types.ObjectId()}/quizzes`).set(auth(professor))
            .send({ title: 'Quiz 1', questions: [mcQuestion] });
        const malformed = await request(app).post('/classrooms/not-an-id/quizzes').set(auth(professor))
            .send({ title: 'Quiz 1', questions: [mcQuestion] });
        expect(unknown.status).toBe(404);
        expect(malformed.status).toBe(404);
    });

    test('rejects a quiz with no questions with 400', async () => {
        const { body: classroom } = await createClass();
        const res = await request(app).post(`/classrooms/${classroom._id}/quizzes`).set(auth(professor))
            .send({ title: 'Quiz 1', questions: [] });
        expect(res.status).toBe(400);
    });

    test('rejects a missing title with 400', async () => {
        const { body: classroom } = await createClass();
        const res = await request(app).post(`/classrooms/${classroom._id}/quizzes`).set(auth(professor))
            .send({ questions: [mcQuestion] });
        expect(res.status).toBe(400);
    });

    test('rejects blank answer options with 400', async () => {
        const { body: classroom } = await createClass();
        const res = await request(app).post(`/classrooms/${classroom._id}/quizzes`).set(auth(professor))
            .send({ title: 'Quiz 1', questions: [{ ...mcQuestion, options: ['4', ' '] }] });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/blank/);
    });
});

// Creates a class owned by `professor` with one quiz in it
async function createClassWithQuiz() {
    const { body: classroom } = await createClass();
    const { body: quiz } = await request(app).post(`/classrooms/${classroom._id}/quizzes`).set(auth(professor))
        .send({ title: 'Quiz 1', timeLimitMinutes: 10, questions: [mcQuestion, { type: 'open_response', text: 'Explain' }] });
    return { classroom, quiz, url: `/classrooms/${classroom._id}/quizzes/${quiz._id}` };
}

describe('GET /classrooms/:id/quizzes/:quizId', () => {
    test('owner gets the full quiz with answers', async () => {
        const { url } = await createClassWithQuiz();
        const res = await request(app).get(url).set(auth(professor));
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Quiz 1');
        expect(res.body.questions[0].correctOptionIndex).toBe(1);
    });

    test('rejects other professors and students with 403', async () => {
        const { classroom, url } = await createClassWithQuiz();
        await classroomModel.updateOne({ _id: classroom._id }, { $push: { students: student.id } });
        expect((await request(app).get(url).set(auth(otherProfessor))).status).toBe(403);
        expect((await request(app).get(url).set(auth(student))).status).toBe(403);
    });

    test('returns 404 for an unknown quiz or a quiz from another class', async () => {
        const { classroom, quiz } = await createClassWithQuiz();
        const { body: otherClass } = await createClass(professor, { className: 'Other', courseCode: 'OT200' });
        const unknown = await request(app).get(`/classrooms/${classroom._id}/quizzes/${new mongoose.Types.ObjectId()}`).set(auth(professor));
        const wrongClass = await request(app).get(`/classrooms/${otherClass._id}/quizzes/${quiz._id}`).set(auth(professor));
        expect(unknown.status).toBe(404);
        expect(wrongClass.status).toBe(404);
    });
});

describe('PUT /classrooms/:id/quizzes/:quizId', () => {
    test('owner updates the quiz, keeping ids of questions sent back', async () => {
        const { quiz, url } = await createClassWithQuiz();
        const kept = { ...quiz.questions[0], text: '3 + 3?', options: ['6', '7'], correctOptionIndex: 0 };
        const res = await request(app).put(url).set(auth(professor)).send({
            title: 'Quiz 1 (revised)',
            timeLimitMinutes: null,
            questions: [kept, { type: 'true_false', text: 'New one', correctOptionIndex: 1 }],
        });
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Quiz 1 (revised)');
        expect(res.body.timeLimitMinutes).toBeUndefined();
        expect(res.body.questions).toHaveLength(2);
        expect(res.body.questions[0]).toMatchObject({ questionId: quiz.questions[0].questionId, text: '3 + 3?', correctOptionIndex: 0 });
        expect(res.body.questions[1].questionId).toBeDefined();
    });

    test('rejects invalid changes with 400 and leaves the quiz unchanged', async () => {
        const { url } = await createClassWithQuiz();
        const res = await request(app).put(url).set(auth(professor))
            .send({ title: '', questions: [mcQuestion] });
        expect(res.status).toBe(400);
        const { body } = await request(app).get(url).set(auth(professor));
        expect(body.title).toBe('Quiz 1');
    });

    test('rejects other professors and students with 403', async () => {
        const { url } = await createClassWithQuiz();
        const body = { title: 'Hijacked', questions: [mcQuestion] };
        expect((await request(app).put(url).set(auth(otherProfessor)).send(body)).status).toBe(403);
        expect((await request(app).put(url).set(auth(student)).send(body)).status).toBe(403);
    });
});

describe('GET /classrooms/:id/quizzes', () => {
    test('lists quiz summaries without questions or answers', async () => {
        const { body: classroom } = await createClass();
        await request(app).post(`/classrooms/${classroom._id}/quizzes`).set(auth(professor))
            .send({ title: 'Quiz 1', questions: [mcQuestion, mcQuestion] });
        await classroomModel.updateOne({ _id: classroom._id }, { $push: { students: student.id } });

        for (const user of [professor, student]) {
            const res = await request(app).get(`/classrooms/${classroom._id}/quizzes`).set(auth(user));
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0]).toMatchObject({ title: 'Quiz 1', questionCount: 2, totalPoints: 4 });
            expect(res.body[0].questions).toBeUndefined();
        }
    });

    test('rejects users who neither teach nor take the class with 403', async () => {
        const { body: classroom } = await createClass();
        const res = await request(app).get(`/classrooms/${classroom._id}/quizzes`).set(auth(student));
        expect(res.status).toBe(403);
    });
});
