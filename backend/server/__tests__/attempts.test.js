const request = require('supertest');
const mongoose = require('mongoose');
const { buildApp, connect, disconnect, clearDB } = require('./testSetup');
const { generateAccessToken } = require('../utilities/generateToken');
const classroomModel = require('../models/classroomModel');
const quizModel = require('../models/quizModel');

const app = buildApp();

beforeAll(async () => { await connect(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await clearDB(); });

const tokenFor = (role, id = new mongoose.Types.ObjectId()) =>
    ({ id, token: generateAccessToken(id, `${role}@example.com`, 'Test', role) });

const professor = tokenFor('professor');
const student = tokenFor('student');
const otherStudent = tokenFor('student');
const outsider = tokenFor('student');
const auth = ({ token }) => ({ Authorization: `Bearer ${token}` });

const questions = [
    { type: 'multiple_choice', text: '2 + 2?', options: ['3', '4', '5'], correctOptionIndex: 1, points: 2 },
    { type: 'true_false', text: 'The sky is green', correctOptionIndex: 1, points: 1 },
    { type: 'open_response', text: 'Explain gravity', sampleAnswer: 'Mass attracts mass', points: 5 },
];

// A class with `student` and `otherStudent` enrolled and one quiz; returns the attempts base url
async function setup(quizQuestions = questions) {
    const classroom = await classroomModel.create({
        className: 'Physics', courseCode: 'PHY1', professorId: professor.id, students: [student.id, otherStudent.id],
    });
    const quiz = await quizModel.create({ classroomId: classroom._id, title: 'Quiz 1', questions: quizQuestions });
    return { classroom, quiz, base: `/classrooms/${classroom._id}/quizzes/${quiz._id}/attempts` };
}

const start = (base, user = student) => request(app).post(base).set(auth(user));

describe('GET .../attempts/mine', () => {
    test('returns the quiz without correct or sample answers, and attempt null before starting', async () => {
        const { base } = await setup();
        const res = await request(app).get(`${base}/mine`).set(auth(student));
        expect(res.status).toBe(200);
        expect(res.body.attempt).toBeNull();
        expect(res.body.quiz.totalPoints).toBe(8);
        res.body.quiz.questions.forEach((q) => {
            expect(q.questionId).toBeDefined();
            expect(q.correctOptionIndex).toBeUndefined();
            expect(q.sampleAnswer).toBeUndefined();
        });
    });

    test('rejects students not enrolled in the class and professors with 403', async () => {
        const { base } = await setup();
        expect((await request(app).get(`${base}/mine`).set(auth(outsider))).status).toBe(403);
        expect((await request(app).get(`${base}/mine`).set(auth(professor))).status).toBe(403);
    });
});

describe('POST .../attempts', () => {
    test('starts an attempt, and returns the same one when called again', async () => {
        const { base } = await setup();
        const first = await start(base);
        expect(first.status).toBe(201);
        expect(first.body).toMatchObject({ status: 'in_progress', totalPointsPossible: 8 });

        const second = await start(base);
        expect(second.status).toBe(200);
        expect(second.body._id).toBe(first.body._id);
    });

    test('rejects students not enrolled in the class with 403', async () => {
        const { base } = await setup();
        expect((await start(base, outsider)).status).toBe(403);
    });
});

describe('POST .../attempts/:id/submit', () => {
    test('grades multiple choice and true/false, leaves open responses for grading', async () => {
        const { base, quiz } = await setup();
        const { body: attempt } = await start(base);
        const [mc, tf, open] = quiz.questions;

        const res = await request(app).post(`${base}/${attempt._id}/submit`).set(auth(student)).send({
            answers: [
                { questionId: mc.questionId, selectedOptionIndex: 1 },   // correct
                { questionId: tf.questionId, selectedOptionIndex: 0 },   // wrong
                { questionId: open.questionId, responseText: '  Things fall down  ' },
            ],
        });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('submitted');
        expect(res.body.submittedAt).toBeDefined();
        expect(res.body.totalScoreAwarded).toBe(2);
        expect(res.body.answers[0]).toMatchObject({ isCorrect: true, pointsAwarded: 2 });
        expect(res.body.answers[1]).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
        expect(res.body.answers[2]).toMatchObject({ responseText: 'Things fall down', pointsAwarded: 0 });
    });

    test('marks the attempt graded when there are no open responses, and counts missing answers as wrong', async () => {
        const { base, quiz } = await setup(questions.slice(0, 2));
        const { body: attempt } = await start(base);

        const res = await request(app).post(`${base}/${attempt._id}/submit`).set(auth(student)).send({
            answers: [{ questionId: quiz.questions[0].questionId, selectedOptionIndex: 1 }],
        });

        expect(res.body.status).toBe('graded');
        expect(res.body.totalScoreAwarded).toBe(2);
        expect(res.body.answers).toHaveLength(2);
        expect(res.body.answers[1]).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
        expect(res.body.answers[1].selectedOptionIndex).toBeUndefined();
    });

    test('ignores out-of-range choices', async () => {
        const { base, quiz } = await setup(questions.slice(0, 1));
        const { body: attempt } = await start(base);
        const res = await request(app).post(`${base}/${attempt._id}/submit`).set(auth(student))
            .send({ answers: [{ questionId: quiz.questions[0].questionId, selectedOptionIndex: 7 }] });
        expect(res.body.answers[0]).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
    });

    test('rejects a second submit with 409', async () => {
        const { base } = await setup();
        const { body: attempt } = await start(base);
        await request(app).post(`${base}/${attempt._id}/submit`).set(auth(student)).send({ answers: [] });
        const res = await request(app).post(`${base}/${attempt._id}/submit`).set(auth(student)).send({ answers: [] });
        expect(res.status).toBe(409);
    });

    test("returns 404 for another student's attempt", async () => {
        const { base } = await setup();
        const { body: attempt } = await start(base);
        const res = await request(app).post(`${base}/${attempt._id}/submit`).set(auth(otherStudent)).send({ answers: [] });
        expect(res.status).toBe(404);
    });
});

describe('GET /classrooms/:id/quizzes for students', () => {
    test("includes the student's own attempt summary, and nothing for professors", async () => {
        const { classroom, base } = await setup();
        const listUrl = `/classrooms/${classroom._id}/quizzes`;

        expect((await request(app).get(listUrl).set(auth(student))).body[0].myAttempt).toBeNull();

        await start(base);
        const { body } = await request(app).get(listUrl).set(auth(student));
        expect(body[0].myAttempt).toEqual({ status: 'in_progress', totalScoreAwarded: 0, totalPointsPossible: 8 });

        expect((await request(app).get(listUrl).set(auth(otherStudent))).body[0].myAttempt).toBeNull();
        expect((await request(app).get(listUrl).set(auth(professor))).body[0].myAttempt).toBeUndefined();
    });
});
