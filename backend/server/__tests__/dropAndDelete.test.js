// Students dropping a class and professors deleting a quiz
const {
    useTestDatabase,
    request, app, classroomModel, quizModel, attemptModel, tokenFor, professor, student, otherStudent, auth, questions, setup, start,
} = require('./quizFixtures');

useTestDatabase();

describe('dropping a class', () => {
    test('student drops the class and loses access, but keeps past attempts', async () => {
        const { classroom, base } = await setup();
        const { body: attempt } = await start(base);
        const drop = () => request(app).delete(`/classrooms/${classroom._id}/enrollment`).set(auth(student));

        expect((await drop()).status).toBe(200);
        expect((await classroomModel.findById(classroom._id)).students.map(String)).toEqual([String(otherStudent.id)]);
        expect((await request(app).get('/classrooms').set(auth(student))).body).toEqual([]);
        expect((await request(app).get(`${base}/mine`).set(auth(student))).status).toBe(403);
        expect(await attemptModel.findById(attempt._id)).not.toBeNull();

        expect((await drop()).status).toBe(404); // already dropped
    });

    test('only students can drop', async () => {
        const { classroom } = await setup();
        expect((await request(app).delete(`/classrooms/${classroom._id}/enrollment`).set(auth(professor))).status).toBe(403);
    });
});

describe('deleting a quiz', () => {
    test("professor deletes a quiz and every student's attempts on it", async () => {
        const { classroom, quiz, base } = await setup();
        await start(base);
        await start(base, otherStudent);
        const other = await quizModel.create({ classroomId: classroom._id, title: 'Quiz 2', questions: questions.slice(0, 1) });
        await start(`/classrooms/${classroom._id}/quizzes/${other._id}/attempts`);

        const res = await request(app).delete(`/classrooms/${classroom._id}/quizzes/${quiz._id}`).set(auth(professor));
        expect(res.status).toBe(200);
        expect(res.body.attemptsDeleted).toBe(2);
        expect(await quizModel.findById(quiz._id)).toBeNull();
        expect(await attemptModel.countDocuments({ quizId: quiz._id })).toBe(0);
        expect(await attemptModel.countDocuments({ quizId: other._id })).toBe(1); // other quizzes untouched

        const { body: list } = await request(app).get(`/classrooms/${classroom._id}/quizzes`).set(auth(student));
        expect(list.map((q) => q.title)).toEqual(['Quiz 2']);
    });

    test('only the owning professor can delete', async () => {
        const { classroom, quiz } = await setup();
        const url = `/classrooms/${classroom._id}/quizzes/${quiz._id}`;
        expect((await request(app).delete(url).set(auth(student))).status).toBe(403);
        expect((await request(app).delete(url).set(auth(tokenFor('professor')))).status).toBe(403);
        expect(await quizModel.findById(quiz._id)).not.toBeNull();
    });
});
