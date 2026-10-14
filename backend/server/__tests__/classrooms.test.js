const request = require('supertest');
const mongoose = require('mongoose');
const { buildApp, connect, disconnect, clearDB } = require('./testSetup');
const { generateAccessToken } = require('../utilities/generateToken');
const classroomModel = require('../models/classroomModel');

const app = buildApp();

// Build the unique indexes up front so the duplicate course code test doesn't race them
beforeAll(async () => { await connect(); await classroomModel.syncIndexes(); });
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

describe('GET /classrooms/search', () => {
    const userModel = require('../models/userModel');

    // Search needs real professor users for their names
    const makeProfessor = async (name) => {
        const user = await userModel.create({ name, email: `${name.toLowerCase()}@example.com`, password: 'hash', role: 'professor' });
        return tokenFor('professor', user._id);
    };
    const search = (q, user = student) => request(app).get('/classrooms/search').query({ q }).set(auth(user));

    let bob, joe;
    beforeEach(async () => {
        bob = await makeProfessor('Bob');
        joe = await makeProfessor('Joe');
        await createClass(bob, { className: 'Science', courseCode: '101' });
        await createClass(joe, { className: 'English', courseCode: '103' });
        await createClass(joe, { className: 'History', courseCode: '220' });
    });

    test('matches part of a course code and returns code, name and professor', async () => {
        const res = await search('10');
        expect(res.status).toBe(200);
        expect(res.body.map((c) => `${c.courseCode} ${c.className} ${c.professorName}`)).toEqual(['101 Science Bob', '103 English Joe']);
        expect(res.body[0].status).toBeNull();
        expect(res.body[0].students).toBeUndefined();
    });

    test('matches class and professor names, ignoring case', async () => {
        expect((await search('science')).body).toHaveLength(1);
        expect((await search('JOE')).body).toHaveLength(2);
    });

    test('every word has to match', async () => {
        const res = await search('10 joe');
        expect(res.body.map((c) => c.courseCode)).toEqual(['103']);
    });

    test('returns nothing for a blank search and treats symbols as plain text', async () => {
        expect((await search('   ')).body).toEqual([]);
        const symbols = await search('(.*');
        expect(symbols.status).toBe(200);
        expect(symbols.body).toEqual([]);
    });

    test('shows whether the student is enrolled or has asked to join', async () => {
        const [science, english] = (await search('10')).body;
        await classroomModel.updateOne({ _id: science._id }, { $push: { students: student.id } });
        await request(app).post(`/classrooms/${english._id}/join-requests`).set(auth(student));
        const res = await search('10');
        expect(res.body.map((c) => c.status)).toEqual(['enrolled', 'requested']);
    });

    test('rejects professors with 403', async () => {
        expect((await search('10', professor)).status).toBe(403);
    });
});

describe('join requests', () => {
    const userModel = require('../models/userModel');

    let classroom, studentUser, asStudent;
    beforeEach(async () => {
        ({ body: classroom } = await createClass());
        studentUser = await userModel.create({ name: 'Sam Student', email: 'sam@example.com', password: 'hash', role: 'student' });
        asStudent = tokenFor('student', studentUser._id);
    });
    const requestsUrl = () => `/classrooms/${classroom._id}/join-requests`;
    const askToJoin = () => request(app).post(requestsUrl()).set(auth(asStudent));

    test('student asks to join and the professor sees the request with their name', async () => {
        expect((await askToJoin()).status).toBe(201);
        expect((await askToJoin()).status).toBe(201); // asking twice doesn't duplicate it

        const res = await request(app).get(requestsUrl()).set(auth(professor));
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({ _id: String(studentUser._id), name: 'Sam Student', email: 'sam@example.com' });
        expect(res.body[0].password).toBeUndefined();
    });

    test('approving moves the student into the class', async () => {
        await askToJoin();
        const res = await request(app).post(`${requestsUrl()}/${studentUser._id}/approve`).set(auth(professor));
        expect(res.status).toBe(200);

        const { body: myClasses } = await request(app).get('/classrooms').set(auth(asStudent));
        expect(myClasses.map((c) => c._id)).toEqual([classroom._id]);
        expect(myClasses[0].pendingStudents).toBeUndefined();
        expect((await request(app).get(requestsUrl()).set(auth(professor))).body).toEqual([]);
    });

    test('declining removes the request without enrolling', async () => {
        await askToJoin();
        const res = await request(app).delete(`${requestsUrl()}/${studentUser._id}`).set(auth(professor));
        expect(res.status).toBe(200);

        expect((await request(app).get('/classrooms').set(auth(asStudent))).body).toEqual([]);
        expect((await request(app).get(requestsUrl()).set(auth(professor))).body).toEqual([]);
    });

    test('rejects a student who is already enrolled with 409', async () => {
        await classroomModel.updateOne({ _id: classroom._id }, { $push: { students: studentUser._id } });
        expect((await askToJoin()).status).toBe(409);
    });

    test('only the owning professor can see or answer requests', async () => {
        await askToJoin();
        expect((await request(app).get(requestsUrl()).set(auth(otherProfessor))).status).toBe(403);
        expect((await request(app).post(`${requestsUrl()}/${studentUser._id}/approve`).set(auth(otherProfessor))).status).toBe(403);
        expect((await request(app).get(requestsUrl()).set(auth(asStudent))).status).toBe(403);
    });

    test('returns 404 when that student has no request waiting', async () => {
        const res = await request(app).post(`${requestsUrl()}/${new mongoose.Types.ObjectId()}/approve`).set(auth(professor));
        expect(res.status).toBe(404);
        expect((await request(app).delete(`${requestsUrl()}/not-an-id`).set(auth(professor))).status).toBe(404);
    });
});

describe('student limit', () => {
    const userModel = require('../models/userModel');

    // Real students, so join requests and the roster have names to show
    const makeStudents = (n) => Promise.all(Array.from({ length: n }, (_, i) => userModel.create({
        name: `Student ${i + 1}`, email: `s${i + 1}@example.com`, password: 'hash', role: 'student',
    })));
    const settings = (classroom, body, user = professor) => request(app).patch(`/classrooms/${classroom._id}`).set(auth(user)).send(body);
    const approve = (classroom, s) => request(app).post(`/classrooms/${classroom._id}/join-requests/${s._id}/approve`).set(auth(professor));

    test('new classes default to 25 and the professor can pick another limit', async () => {
        expect((await createClass()).body.studentLimit).toBe(25);
        const res = await createClass(professor, { className: 'Seminar', courseCode: 'SEM1', studentLimit: 12 });
        expect(res.status).toBe(201);
        expect(res.body.studentLimit).toBe(12);
        expect((await createClass(professor, { className: 'Bad', courseCode: 'B1', studentLimit: 0 })).status).toBe(400);
    });

    test('approving stops at the limit, and raising the limit lets more in', async () => {
        const { body: classroom } = await createClass(professor, { className: 'Small', courseCode: 'SM1', studentLimit: 2 });
        const students = await makeStudents(3);
        await classroomModel.updateOne({ _id: classroom._id }, { $set: { pendingStudents: students.map((s) => s._id) } });

        expect((await approve(classroom, students[0])).status).toBe(200);
        expect((await approve(classroom, students[1])).status).toBe(200);
        const full = await approve(classroom, students[2]);
        expect(full.status).toBe(409);
        expect(full.body.message).toMatch(/full \(2\/2\)/);
        expect((await classroomModel.findById(classroom._id)).pendingStudents.map(String)).toEqual([String(students[2]._id)]);

        expect((await settings(classroom, { studentLimit: 3 })).body.studentLimit).toBe(3);
        expect((await approve(classroom, students[2])).status).toBe(200);
    });

    test('full classes show as full in search and refuse new requests', async () => {
        // Search only lists classes whose professor is a real user
        const pat = await userModel.create({ name: 'Pat', email: 'pat@example.com', password: 'hash', role: 'professor' });
        const { body: classroom } = await createClass(tokenFor('professor', pat._id), { className: 'Tiny', courseCode: 'TY1', studentLimit: 1 });
        await classroomModel.updateOne({ _id: classroom._id }, { $push: { students: new mongoose.Types.ObjectId() } });

        const found = await request(app).get('/classrooms/search').query({ q: 'TY1' }).set(auth(student));
        expect(found.body[0].status).toBe('full');
        const asked = await request(app).post(`/classrooms/${classroom._id}/join-requests`).set(auth(student));
        expect(asked.status).toBe(409);
        expect(asked.body.message).toMatch(/full/);
    });

    test('the limit can not go below the number already enrolled', async () => {
        const { body: classroom } = await createClass();
        await classroomModel.updateOne({ _id: classroom._id }, { $push: { students: { $each: [student.id, new mongoose.Types.ObjectId()] } } });
        const res = await settings(classroom, { studentLimit: 1 });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/2 students are already enrolled/);
    });

    test('only the owning professor can change settings', async () => {
        const { body: classroom } = await createClass();
        expect((await settings(classroom, { studentLimit: 30 }, otherProfessor)).status).toBe(403);
        expect((await settings(classroom, { studentLimit: 30 }, student)).status).toBe(403);
    });
});

describe('class roster', () => {
    const userModel = require('../models/userModel');

    let classroom, ann, ben;
    beforeEach(async () => {
        ({ body: classroom } = await createClass());
        ann = await userModel.create({ name: 'Ann', email: 'ann@example.com', password: 'hash', role: 'student' });
        ben = await userModel.create({ name: 'Ben', email: 'ben@example.com', password: 'hash', role: 'student' });
        await classroomModel.updateOne({ _id: classroom._id }, { $push: { students: { $each: [ben._id, ann._id] } } });
    });
    const rosterUrl = () => `/classrooms/${classroom._id}/students`;

    test('lists enrolled students by name, without password hashes', async () => {
        const res = await request(app).get(rosterUrl()).set(auth(professor));
        expect(res.status).toBe(200);
        expect(res.body.map((s) => s.name)).toEqual(['Ann', 'Ben']);
        expect(res.body[0].email).toBe('ann@example.com');
        expect(res.body[0].password).toBeUndefined();
    });

    test('professor removes a student', async () => {
        expect((await request(app).delete(`${rosterUrl()}/${ann._id}`).set(auth(professor))).status).toBe(200);
        expect((await request(app).get(rosterUrl()).set(auth(professor))).body.map((s) => s.name)).toEqual(['Ben']);
        expect((await request(app).delete(`${rosterUrl()}/${ann._id}`).set(auth(professor))).status).toBe(404);
    });

    test('only the owning professor can see or change the roster', async () => {
        expect((await request(app).get(rosterUrl()).set(auth(otherProfessor))).status).toBe(403);
        expect((await request(app).get(rosterUrl()).set(auth(student))).status).toBe(403);
        expect((await request(app).delete(`${rosterUrl()}/${ann._id}`).set(auth(otherProfessor))).status).toBe(403);
    });
});
