const express = require("express");
const mongoose = require("mongoose");
const router = express.Router({ mergeParams: true });
const attemptModel = require('../models/attemptModel')
const userModel = require('../models/userModel')
const { deadlineFor, isPastDeadline, cleanAnswers, finishAttempt, finishExpiredAttempts } = require('../utilities/finishAttempt')
const { verifyToken, requireStudent, requireProfessor } = require('../middleware/auth')
const { loadClassroom, loadQuiz, isEnrolled, isOwner } = require('../middleware/loaders')

// Mounted at /classrooms/:classroomId/quizzes/:quizId/attempts. Students take the quiz here (only in classes
// they're enrolled in, up to the quiz's maxAttempts tries); the professor who owns the class reviews submissions here.

const requireEnrolled = (req, res, next) => {
    if (!isEnrolled(req)) return res.status(403).send({ message: "You are not enrolled in this class" })
    next()
}

const requireOwner = (req, res, next) => {
    if (!isOwner(req)) return res.status(403).send({ message: "You do not have permission to do this" })
    next()
}

// Drafts don't exist as far as students are concerned
const requirePublished = (req, res, next) => {
    if (req.quiz.published === false) return res.status(404).send({ message: "Quiz not found" })
    next()
}

const studentOnly = [verifyToken, requireStudent, loadClassroom, loadQuiz, requireEnrolled, requirePublished]
const ownerOnly = [verifyToken, requireProfessor, loadClassroom, loadQuiz, requireOwner]

// The quiz as a student sees it: no correct answers or sample answers
const quizForStudent = (quiz) => ({
    _id: quiz._id,
    title: quiz.title,
    timeLimitMinutes: quiz.timeLimitMinutes,
    maxAttempts: quiz.maxAttempts,
    dueAt: quiz.dueAt,
    totalPoints: quiz.totalPoints,
    questions: quiz.questions.map((q) => ({
        questionId: q.questionId,
        type: q.type,
        text: q.text,
        options: q.options,
        points: q.points,
    })),
})

// The student's attempts on this quiz, oldest first
const findMyAttempts = (req) => attemptModel.find({ quizId: req.quiz._id, studentId: req.user.id }).sort({ attemptNumber: 1 })

// An attempt as the student sees it. Which multiple choice / true-false answers were right or wrong stays
// hidden (only the total shows), so a retake can't be used to work out the correct answers.
const attemptForStudent = (attempt) => {
    if (!attempt) return null
    const { answers, ...rest } = attempt.toJSON()
    return {
        ...rest,
        answers: answers.map(({ isCorrect, pointsAwarded, ...a }) => (a.type === 'open_response' ? { ...a, pointsAwarded } : a)),
    }
}

// The quiz (without answers), the student's latest attempt (or null before their first), and how many tries they've used
router.get('/mine', ...studentOnly, async (req, res) => {
    try {
        await finishExpiredAttempts({ quizId: req.quiz._id, studentId: req.user.id })
        const attempts = await findMyAttempts(req)
        res.send({
            quiz: quizForStudent(req.quiz),
            attempt: attemptForStudent(attempts[attempts.length - 1]),
            attemptsUsed: attempts.length,
            // The countdown runs on the server's clock, not the student's
            serverNow: new Date(),
        })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Starts a try (the time limit counts from now). Returns the one in progress instead if there is one.
router.post('/', ...studentOnly, async (req, res) => {
    try {
        await finishExpiredAttempts({ quizId: req.quiz._id, studentId: req.user.id })
        const attempts = await findMyAttempts(req)
        const inProgress = attempts.find((a) => a.status === 'in_progress')
        if (inProgress) return res.send(attemptForStudent(inProgress))

        if (req.quiz.dueAt && req.quiz.dueAt <= new Date()) {
            return res.status(409).send({ message: "This quiz is past its due date" })
        }

        const max = req.quiz.maxAttempts
        if (attempts.length >= max) {
            return res.status(409).send({ message: `You've used all ${max} attempt${max === 1 ? '' : 's'} on this quiz` })
        }

        const startedAt = new Date()
        const attempt = await attemptModel.create({
            quizId: req.quiz._id,
            studentId: req.user.id,
            attemptNumber: attempts.length + 1,
            startedAt,
            deadlineAt: deadlineFor(req.quiz, startedAt),
            totalPointsPossible: req.quiz.totalPoints,
        })
        res.status(201).send(attemptForStudent(attempt))
    } catch (err) {
        // Two Start clicks at once: the unique index stopped the second, so send back the one that was made
        if (err.code === 11000) {
            const attempts = await findMyAttempts(req)
            return res.send(attemptForStudent(attempts[attempts.length - 1]))
        }
        res.status(500).send({ message: "Internal server error" })
    }
})

// Saves the student's answers as they work, so the server has them if time runs out.
// Body: { answers: [{ questionId, selectedOptionIndex | responseText }] }. Refused once the deadline has passed.
router.put('/:attemptId/answers', ...studentOnly, async (req, res) => {
    const { attemptId } = req.params
    if (!mongoose.isValidObjectId(attemptId)) return res.status(404).send({ message: "Attempt not found" })

    try {
        const attempt = await attemptModel.findOne({ _id: attemptId, quizId: req.quiz._id, studentId: req.user.id })
        if (!attempt) return res.status(404).send({ message: "Attempt not found" })
        if (attempt.status !== 'in_progress') return res.status(409).send({ message: "This quiz has already been submitted" })
        if (isPastDeadline(attempt)) return res.status(409).send({ message: "Time is up, so answers can't be changed" })

        await attemptModel.updateOne({ _id: attempt._id, status: 'in_progress' }, { $set: { savedAnswers: cleanAnswers(req.body.answers) } })
        res.send({ savedAt: new Date() })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Locks in the answers and grades them. Body: { answers: [{ questionId, selectedOptionIndex | responseText }] }
// After the deadline (plus grace), the answers sent are ignored and the last ones saved in time are graded instead.
router.post('/:attemptId/submit', ...studentOnly, async (req, res) => {
    const { attemptId } = req.params
    if (!mongoose.isValidObjectId(attemptId)) return res.status(404).send({ message: "Attempt not found" })

    try {
        const attempt = await attemptModel.findOne({ _id: attemptId, quizId: req.quiz._id, studentId: req.user.id })
        if (!attempt) return res.status(404).send({ message: "Attempt not found" })
        if (attempt.status !== 'in_progress') return res.status(409).send({ message: "This quiz has already been submitted" })

        const late = isPastDeadline(attempt)
        const finished = await finishAttempt(attempt, req.quiz, late ? attempt.savedAnswers : req.body.answers, { autoSubmitted: late })
        if (!finished) return res.status(409).send({ message: "This quiz has already been submitted" })
        res.send(attemptForStudent(finished))
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Every submitted attempt on the quiz, with the student's name and email, for the professor to grade
router.get('/', ...ownerOnly, async (req, res) => {
    try {
        await finishExpiredAttempts({ quizId: req.quiz._id })
        const attempts = await attemptModel.find({ quizId: req.quiz._id, status: { $ne: 'in_progress' } }).lean()
        const students = await userModel.find({ _id: { $in: attempts.map((a) => a.studentId) } }, 'name email').lean()
        const studentFor = (id) => students.find((s) => s._id.equals(id))

        res.send(attempts
            .map((a) => ({ ...a, studentName: studentFor(a.studentId)?.name || 'Unknown student', studentEmail: studentFor(a.studentId)?.email || '' }))
            .sort((a, b) => a.studentName.localeCompare(b.studentName) || a.attemptNumber - b.attemptNumber))
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Professor marks one open-response answer correct (full points) or incorrect (0). Body: { correct: true | false }
// Can be changed later. Their score replaces the AI's for that answer.
router.post('/:attemptId/answers/:questionId/review', ...ownerOnly, async (req, res) => {
    const { attemptId, questionId } = req.params
    const { correct } = req.body
    if (typeof correct !== 'boolean') return res.status(400).send({ message: "Say whether the answer is correct" })
    if (!mongoose.isValidObjectId(attemptId)) return res.status(404).send({ message: "Attempt not found" })

    try {
        const attempt = await attemptModel.findOne({ _id: attemptId, quizId: req.quiz._id })
        if (!attempt) return res.status(404).send({ message: "Attempt not found" })
        if (attempt.status === 'in_progress') return res.status(409).send({ message: "This quiz hasn't been submitted yet" })

        const answer = attempt.answers.find((a) => String(a.questionId) === questionId)
        if (!answer || answer.type !== 'open_response') return res.status(404).send({ message: "No open-response answer for that question" })

        // Points as the student saw them. Attempts from before copies were saved fall back to the quiz.
        const points = answer.points ?? req.quiz.questions.find((q) => String(q.questionId) === questionId)?.points
        if (points == null) return res.status(404).send({ message: "That question is no longer in the quiz" })

        answer.professorScore = correct ? points : 0
        answer.pointsAwarded = answer.professorScore
        answer.reviewedAt = new Date()
        attempt.totalScoreAwarded = attempt.answers.reduce((sum, a) => sum + a.pointsAwarded, 0)
        // Graded once every open response has a score from the professor or the AI
        const allScored = attempt.answers.every((a) => a.type !== 'open_response' || a.professorScore != null || a.aiScore != null)
        attempt.status = allScored ? 'graded' : 'submitted'

        await attempt.save()
        res.send(attempt)
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

module.exports = router;
