// Shared setup for the quiz test files: a test app, made-up users, and a class with one quiz.
// Not a test file itself (Jest only runs files ending in .test.js).
const request = require('supertest');
const mongoose = require('mongoose');
const { buildApp, connect, disconnect, clearDB } = require('./testSetup');
const { generateAccessToken } = require('../utilities/generateToken');
const classroomModel = require('../models/classroomModel');
const quizModel = require('../models/quizModel');
const attemptModel = require('../models/attemptModel');

const app = buildApp();

// Call at the top of a test file: fresh in-memory database for the file, emptied before each test
const useTestDatabase = () => {
    beforeAll(async () => { await connect(); });
    afterAll(async () => { await disconnect(); });
    beforeEach(async () => { await clearDB(); });
};

// Logins for made-up users; the routes trust the token, so most tests don't need real user records
const tokenFor = (role, id = new mongoose.Types.ObjectId()) =>
    ({ id, token: generateAccessToken(id, `${role}@example.com`, 'Test', role) });

const professor = tokenFor('professor');
const student = tokenFor('student');
const otherStudent = tokenFor('student');
const outsider = tokenFor('student');
const auth = ({ token }) => ({ Authorization: `Bearer ${token}` });

const questions = [
    { type: 'multiple_choice', text: '2 + 2?', options: ['3', '4', '5'], correctOptionIndex: 1, points: 2 },
    { type: 'true_false', text: 'The sky is green', correctOptionIndex: 1, points: 1 },
    { type: 'open_response', text: 'Explain gravity', sampleAnswer: 'Mass attracts mass', points: 5 },
];

// A class with `student` and `otherStudent` enrolled and one quiz; returns the attempts base url
async function setup(quizQuestions = questions) {
    const classroom = await classroomModel.create({
        className: 'Physics', courseCode: 'PHY1', professorId: professor.id, students: [student.id, otherStudent.id],
    });
    const quiz = await quizModel.create({ classroomId: classroom._id, title: 'Quiz 1', questions: quizQuestions });
    return { classroom, quiz, base: `/classrooms/${classroom._id}/quizzes/${quiz._id}/attempts` };
}

const start = (base, user = student) => request(app).post(base).set(auth(user));

module.exports = {
    request, mongoose, app, useTestDatabase, clearDB,
    classroomModel, quizModel, attemptModel,
    tokenFor, professor, student, otherStudent, outsider, auth,
    questions, setup, start,
};
