// Quiz due dates
const {
    useTestDatabase,
    request, app, quizModel, professor, student, auth, questions, setup, start,
} = require('./quizFixtures');

useTestDatabase();

describe('due dates', () => {
    const hour = 60 * 60 * 1000;

    test('professor sets and clears a due date; students see it', async () => {
        const { classroom, quiz } = await setup();
        const url = `/classrooms/${classroom._id}/quizzes/${quiz._id}`;
        const due = new Date(Date.now() + 24 * hour).toISOString();

        const set = await request(app).put(url).set(auth(professor)).send({ title: 'Quiz 1', questions, dueAt: due });
        expect(set.body.dueAt).toBe(due);
        const { body: list } = await request(app).get(`/classrooms/${classroom._id}/quizzes`).set(auth(student));
        expect(list[0].dueAt).toBe(due);
        expect((await request(app).get(`${url}/attempts/mine`).set(auth(student))).body.quiz.dueAt).toBe(due);

        const cleared = await request(app).put(url).set(auth(professor)).send({ title: 'Quiz 1', questions, dueAt: null });
        expect(cleared.body.dueAt).toBeUndefined();
    });

    test("students can't start after the due date, but can finish a try they already started", async () => {
        const { quiz, base } = await setup();
        const { body: started } = await start(base);
        await quizModel.updateOne({ _id: quiz._id }, { dueAt: new Date(Date.now() - hour), maxAttempts: 3 });

        const resumed = await start(base);
        expect(resumed.status).toBe(200);
        expect(resumed.body._id).toBe(started._id);
        expect((await request(app).post(`${base}/${started._id}/submit`).set(auth(student)).send({ answers: [] })).status).toBe(200);

        const late = await start(base);
        expect(late.status).toBe(409);
        expect(late.body.message).toMatch(/past its due date/);
    });

    test('before the due date, starting works as usual', async () => {
        const { quiz, base } = await setup();
        await quizModel.updateOne({ _id: quiz._id }, { dueAt: new Date(Date.now() + hour) });
        expect((await start(base)).status).toBe(201);
    });
});
