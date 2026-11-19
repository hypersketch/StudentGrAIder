// A logged-in user deleting their own account
const bcrypt = require('bcrypt');
const {
    useTestDatabase, mongoose,
    request, app, classroomModel, quizModel, attemptModel, tokenFor, auth, questions, start,
} = require('./quizFixtures');
const userModel = require('../models/userModel');

useTestDatabase();

const PASSWORD = 'Secret123!';

// A real user record (the route checks the password), with a login for it
async function makeUser(role, name) {
    const user = await userModel.create({
        name, email: `${name.toLowerCase()}@example.com`, password: await bcrypt.hash(PASSWORD, 4), role,
    });
    return { user, ...tokenFor(role, user._id) };
}

const deleteMe = (login, body = { password: PASSWORD }) => request(app).delete('/user/me').set(auth(login)).send(body);

describe('DELETE /user/me', () => {
    test('professor deletes their account with their classes, quizzes and attempts; other professors are untouched', async () => {
        const prof = await makeUser('professor', 'Prof');
        const other = await makeUser('professor', 'Other');
        const stu = await makeUser('student', 'Stu');

        const classroom = await classroomModel.create({ className: 'Physics', courseCode: 'PHY1', professorId: prof.id, students: [stu.id] });
        const quiz = await quizModel.create({ classroomId: classroom._id, title: 'Quiz 1', questions });
        await start(`/classrooms/${classroom._id}/quizzes/${quiz._id}/attempts`, stu);

        const kept = await classroomModel.create({ className: 'Chem', courseCode: 'CHE1', professorId: other.id, students: [stu.id] });
        const keptQuiz = await quizModel.create({ classroomId: kept._id, title: 'Kept', questions });
        await start(`/classrooms/${kept._id}/quizzes/${keptQuiz._id}/attempts`, stu);

        const res = await deleteMe(prof);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ classesDeleted: 1, quizzesDeleted: 1, attemptsDeleted: 1 });
        expect(await userModel.findById(prof.id)).toBeNull();
        expect(await classroomModel.findById(classroom._id)).toBeNull();
        expect(await quizModel.findById(quiz._id)).toBeNull();
        expect(await attemptModel.countDocuments({ quizId: quiz._id })).toBe(0);

        expect(await classroomModel.findById(kept._id)).not.toBeNull();
        expect(await quizModel.findById(keptQuiz._id)).not.toBeNull();
        expect(await attemptModel.countDocuments({ quizId: keptQuiz._id })).toBe(1);
        expect(await userModel.findById(stu.id)).not.toBeNull();
    });

    test('student deletes their account: attempts gone, removed from classes and join requests', async () => {
        const prof = await makeUser('professor', 'Prof');
        const stu = await makeUser('student', 'Stu');
        const classmate = await makeUser('student', 'Mate');

        const classroom = await classroomModel.create({ className: 'Physics', courseCode: 'PHY1', professorId: prof.id, students: [stu.id, classmate.id] });
        const waiting = await classroomModel.create({ className: 'Chem', courseCode: 'CHE1', professorId: prof.id, pendingStudents: [stu.id] });
        const quiz = await quizModel.create({ classroomId: classroom._id, title: 'Quiz 1', questions });
        const base = `/classrooms/${classroom._id}/quizzes/${quiz._id}/attempts`;
        await start(base, stu);
        await start(base, classmate);

        const res = await deleteMe(stu);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ classesDeleted: 0, quizzesDeleted: 0, attemptsDeleted: 1 });
        expect(await userModel.findById(stu.id)).toBeNull();
        expect(await attemptModel.countDocuments({ studentId: stu.id })).toBe(0);
        expect(await attemptModel.countDocuments({ studentId: classmate.id })).toBe(1);

        const after = await classroomModel.findById(classroom._id);
        expect(after.students.map(String)).toEqual([String(classmate.id)]);
        expect((await classroomModel.findById(waiting._id)).pendingStudents).toHaveLength(0);
        expect(await quizModel.findById(quiz._id)).not.toBeNull();
    });

    test('the deleted account can no longer log in or refresh its token', async () => {
        const stu = await makeUser('student', 'Stu');
        await deleteMe(stu);
        const login = await request(app).post('/user/login').send({ email: 'stu@example.com', password: PASSWORD });
        expect(login.status).toBe(401);
        expect((await request(app).post('/user/refresh-token').set(auth(stu))).status).toBe(401);
    });

    test('wrong password is 401 and deletes nothing', async () => {
        const stu = await makeUser('student', 'Stu');
        const res = await deleteMe(stu, { password: 'wrong-password' });
        expect(res.status).toBe(401);
        expect(await userModel.findById(stu.id)).not.toBeNull();
    });

    test('missing password is 400', async () => {
        const stu = await makeUser('student', 'Stu');
        expect((await deleteMe(stu, {})).status).toBe(400);
        expect(await userModel.findById(stu.id)).not.toBeNull();
    });

    test('needs a login', async () => {
        expect((await request(app).delete('/user/me').send({ password: PASSWORD })).status).toBe(401);
    });

    test('an account that is already gone is 404', async () => {
        const ghost = tokenFor('student', new mongoose.Types.ObjectId());
        expect((await deleteMe(ghost)).status).toBe(404);
    });
});
