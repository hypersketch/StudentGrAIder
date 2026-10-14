const express = require("express");
const router = express.Router({ mergeParams: true });
const quizModel = require('../models/quizModel')
const attemptModel = require('../models/attemptModel')
const { verifyToken, requireProfessor } = require('../middleware/auth')
const { loadClassroom, loadQuiz, isOwner, isEnrolled } = require('../middleware/loaders')
const { scoreTotals, bestSubmitted } = require('../utilities/grades')
const { finishExpiredAttempts } = require('../utilities/finishAttempt')

// Checks the parts of a save request that the model can't. Drafts only need a name; publishing needs a question too.
// Returns an error message, or null when the request is fine.
const checkSave = ({ title, questions, published }) => {
    if (published !== undefined && typeof published !== 'boolean') return "published must be true or false"
    if (!Array.isArray(questions)) return "questions must be a list"
    if (published === false) return typeof title === 'string' && title.trim() ? null : "Give the draft a name"
    return questions.length === 0 ? "A quiz needs at least one question" : null
}

// Professor creates a quiz in a class they own. published: false saves a draft students can't see.
router.post('/', verifyToken, requireProfessor, loadClassroom, async (req, res) => {
    if (!isOwner(req)) return res.status(403).send({ message: "You do not have permission to do this" })

    const { title, timeLimitMinutes, maxAttempts, dueAt, questions, published = true } = req.body
    const problem = checkSave({ title, questions, published })
    if (problem) return res.status(400).send({ message: problem })

    try {
        const quiz = new quizModel({
            classroomId: req.classroom._id,
            title,
            timeLimitMinutes: timeLimitMinutes || undefined,
            maxAttempts: maxAttempts ?? undefined,
            dueAt: dueAt || undefined,
            published,
            questions,
        })
        // Unfinished drafts are allowed; everything is checked when the quiz is published
        await quiz.save({ validateBeforeSave: published })
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
        const filter = { classroomId: req.classroom._id, ...(!isOwner(req) && { published: { $ne: false } }) }
        const quizzes = await quizModel.find(filter).sort({ createdAt: -1 })

        // Students also get a summary of their own attempts on each quiz
        if (!isOwner(req)) await finishExpiredAttempts({ studentId: req.user.id, quizId: { $in: quizzes.map((q) => q._id) } })
        const attempts = isOwner(req) ? [] : await attemptModel.find({
            studentId: req.user.id,
            quizId: { $in: quizzes.map((q) => q._id) },
        })

        res.send(quizzes.map((q) => {
            const mine = attempts.filter((a) => a.quizId.equals(q._id))
            const attempt = bestSubmitted(mine)
            return {
                _id: q._id,
                title: q.title,
                timeLimitMinutes: q.timeLimitMinutes,
                questionCount: q.questions.length,
                totalPoints: q.totalPoints,
                createdAt: q.createdAt,
                maxAttempts: q.maxAttempts,
                dueAt: q.dueAt,
                ...(isOwner(req) && { published: q.published !== false }),
                ...(!isOwner(req) && {
                    attemptsUsed: mine.length,
                    inProgress: mine.some((a) => a.status === 'in_progress'),
                    // The student's best submitted try (null until they submit one)
                    myAttempt: attempt ? {
                        status: attempt.status,
                        totalScoreAwarded: attempt.totalScoreAwarded,
                        totalPointsPossible: attempt.totalPointsPossible,
                        ...scoreTotals(attempt),
                    } : null,
                }),
            }
        }))
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Students who have submitted at least one attempt. Edits to the quiz only apply to attempts started afterwards.
const countSubmittedStudents = async (quiz) =>
    (await attemptModel.distinct('studentId', { quizId: quiz._id, status: { $ne: 'in_progress' } })).length

// Full quiz, including correct answers, for the professor who owns the class
router.get('/:quizId', verifyToken, requireProfessor, loadClassroom, loadQuiz, async (req, res) => {
    if (!isOwner(req)) return res.status(403).send({ message: "You do not have permission to do this" })
    try {
        res.send({ ...req.quiz.toJSON(), submittedStudents: await countSubmittedStudents(req.quiz) })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Professor replaces a quiz's title, settings, and questions. published: false turns it back into a draft.
// Questions sent back with their questionId keep it, so existing attempts still match up.
router.put('/:quizId', verifyToken, requireProfessor, loadClassroom, loadQuiz, async (req, res) => {
    if (!isOwner(req)) return res.status(403).send({ message: "You do not have permission to do this" })

    const { title, timeLimitMinutes, maxAttempts, dueAt, questions } = req.body
    const published = req.body.published ?? req.quiz.published
    const problem = checkSave({ title, questions, published })
    if (problem) return res.status(400).send({ message: problem })

    try {
        req.quiz.title = title
        req.quiz.timeLimitMinutes = timeLimitMinutes || undefined
        req.quiz.maxAttempts = maxAttempts ?? req.quiz.maxAttempts
        req.quiz.dueAt = dueAt || undefined
        req.quiz.published = published
        req.quiz.questions = questions
        await req.quiz.save({ validateBeforeSave: published })
        res.send(req.quiz)
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).send({ message: Object.values(err.errors)[0].message })
        }
        res.status(500).send({ message: "Internal server error" })
    }
})

// Professor deletes a quiz along with every student's attempts on it, so its scores are gone too
router.delete('/:quizId', verifyToken, requireProfessor, loadClassroom, loadQuiz, async (req, res) => {
    if (!isOwner(req)) return res.status(403).send({ message: "You do not have permission to do this" })

    try {
        const { deletedCount } = await attemptModel.deleteMany({ quizId: req.quiz._id })
        await quizModel.deleteOne({ _id: req.quiz._id })
        res.send({ message: "Quiz deleted", attemptsDeleted: deletedCount })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

module.exports = router;
