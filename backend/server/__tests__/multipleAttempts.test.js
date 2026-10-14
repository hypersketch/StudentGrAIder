// Quizzes that allow more than one try
const {
    useTestDatabase,
    request, app, quizModel, professor, student, auth, questions, setup, start,
} = require('./quizFixtures');

useTestDatabase();

describe('multiple attempts', () => {
    // Submits a try: multiple choice right or wrong, true/false wrong
    const submitTry = async (base, quiz, mcRight) => {
        const { body: attempt } = await start(base);
        const ids = quiz.questions.map((q) => q.questionId);
        return request(app).post(`${base}/${attempt._id}/submit`).set(auth(student)).send({
            answers: [{ questionId: ids[0], selectedOptionIndex: mcRight ? 1 : 0 }, { questionId: ids[1], selectedOptionIndex: 0 }],
        });
    };

    test('one attempt by default; starting again after submitting is refused', async () => {
        const { base, quiz } = await setup(questions.slice(0, 2));
        await submitTry(base, quiz, true);
        const again = await start(base);
        expect(again.status).toBe(409);
        expect(again.body.message).toMatch(/used all 1 attempt/);
    });

    test('with more tries allowed, each new start is the next attempt, until they run out', async () => {
        const { base, quiz } = await setup(questions.slice(0, 2));
        await quizModel.updateOne({ _id: quiz._id }, { maxAttempts: 2 });

        expect((await submitTry(base, quiz, false)).body.attemptNumber).toBe(1);
        const second = await submitTry(base, quiz, true);
        expect(second.body.attemptNumber).toBe(2);
        expect((await start(base)).status).toBe(409);

        const { body: mine } = await request(app).get(`${base}/mine`).set(auth(student));
        expect(mine.attemptsUsed).toBe(2);
        expect(mine.attempt._id).toBe(second.body._id);
        expect(mine.quiz.maxAttempts).toBe(2);
    });

    test('the quiz card shows the best try', async () => {
        const { classroom, base, quiz } = await setup(questions.slice(0, 2));
        await quizModel.updateOne({ _id: quiz._id }, { maxAttempts: 3 });
        await submitTry(base, quiz, true);  // 2 points
        await submitTry(base, quiz, false); // 0 points
        await start(base);                  // third try in progress

        const { body } = await request(app).get(`/classrooms/${classroom._id}/quizzes`).set(auth(student));
        expect(body[0]).toMatchObject({ attemptsUsed: 3, maxAttempts: 3, inProgress: true });
        expect(body[0].myAttempt).toMatchObject({ totalScoreAwarded: 2, professorScoreAwarded: 2 });
    });

    test('professor sets the number of tries when creating or editing a quiz', async () => {
        const { classroom, quiz } = await setup();
        const url = `/classrooms/${classroom._id}/quizzes`;
        const created = await request(app).post(url).set(auth(professor)).send({ title: 'Q2', maxAttempts: 3, questions: questions.slice(0, 1) });
        expect(created.body.maxAttempts).toBe(3);

        const edited = await request(app).put(`${url}/${quiz._id}`).set(auth(professor)).send({ title: 'Quiz 1', maxAttempts: 5, questions });
        expect(edited.body.maxAttempts).toBe(5);
        const zero = await request(app).put(`${url}/${quiz._id}`).set(auth(professor)).send({ title: 'Quiz 1', maxAttempts: 0, questions });
        expect(zero.status).toBe(400);
    });
});
