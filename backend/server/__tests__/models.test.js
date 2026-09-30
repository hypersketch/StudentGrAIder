const mongoose = require('mongoose');
const { connect, disconnect, clearDB } = require('./testSetup');
const classroomModel = require('../models/classroomModel');
const quizModel = require('../models/quizModel');
const attemptModel = require('../models/attemptModel');

beforeAll(async () => {
    await connect();
    await classroomModel.syncIndexes();
});
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await clearDB(); });

const id = () => new mongoose.Types.ObjectId();

describe('classrooms', () => {
    test('saves with professorId, students and createdAt', async () => {
        const student = id();
        const saved = await classroomModel.create({
            className: 'Software Engineering', courseCode: 'csc521', professorId: id(), students: [student]
        });
        expect(saved.courseCode).toBe('CSC521');
        expect(saved.students[0].equals(student)).toBe(true);
        expect(saved.createdAt).toBeDefined();
    });

    test('rejects the same course code twice for one professor', async () => {
        const professorId = id();
        await classroomModel.create({ className: 'A', courseCode: 'CSC521', professorId });
        await expect(classroomModel.create({ className: 'B', courseCode: 'CSC521', professorId })).rejects.toThrow();
    });
});

describe('quizzes', () => {
    const baseQuiz = () => ({ classroomId: id(), title: 'Quiz 1', timeLimitMinutes: 20 });

    test('saves all three question types and totals the points', async () => {
        const quiz = await quizModel.create({
            ...baseQuiz(),
            questions: [
                { type: 'multiple_choice', text: '2 + 2?', options: ['3', '4', '5'], correctOptionIndex: 1, points: 2 },
                { type: 'true_false', text: 'The sky is blue', correctOptionIndex: 0, points: 1 },
                { type: 'open_response', text: 'Explain recursion', sampleAnswer: 'A function that calls itself until a base case', points: 5 },
            ]
        });
        const [mc, tf, open] = quiz.questions;
        expect(mc.questionId).toBeDefined();
        expect(open.sampleAnswer).toBe('A function that calls itself until a base case');
        expect(tf.options).toEqual(['True', 'False']);
        expect(open.options).toBeUndefined();
        expect(open.correctOptionIndex).toBeUndefined();
        expect(quiz.totalPoints).toBe(8);
    });

    test('drops sampleAnswer from non open-response questions', async () => {
        const quiz = await quizModel.create({
            ...baseQuiz(),
            questions: [{ type: 'multiple_choice', text: 'Q', options: ['a', 'b'], correctOptionIndex: 0, sampleAnswer: 'a' }]
        });
        expect(quiz.questions[0].sampleAnswer).toBeUndefined();
    });

    test('rejects multiple choice with fewer than 2 options', async () => {
        await expect(quizModel.create({
            ...baseQuiz(),
            questions: [{ type: 'multiple_choice', text: 'Q', options: ['only one'], correctOptionIndex: 0 }]
        })).rejects.toThrow(/at least 2 options/);
    });

    test('rejects correctOptionIndex outside the options', async () => {
        await expect(quizModel.create({
            ...baseQuiz(),
            questions: [{ type: 'multiple_choice', text: 'Q', options: ['a', 'b'], correctOptionIndex: 2 }]
        })).rejects.toThrow(/correctOptionIndex/);
    });

    test('rejects true/false without a correct answer', async () => {
        await expect(quizModel.create({
            ...baseQuiz(),
            questions: [{ type: 'true_false', text: 'Q' }]
        })).rejects.toThrow(/correctOptionIndex/);
    });

    test('rejects unknown question types', async () => {
        await expect(quizModel.create({
            ...baseQuiz(),
            questions: [{ type: 'essay', text: 'Q' }]
        })).rejects.toThrow();
    });
});

describe('attempts', () => {
    test('saves answers for all three types with defaults', async () => {
        const attempt = await attemptModel.create({
            quizId: id(),
            studentId: id(),
            totalPointsPossible: 8,
            answers: [
                { questionId: id(), type: 'multiple_choice', selectedOptionIndex: 1, isCorrect: true, pointsAwarded: 2 },
                { questionId: id(), type: 'true_false', selectedOptionIndex: 0, isCorrect: true, pointsAwarded: 1 },
                { questionId: id(), type: 'open_response', responseText: 'A function that calls itself', aiScore: 4, aiFeedback: 'Good' },
            ]
        });
        expect(attempt.status).toBe('in_progress');
        expect(attempt.startedAt).toBeDefined();
        expect(attempt.totalScoreAwarded).toBe(0);
        expect(attempt.answers[2].professorScore).toBeUndefined();
    });

    test('rejects an unknown status', async () => {
        await expect(attemptModel.create({
            quizId: id(), studentId: id(), totalPointsPossible: 1, status: 'finished'
        })).rejects.toThrow();
    });
});
