// The server-side timer: deadlines, autosave, and auto-submitting when time runs out
const {
    useTestDatabase,
    request, app, clearDB, quizModel, attemptModel, student, auth, questions, setup, start,
} = require('./quizFixtures');

useTestDatabase();

describe('server-side timer', () => {
    const { finishExpiredAttempts } = require('../utilities/finishAttempt');
    const minute = 60 * 1000;

    // A timed quiz (multiple choice worth 2, true/false worth 1) with one attempt started
    async function timed(extra = { timeLimitMinutes: 10 }) {
        const ctx = await setup(questions.slice(0, 2));
        await quizModel.updateOne({ _id: ctx.quiz._id }, extra);
        const { body: attempt } = await start(ctx.base);
        const ids = ctx.quiz.questions.map((q) => q.questionId);
        const right = [{ questionId: ids[0], selectedOptionIndex: 1 }, { questionId: ids[1], selectedOptionIndex: 1 }]; // 3 points
        const wrong = [{ questionId: ids[0], selectedOptionIndex: 0 }];                                                    // 0 points
        const save = (answers) => request(app).put(`${ctx.base}/${attempt._id}/answers`).set(auth(student)).send({ answers });
        const submit = (answers) => request(app).post(`${ctx.base}/${attempt._id}/submit`).set(auth(student)).send({ answers });
        // Moves the deadline into the past, as if the student ran out of time
        const expire = () => attemptModel.updateOne({ _id: attempt._id }, { deadlineAt: new Date(Date.now() - 5 * minute) });
        return { ...ctx, attempt, right, wrong, save, submit, expire };
    }

    test('the deadline is set by the server: time limit or due date, whichever is first', async () => {
        const { attempt } = await timed({ timeLimitMinutes: 10 });
        const fromLimit = new Date(attempt.deadlineAt) - new Date(attempt.startedAt);
        expect(fromLimit).toBe(10 * minute);

        await clearDB();
        const due = new Date(Date.now() + 3 * minute);
        const { attempt: dueFirst } = await timed({ timeLimitMinutes: 10, dueAt: due });
        expect(new Date(dueFirst.deadlineAt).getTime()).toBe(due.getTime());

        await clearDB();
        const { attempt: untimed } = await timed({});
        expect(untimed.deadlineAt).toBeUndefined();
    });

    test('answers saved in time are kept on the server and come back on reload', async () => {
        const { base, right, save } = await timed();
        expect((await save(right)).status).toBe(200);
        const { body } = await request(app).get(`${base}/mine`).set(auth(student));
        expect(body.attempt.savedAnswers).toHaveLength(2);
        expect(body.serverNow).toBeDefined();
    });

    test('a submit after the deadline grades the answers saved in time, not the late ones', async () => {
        const { right, wrong, save, submit, expire } = await timed();
        await save(wrong);
        await expire();

        expect((await save(right)).status).toBe(409); // too late to change answers
        const res = await submit(right);
        expect(res.status).toBe(200);
        expect(res.body.autoSubmitted).toBe(true);
        expect(res.body.totalScoreAwarded).toBe(0);
    });

    test('a submit before the deadline grades what was sent', async () => {
        const { right, wrong, save, submit } = await timed();
        await save(wrong);
        const res = await submit(right);
        expect(res.body.totalScoreAwarded).toBe(3);
        expect(res.body.autoSubmitted).toBe(false);
        expect(res.body.savedAnswers).toBeUndefined();
    });

    test('attempts left open past the deadline are submitted automatically, only once', async () => {
        const { base, attempt, right, save, submit, expire } = await timed();
        await save(right);
        await expire();

        expect(await finishExpiredAttempts()).toBe(1);
        expect(await finishExpiredAttempts()).toBe(0);
        const saved = await attemptModel.findById(attempt._id);
        expect(saved).toMatchObject({ status: 'graded', autoSubmitted: true, totalScoreAwarded: 3 });

        expect((await submit(right)).status).toBe(409);
        const { body } = await request(app).get(`${base}/mine`).set(auth(student));
        expect(body.attempt.status).toBe('graded');
    });

    test("opening the quiz after time ran out shows it submitted, even before the background check runs", async () => {
        const { base, right, save, expire } = await timed();
        await save(right);
        await expire();
        const { body } = await request(app).get(`${base}/mine`).set(auth(student));
        expect(body.attempt).toMatchObject({ status: 'graded', autoSubmitted: true, totalScoreAwarded: 3 });
    });
});
