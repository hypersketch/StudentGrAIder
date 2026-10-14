// Taking a quiz: loading it, starting, submitting, and the scores shown on quiz cards
const {
    useTestDatabase,
    request, app, attemptModel, professor, student, otherStudent, outsider, auth, questions, setup, start,
} = require('./quizFixtures');

useTestDatabase();

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
        const saved = await attemptModel.findById(attempt._id);
        expect(saved.answers[0]).toMatchObject({ isCorrect: true, pointsAwarded: 2 });
        expect(saved.answers[1]).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
        expect(saved.answers[2]).toMatchObject({ responseText: 'Things fall down', pointsAwarded: 0 });

        // The student only sees the total, not which choices were wrong
        res.body.answers.slice(0, 2).forEach((a) => {
            expect(a.isCorrect).toBeUndefined();
            expect(a.pointsAwarded).toBeUndefined();
        });
        expect(res.body.answers[0].selectedOptionIndex).toBe(1);
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
        const saved = await attemptModel.findById(attempt._id);
        expect(saved.answers[1]).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
        expect(saved.answers[1].selectedOptionIndex).toBeUndefined();
    });

    test('ignores out-of-range choices', async () => {
        const { base, quiz } = await setup(questions.slice(0, 1));
        const { body: attempt } = await start(base);
        const res = await request(app).post(`${base}/${attempt._id}/submit`).set(auth(student))
            .send({ answers: [{ questionId: quiz.questions[0].questionId, selectedOptionIndex: 7 }] });
        expect(res.body.totalScoreAwarded).toBe(0);
        expect((await attemptModel.findById(attempt._id)).answers[0]).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
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
        expect(body[0]).toMatchObject({ myAttempt: null, inProgress: true, attemptsUsed: 1, maxAttempts: 1 });

        expect((await request(app).get(listUrl).set(auth(otherStudent))).body[0].myAttempt).toBeNull();
        expect((await request(app).get(listUrl).set(auth(professor))).body[0].myAttempt).toBeUndefined();
    });
});

describe('AI and professor score totals in the quiz list', () => {

    const submitAll = async (base) => {
        const { body: attempt } = await start(base);
        const { body: quiz } = await request(app).get(`${base}/mine`).set(auth(student));
        // Right on multiple choice (2 pts), wrong on true/false (0 pts), any open response
        const answers = [
            { questionId: quiz.quiz.questions[0].questionId, selectedOptionIndex: 1 },
            { questionId: quiz.quiz.questions[1].questionId, selectedOptionIndex: 0 },
            ...(quiz.quiz.questions[2] ? [{ questionId: quiz.quiz.questions[2].questionId, responseText: 'Things fall' }] : []),
        ];
        await request(app).post(`${base}/${attempt._id}/submit`).set(auth(student)).send({ answers });
        return attempt;
    };
    const myAttempt = async (classroom) =>
        (await request(app).get(`/classrooms/${classroom._id}/quizzes`).set(auth(student))).body[0].myAttempt;

    test('without open responses, both totals are the auto-graded score', async () => {
        const { classroom, base } = await setup(questions.slice(0, 2));
        await submitAll(base);
        expect(await myAttempt(classroom)).toMatchObject({ aiScoreAwarded: 2, professorScoreAwarded: 2, professorReviewed: true, totalPointsPossible: 3 });
    });

    test('the AI total waits for AI scores; the professor total is a running score until every open response is marked', async () => {
        const { classroom, base } = await setup();
        const attempt = await submitAll(base);
        expect(await myAttempt(classroom)).toMatchObject({ aiScoreAwarded: null, professorScoreAwarded: 2, professorReviewed: false }); // running score: open response counts 0 for now

        await attemptModel.updateOne({ _id: attempt._id }, { $set: { 'answers.2.aiScore': 4 } });
        expect(await myAttempt(classroom)).toMatchObject({ aiScoreAwarded: 6, professorScoreAwarded: 2, professorReviewed: false });

        await attemptModel.updateOne({ _id: attempt._id }, { $set: { 'answers.2.professorScore': 3 } });
        expect(await myAttempt(classroom)).toMatchObject({ aiScoreAwarded: 6, professorScoreAwarded: 5, professorReviewed: true });
    });
});
