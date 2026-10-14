// Professor grading of open responses, and how edits to a quiz affect attempts already submitted
const {
    useTestDatabase,
    request, app, attemptModel, professor, student, otherStudent, auth, questions, setup, start,
} = require('./quizFixtures');

useTestDatabase();

describe('professor grading open responses', () => {
    const userModel = require('../models/userModel');

    // student submits: multiple choice right (2), true/false wrong (0), open response answered (5 pts possible)
    async function submitted() {
        const ctx = await setup();
        await userModel.create({ _id: student.id, name: 'Sam', email: 'sam@example.com', password: 'hash', role: 'student' });
        const { body: attempt } = await start(ctx.base);
        const ids = ctx.quiz.questions.map((q) => q.questionId);
        await request(app).post(`${ctx.base}/${attempt._id}/submit`).set(auth(student)).send({
            answers: [
                { questionId: ids[0], selectedOptionIndex: 1 },
                { questionId: ids[1], selectedOptionIndex: 0 },
                { questionId: ids[2], responseText: 'Mass attracts mass' },
            ],
        });
        const review = (correct, user = professor) => request(app)
            .post(`${ctx.base}/${attempt._id}/answers/${ids[2]}/review`).set(auth(user)).send({ correct });
        return { ...ctx, attempt, review };
    }

    test('professor lists submitted attempts with student names', async () => {
        const { base } = await submitted();
        await start(base, otherStudent); // still in progress, so not listed
        const res = await request(app).get(base).set(auth(professor));
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({ studentName: 'Sam', studentEmail: 'sam@example.com', status: 'submitted', totalScoreAwarded: 2 });
    });

    test('marking correct gives full points and finishes grading; it can be changed to incorrect', async () => {
        const { review } = await submitted();
        const right = await review(true);
        expect(right.status).toBe(200);
        expect(right.body.status).toBe('graded');
        expect(right.body.totalScoreAwarded).toBe(7);
        expect(right.body.answers[2]).toMatchObject({ professorScore: 5, pointsAwarded: 5 });
        expect(right.body.answers[2].reviewedAt).toBeDefined();

        const wrong = await review(false);
        expect(wrong.body.totalScoreAwarded).toBe(2);
        expect(wrong.body.answers[2]).toMatchObject({ professorScore: 0, pointsAwarded: 0 });
    });

    test("the professor's mark replaces the AI score in the student's totals", async () => {
        const { classroom, attempt, review } = await submitted();
        await attemptModel.updateOne({ _id: attempt._id }, { $set: { 'answers.2.aiScore': 1 } });
        await review(true);
        const { body } = await request(app).get(`/classrooms/${classroom._id}/quizzes`).set(auth(student));
        expect(body[0].myAttempt).toMatchObject({ aiScoreAwarded: 3, professorScoreAwarded: 7, totalScoreAwarded: 7, status: 'graded' });
    });

    test('rejects a missing decision, multiple-choice answers, and anyone but the owning professor', async () => {
        const { base, attempt, quiz, review } = await submitted();
        expect((await review(undefined)).status).toBe(400);
        const mc = await request(app).post(`${base}/${attempt._id}/answers/${quiz.questions[0].questionId}/review`)
            .set(auth(professor)).send({ correct: true });
        expect(mc.status).toBe(404);
        expect((await review(true, student)).status).toBe(403);
        expect((await request(app).get(base).set(auth(student))).status).toBe(403);
    });
});

describe('editing a quiz after students submit', () => {
    const userModel = require('../models/userModel');

    async function submittedThenEdited() {
        const ctx = await setup();
        await userModel.create({ _id: student.id, name: 'Sam', email: 'sam@example.com', password: 'hash', role: 'student' });
        const { body: attempt } = await start(ctx.base);
        const ids = ctx.quiz.questions.map((q) => q.questionId);
        await request(app).post(`${ctx.base}/${attempt._id}/submit`).set(auth(student)).send({
            answers: [{ questionId: ids[0], selectedOptionIndex: 1 }, { questionId: ids[2], responseText: 'Mass attracts mass' }],
        });
        return { ...ctx, attempt, ids, quizUrl: `/classrooms/${ctx.classroom._id}/quizzes/${ctx.quiz._id}` };
    }
    const save = (quizUrl, qs) => request(app).put(quizUrl).set(auth(professor)).send({ title: 'Quiz 1', questions: qs });

    test('the full quiz says how many students already submitted', async () => {
        const { quizUrl, base } = await submittedThenEdited();
        await start(base, otherStudent); // still in progress, so not counted
        expect((await request(app).get(quizUrl).set(auth(professor))).body.submittedStudents).toBe(1);
    });

    test('an attempt keeps the questions and points the student saw', async () => {
        const { quiz, quizUrl, attempt, ids, base } = await submittedThenEdited();
        // Open response goes from 5 to 10 points, and a new open response is added
        const kept = quiz.questions.map((q) => q.toObject());
        kept[2].points = 10;
        expect((await save(quizUrl, [...kept, { type: 'open_response', text: 'New one', points: 4 }])).status).toBe(200);

        const res = await request(app).post(`${base}/${attempt._id}/answers/${ids[2]}/review`).set(auth(professor)).send({ correct: true });
        expect(res.status).toBe(200);
        expect(res.body.answers).toHaveLength(3);
        expect(res.body.answers[2]).toMatchObject({ text: 'Explain gravity', points: 5, professorScore: 5 });
        expect(res.body.totalScoreAwarded).toBe(7);
        expect(res.body.totalPointsPossible).toBe(8);
        expect(res.body.status).toBe('graded');
    });

    test('an open response can still be graded after its question is deleted', async () => {
        const { quiz, quizUrl, attempt, ids, base } = await submittedThenEdited();
        await save(quizUrl, quiz.questions.slice(0, 2).map((q) => q.toObject()));
        const res = await request(app).post(`${base}/${attempt._id}/answers/${ids[2]}/review`).set(auth(professor)).send({ correct: false });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('graded');
    });
});
