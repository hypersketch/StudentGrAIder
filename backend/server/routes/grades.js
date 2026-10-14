const express = require("express");
const router = express.Router({ mergeParams: true });
const quizModel = require('../models/quizModel')
const attemptModel = require('../models/attemptModel')
const userModel = require('../models/userModel')
const { verifyToken, requireProfessor, requireStudent } = require('../middleware/auth')
const { loadClassroom, isOwner, isEnrolled } = require('../middleware/loaders')
const { quizGrade, overallGrade } = require('../utilities/grades')
const { finishExpiredAttempts } = require('../utilities/finishAttempt')

// Mounted at /classrooms/:classroomId/grades. Only published quizzes count; drafts never do.

const publishedQuizzes = (classroom) =>
    quizModel.find({ classroomId: classroom._id, published: { $ne: false } }).sort({ createdAt: 1 })

// Each quiz's grade for one student, plus their overall grade
const gradesFor = (quizzes, attempts, studentId) => {
    const grades = quizzes.map((q) => ({
        quizId: q._id,
        ...quizGrade(q, attempts.filter((a) => a.quizId.equals(q._id) && a.studentId.equals(studentId))),
    }))
    return { grades, overall: overallGrade(grades) }
}

// The professor's gradebook: every enrolled student's grade on every published quiz, plus their overall
router.get('/', verifyToken, requireProfessor, loadClassroom, async (req, res) => {
    if (!isOwner(req)) return res.status(403).send({ message: "You do not have permission to do this" })

    try {
        const quizzes = await publishedQuizzes(req.classroom)
        await finishExpiredAttempts({ quizId: { $in: quizzes.map((q) => q._id) } })
        const students = await userModel.find({ _id: { $in: req.classroom.students } }, 'name email').sort({ name: 1 })
        const attempts = await attemptModel.find({ quizId: { $in: quizzes.map((q) => q._id) }, studentId: { $in: req.classroom.students } })

        res.send({
            classroom: { _id: req.classroom._id, courseCode: req.classroom.courseCode, className: req.classroom.className },
            quizzes: quizzes.map((q) => ({ _id: q._id, title: q.title, dueAt: q.dueAt, totalPoints: q.totalPoints })),
            students: students.map((s) => ({ _id: s._id, name: s.name, email: s.email, ...gradesFor(quizzes, attempts, s._id) })),
        })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// A student's own grades in the class: one per published quiz, plus their overall
router.get('/mine', verifyToken, requireStudent, loadClassroom, async (req, res) => {
    if (!isEnrolled(req)) return res.status(403).send({ message: "You are not enrolled in this class" })

    try {
        const quizzes = await publishedQuizzes(req.classroom)
        await finishExpiredAttempts({ quizId: { $in: quizzes.map((q) => q._id) }, studentId: req.user.id })
        const attempts = await attemptModel.find({ quizId: { $in: quizzes.map((q) => q._id) }, studentId: req.user.id })
        res.send(gradesFor(quizzes, attempts, req.user.id))
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

module.exports = router;
