const express = require("express");
const router = express.Router({ mergeParams: true });
const quizModel = require('../models/quizModel')
const attemptModel = require('../models/attemptModel')
const { verifyToken, requireProfessor } = require('../middleware/auth')
const { loadClassroom, loadQuiz, isOwner, isEnrolled } = require('../middleware/loaders')

// Professor creates a quiz in a class they own
router.post('/', verifyToken, requireProfessor, loadClassroom, async (req, res) => {
    if (!isOwner(req)) return res.status(403).send({ message: "You do not have permission to do this" })

    const { title, timeLimitMinutes, questions } = req.body
    if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).send({ message: "A quiz needs at least one question" })
    }

    try {
        const quiz = await quizModel.create({
            classroomId: req.classroom._id,
            title,
            timeLimitMinutes: timeLimitMinutes || undefined,
            questions,
        })
        res.status(201).send(quiz)
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).send({ message: Object.values(err.errors)[0].message })
        }
        res.status(500).send({ message: "Internal server error" })
    }
})

// Lists a class's quizzes (summary only, no questions or answers) for its professor or enrolled students
router.get('/', verifyToken, loadClassroom, async (req, res) => {
    if (!isOwner(req) && !isEnrolled(req)) return res.status(403).send({ message: "You do not have permission to do this" })

    try {
        const quizzes = await quizModel.find({ classroomId: req.classroom._id }).sort({ createdAt: -1 })

        // Students also get their own attempt on each quiz (or null if they haven't started it)
        const attempts = isOwner(req) ? [] : await attemptModel.find({
            studentId: req.user.id,
            quizId: { $in: quizzes.map((q) => q._id) },
        })
        const attemptFor = (quizId) => attempts.find((a) => a.quizId.equals(quizId))

        res.send(quizzes.map((q) => {
            const attempt = attemptFor(q._id)
            return {
                _id: q._id,
                title: q.title,
                timeLimitMinutes: q.timeLimitMinutes,
                questionCount: q.questions.length,
                totalPoints: q.totalPoints,
                createdAt: q.createdAt,
                ...(!isOwner(req) && {
                    myAttempt: attempt ? {
                        status: attempt.status,
                        totalScoreAwarded: attempt.totalScoreAwarded,
                        totalPointsPossible: attempt.totalPointsPossible,
                    } : null,
                }),
            }
        }))
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Full quiz, including correct answers, for the professor who owns the class
router.get('/:quizId', verifyToken, requireProfessor, loadClassroom, loadQuiz, async (req, res) => {
    if (!isOwner(req)) return res.status(403).send({ message: "You do not have permission to do this" })
    res.send(req.quiz)
})

// Professor replaces a quiz's title, time limit, and questions.
// Questions sent back with their questionId keep it, so existing attempts still match up.
router.put('/:quizId', verifyToken, requireProfessor, loadClassroom, loadQuiz, async (req, res) => {
    if (!isOwner(req)) return res.status(403).send({ message: "You do not have permission to do this" })

    const { title, timeLimitMinutes, questions } = req.body
    if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).send({ message: "A quiz needs at least one question" })
    }

    try {
        req.quiz.title = title
        req.quiz.timeLimitMinutes = timeLimitMinutes || undefined
        req.quiz.questions = questions
        await req.quiz.save()
        res.send(req.quiz)
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).send({ message: Object.values(err.errors)[0].message })
        }
        res.status(500).send({ message: "Internal server error" })
    }
})

module.exports = router;
