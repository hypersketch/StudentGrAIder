const request = require('supertest');
const mongoose = require('mongoose');
const { buildApp, connect, disconnect, clearDB } = require('./testSetup');
const { generateAccessToken } = require('../utilities/generateToken');
const userModel = require('../models/userModel');
const classroomModel = require('../models/classroomModel');
const quizModel = require('../models/quizModel');
const attemptModel = require('../models/attemptModel');

const app = buildApp();

beforeAll(async () => { await connect(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await clearDB(); });

const tokenFor = (role, id = new mongoose.Types.ObjectId()) =>
    ({ id, token: generateAccessToken(id, `${role}@example.com`, 'Test', role) });
const auth = ({ token }) => ({ Authorization: `Bearer ${token}` });

const professor = tokenFor('professor');
const hour = 60 * 60 * 1000;
const mc = (points) => ({ type: 'multiple_choice', text: 'Q', options: ['a', 'b'], correctOptionIndex: 0, points });
const open = (points) => ({ type: 'open_response', text: 'Explain', points });

// A class with Ann and Ben enrolled
async function setup() {
    const ann = await userModel.create({ name: 'Ann', email: 'ann@example.com', password: 'hash', role: 'student' });
    const ben = await userModel.create({ name: 'Ben', email: 'ben@example.com', password: 'hash', role: 'student' });
    const classroom = await classroomModel.create({ className: 'Science', courseCode: '101', professorId: professor.id, students: [ann._id, ben._id] });
    const makeQuiz = (title, questions, extra = {}) => quizModel.create({ classroomId: classroom._id, title, questions, ...extra });
    return { classroom, ann, ben, makeQuiz, asAnn: tokenFor('student', ann._id) };
}

// A submitted attempt where `earned` lists the points awarded per question (open responses: professorScore, or null if ungraded)
const submit = (quiz, student, earned, attemptNumber = 1) => attemptModel.create({
    quizId: quiz._id,
    studentId: student._id,
    attemptNumber,
    status: 'submitted',
    totalPointsPossible: quiz.totalPoints,
    totalScoreAwarded: earned.reduce((s, p) => s + (p || 0), 0),
    answers: quiz.questions.map((q, i) => (q.type === 'open_response'
        ? { questionId: q.questionId, type: q.type, points: q.points, professorScore: earned[i] ?? undefined, pointsAwarded: earned[i] || 0 }
        : { questionId: q.questionId, type: q.type, points: q.points, pointsAwarded: earned[i] })),
});

const gradebook = (classroom) => request(app).get(`/classrooms/${classroom._id}/grades`).set(auth(professor));
const mine = (classroom, user) => request(app).get(`/classrooms/${classroom._id}/grades/mine`).set(auth(user));

describe('overall grade', () => {
    test('every quiz counts the same, whatever its points', async () => {
        const { classroom, ann, makeQuiz, asAnn } = await setup();
        const small = await makeQuiz('Small', [mc(1), mc(1)]);   // 2 pts
        const big = await makeQuiz('Big', [mc(10)]);              // 10 pts
        await submit(small, ann, [1, 0]);                         // 50%
        await submit(big, ann, [10]);                             // 100%

        const { body } = await mine(classroom, asAnn);
        expect(body.grades.map((g) => g.percent)).toEqual([50, 100]);
        expect(body.overall).toBe(75); // points-weighted would be 91.7
    });

    test('past-due quizzes never submitted count as 0; not-yet-due ones and drafts do not count', async () => {
        const { classroom, ann, makeQuiz, asAnn } = await setup();
        const done = await makeQuiz('Done', [mc(4)]);
        await makeQuiz('Missed', [mc(4)], { dueAt: new Date(Date.now() - hour) });
        await makeQuiz('Upcoming', [mc(4)], { dueAt: new Date(Date.now() + hour) });
        await makeQuiz('Draft', [mc(4)], { published: false });
        await submit(done, ann, [4]);

        const { body } = await mine(classroom, asAnn);
        expect(body.grades.map((g) => g.status)).toEqual(['graded', 'missed', 'not_taken']);
        expect(body.overall).toBe(50);
    });

    test('uses the best attempt, and ungraded open responses count as 0 until marked', async () => {
        const { classroom, ann, makeQuiz, asAnn } = await setup();
        const quiz = await makeQuiz('Mixed', [mc(5), open(5)], { maxAttempts: 2 });
        await submit(quiz, ann, [0, null], 1);
        const second = await submit(quiz, ann, [5, null], 2);

        let { body } = await mine(classroom, asAnn);
        expect(body.grades[0]).toMatchObject({ status: 'pending', percent: 50 });

        await attemptModel.updateOne({ _id: second._id }, { $set: { 'answers.1.professorScore': 5 } });
        ({ body } = await mine(classroom, asAnn));
        expect(body.grades[0]).toMatchObject({ status: 'graded', percent: 100 });
        expect(body.overall).toBe(100);
    });

    test('nothing counts yet means no overall grade', async () => {
        const { classroom, makeQuiz, asAnn } = await setup();
        await makeQuiz('Upcoming', [mc(4)]);
        expect((await mine(classroom, asAnn)).body.overall).toBeNull();
    });
});

describe('GET /classrooms/:id/grades (gradebook)', () => {
    test('lists every enrolled student against every published quiz', async () => {
        const { classroom, ann, makeQuiz } = await setup();
        const q1 = await makeQuiz('Quiz 1', [mc(2)]);
        await makeQuiz('Quiz 2', [mc(2)], { dueAt: new Date(Date.now() - hour) });
        await submit(q1, ann, [2]);

        const res = await gradebook(classroom);
        expect(res.status).toBe(200);
        expect(res.body.classroom).toMatchObject({ courseCode: '101', className: 'Science' });
        expect(res.body.quizzes.map((q) => q.title)).toEqual(['Quiz 1', 'Quiz 2']);
        expect(res.body.students.map((s) => s.name)).toEqual(['Ann', 'Ben']);

        const [annRow, benRow] = res.body.students;
        expect(annRow.grades.map((g) => g.status)).toEqual(['graded', 'missed']);
        expect(annRow.overall).toBe(50);
        expect(benRow.grades.map((g) => g.status)).toEqual(['not_taken', 'missed']);
        expect(benRow.overall).toBe(0);
        expect(annRow.password).toBeUndefined();
    });

    test('only the owning professor sees the gradebook; students only see their own grades', async () => {
        const { classroom, asAnn } = await setup();
        expect((await request(app).get(`/classrooms/${classroom._id}/grades`).set(auth(tokenFor('professor')))).status).toBe(403);
        expect((await request(app).get(`/classrooms/${classroom._id}/grades`).set(auth(asAnn))).status).toBe(403);
        expect((await mine(classroom, tokenFor('student'))).status).toBe(403);
        expect((await mine(classroom, professor)).status).toBe(403);
    });
});
