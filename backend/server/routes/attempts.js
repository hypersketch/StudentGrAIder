const express = require("express");
const mongoose = require("mongoose");
const router = express.Router({ mergeParams: true });
const attemptModel = require('../models/attemptModel')
const { verifyToken, requireStudent } = require('../middleware/auth')
const { loadClassroom, loadQuiz, isEnrolled } = require('../middleware/loaders')

// Mounted at /classrooms/:classroomId/quizzes/:quizId/attempts. Students only, and only in classes
// they're enrolled in. One attempt per student per quiz.

const requireEnrolled = (req, res, next) => {
    if (!isEnrolled(req)) return res.status(403).send({ message: "You are not enrolled in this class" })
    next()
}

const studentOnly = [verifyToken, requireStudent, loadClassroom, loadQuiz, requireEnrolled]

// The quiz as a student sees it: no correct answers or sample answers
const quizForStudent = (quiz) => ({
    _id: quiz._id,
    title: quiz.title,
    timeLimitMinutes: quiz.timeLimitMinutes,
    totalPoints: quiz.totalPoints,
    questions: quiz.questions.map((q) => ({
        questionId: q.questionId,
        type: q.type,
        text: q.text,
        options: q.options,
        points: q.points,
    })),
})

const findMyAttempt = (req) => attemptModel.findOne({ quizId: req.quiz._id, studentId: req.user.id })

// The quiz (without answers) plus the student's attempt, or attempt: null if they haven't started
router.get('/mine', ...studentOnly, async (req, res) => {
    try {
        const attempt = await findMyAttempt(req)
        res.send({ quiz: quizForStudent(req.quiz), attempt })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Starts the quiz (the time limit counts from now). Returns the existing attempt instead if there is one.
router.post('/', ...studentOnly, async (req, res) => {
    try {
        const existing = await findMyAttempt(req)
        if (existing) return res.send(existing)

        const attempt = await attemptModel.create({
            quizId: req.quiz._id,
            studentId: req.user.id,
            totalPointsPossible: req.quiz.totalPoints,
        })
        res.status(201).send(attempt)
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Grades one question. Multiple choice / true-false are scored now; open responses wait for the AI grader.
const gradeAnswer = (question, submitted = {}) => {
    const answer = { questionId: question.questionId, type: question.type, pointsAwarded: 0 }

    if (question.type === 'open_response') {
        answer.responseText = typeof submitted.responseText === 'string' ? submitted.responseText.trim() : ''
        return answer
    }

    const index = submitted.selectedOptionIndex
    if (Number.isInteger(index) && index >= 0 && index < question.options.length) {
        answer.selectedOptionIndex = index
        answer.isCorrect = index === question.correctOptionIndex
        answer.pointsAwarded = answer.isCorrect ? question.points : 0
    } else {
        // Unanswered
        answer.isCorrect = false
    }
    return answer
}

// Locks in the answers and grades them. Body: { answers: [{ questionId, selectedOptionIndex | responseText }] }
// Questions with no matching answer count as unanswered.
router.post('/:attemptId/submit', ...studentOnly, async (req, res) => {
    const { attemptId } = req.params
    if (!mongoose.isValidObjectId(attemptId)) return res.status(404).send({ message: "Attempt not found" })

    try {
        const attempt = await attemptModel.findOne({ _id: attemptId, quizId: req.quiz._id, studentId: req.user.id })
        if (!attempt) return res.status(404).send({ message: "Attempt not found" })
        if (attempt.status !== 'in_progress') return res.status(409).send({ message: "This quiz has already been submitted" })

        const submitted = Array.isArray(req.body.answers) ? req.body.answers : []
        const submittedFor = (questionId) => submitted.find((a) => a && String(a.questionId) === String(questionId))

        attempt.answers = req.quiz.questions.map((q) => gradeAnswer(q, submittedFor(q.questionId)))
        attempt.totalScoreAwarded = attempt.answers.reduce((sum, a) => sum + a.pointsAwarded, 0)
        attempt.totalPointsPossible = req.quiz.totalPoints
        attempt.submittedAt = new Date()
        // Fully graded unless an open response still needs a score
        attempt.status = req.quiz.questions.some((q) => q.type === 'open_response') ? 'submitted' : 'graded'

        await attempt.save()
        res.send(attempt)
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

module.exports = router;
