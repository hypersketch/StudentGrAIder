// AI grading of open responses. Claude is replaced with a fake grader, so these tests check how AI grades are
// applied (and never call the real, paid API).
const {
    useTestDatabase,
    request, app, attemptModel, professor, student, auth, questions, setup, start,
} = require('./quizFixtures');

jest.mock('../utilities/aiGrader', () => ({
    ...jest.requireActual('../utilities/aiGrader'),
    isAiGradingEnabled: jest.fn(() => true),
    gradeOpenResponse: jest.fn(),
}));
const { isAiGradingEnabled, gradeOpenResponse, parseGrade } = require('../utilities/aiGrader');
const { gradeAttemptWithAI } = require('../utilities/aiGrading');

useTestDatabase();
beforeEach(() => {
    isAiGradingEnabled.mockReturnValue(true);
    gradeOpenResponse.mockReset();
});

// A submitted attempt: multiple choice right (2 of 2), true/false wrong (0 of 1), open response waiting (5 possible)
async function submitted() {
    const ctx = await setup();
    const [mc, tf, open] = ctx.quiz.questions;
    const attempt = await attemptModel.create({
        quizId: ctx.quiz._id, studentId: student.id, status: 'submitted', totalPointsPossible: 8, totalScoreAwarded: 2,
        answers: [
            { questionId: mc.questionId, type: mc.type, points: 2, selectedOptionIndex: 1, isCorrect: true, pointsAwarded: 2 },
            { questionId: tf.questionId, type: tf.type, points: 1, selectedOptionIndex: 0, isCorrect: false, pointsAwarded: 0 },
            { questionId: open.questionId, type: open.type, text: open.text, points: 5, responseText: 'Things with mass pull on each other', pointsAwarded: 0 },
        ],
    });
    return { ...ctx, attempt, aiGradeUrl: `${ctx.base}/${attempt._id}/ai-grade` };
}

describe('gradeAttemptWithAI', () => {
    test("saves the AI's score and feedback, counts the points, and marks the attempt graded", async () => {
        gradeOpenResponse.mockResolvedValue({ score: 3.5, feedback: 'Good start; mention distance.' });
        const { attempt } = await submitted();

        expect(await gradeAttemptWithAI(attempt._id)).toEqual({ graded: 1, errors: [] });
        expect(gradeOpenResponse).toHaveBeenCalledWith({
            question: 'Explain gravity', sampleAnswer: 'Mass attracts mass', points: 5, response: 'Things with mass pull on each other',
        });

        const saved = await attemptModel.findById(attempt._id);
        expect(saved.answers[2]).toMatchObject({ aiScore: 3.5, aiFeedback: 'Good start; mention distance.', pointsAwarded: 3.5 });
        expect(saved.totalScoreAwarded).toBe(5.5);
        expect(saved.status).toBe('graded');
    });

    test("never overrides the professor's score, and doesn't re-grade answers the AI already scored", async () => {
        gradeOpenResponse.mockResolvedValue({ score: 5, feedback: 'Great.' });
        const { attempt } = await submitted();
        await attemptModel.updateOne({ _id: attempt._id }, { $set: { 'answers.2.professorScore': 1, 'answers.2.pointsAwarded': 1 } });

        await gradeAttemptWithAI(attempt._id);
        const saved = await attemptModel.findById(attempt._id);
        expect(saved.answers[2]).toMatchObject({ aiScore: 5, professorScore: 1, pointsAwarded: 1 });
        expect(saved.totalScoreAwarded).toBe(3);

        await gradeAttemptWithAI(attempt._id);
        expect(gradeOpenResponse).toHaveBeenCalledTimes(1);
    });

    test('when the AI fails, the answer simply waits for the professor', async () => {
        gradeOpenResponse.mockRejectedValue(new Error('network down'));
        const { attempt } = await submitted();
        expect(await gradeAttemptWithAI(attempt._id)).toEqual({ graded: 0, errors: ['network down'] });
        const saved = await attemptModel.findById(attempt._id);
        expect(saved.answers[2].aiScore).toBeUndefined();
        expect(saved.status).toBe('submitted');
    });

    test('does nothing when AI grading is not set up', async () => {
        isAiGradingEnabled.mockReturnValue(false);
        const { attempt } = await submitted();
        expect(await gradeAttemptWithAI(attempt._id)).toEqual({ graded: 0, errors: [] });
        expect(gradeOpenResponse).not.toHaveBeenCalled();
    });

    test('submitting a quiz with an open response starts AI grading by itself', async () => {
        gradeOpenResponse.mockResolvedValue({ score: 4, feedback: 'Nice.' });
        const { base, quiz } = await setup();
        const { body: attempt } = await start(base);
        await request(app).post(`${base}/${attempt._id}/submit`).set(auth(student)).send({
            answers: [{ questionId: quiz.questions[2].questionId, responseText: 'Mass attracts mass' }],
        });

        // It runs in the background, so wait for it
        let saved;
        for (let i = 0; i < 50 && !(saved && saved.answers[2].aiScore != null); i++) {
            await new Promise((resolve) => setTimeout(resolve, 20));
            saved = await attemptModel.findById(attempt._id);
        }
        expect(saved.answers[2]).toMatchObject({ aiScore: 4, pointsAwarded: 4 });
    });
});

describe('POST .../attempts/:id/ai-grade', () => {
    test('professor re-runs AI grading and gets the updated attempt', async () => {
        gradeOpenResponse.mockResolvedValue({ score: 2, feedback: 'Partly right.' });
        const { aiGradeUrl } = await submitted();
        const res = await request(app).post(aiGradeUrl).set(auth(professor));
        expect(res.status).toBe(200);
        expect(res.body.answers[2]).toMatchObject({ aiScore: 2, aiFeedback: 'Partly right.' });
    });

    test('explains when AI grading is not set up, or when the AI fails', async () => {
        const { aiGradeUrl } = await submitted();

        isAiGradingEnabled.mockReturnValue(false);
        const off = await request(app).post(aiGradeUrl).set(auth(professor));
        expect(off.status).toBe(409);
        expect(off.body.message).toMatch(/ANTHROPIC_API_KEY/);

        isAiGradingEnabled.mockReturnValue(true);
        gradeOpenResponse.mockRejectedValue(new Error('The AI declined to grade this answer'));
        const failed = await request(app).post(aiGradeUrl).set(auth(professor));
        expect(failed.status).toBe(502);
        expect(failed.body.message).toMatch(/declined/);
    });

    test('only the owning professor can run it', async () => {
        const { aiGradeUrl } = await submitted();
        expect((await request(app).post(aiGradeUrl).set(auth(student))).status).toBe(403);
    });

    test('the full quiz tells the professor whether AI grading is set up', async () => {
        const { classroom, quiz } = await setup(questions);
        const { body } = await request(app).get(`/classrooms/${classroom._id}/quizzes/${quiz._id}`).set(auth(professor));
        expect(body.aiGradingEnabled).toBe(true);
    });
});

describe('parseGrade', () => {
    test("keeps the score between 0 and the question's points, rounded to 2 decimals", () => {
        expect(parseGrade('{"score": 3.456, "feedback": " ok "}', 5)).toEqual({ score: 3.46, feedback: 'ok' });
        expect(parseGrade('{"score": 9, "feedback": "x"}', 5).score).toBe(5);
        expect(parseGrade('{"score": -2, "feedback": "x"}', 5).score).toBe(0);
    });

    test('rejects output that is not a grade', () => {
        expect(() => parseGrade('{"score": "lots", "feedback": "x"}', 5)).toThrow();
        expect(() => parseGrade('not json', 5)).toThrow();
    });
});
