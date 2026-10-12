const express = require("express");
const mongoose = require("mongoose");
const router = express.Router({ mergeParams: true });
const classroomModel = require('../models/classroomModel')
const quizModel = require('../models/quizModel')
const { verifyToken, requireProfessor } = require('../middleware/auth')

// Loads the class from :classroomId into req.classroom, or responds 404
const loadClassroom = async (req, res, next) => {
    const { classroomId } = req.params
    if (!mongoose.isValidObjectId(classroomId)) return res.status(404).send({ message: "Class not found" })

    try {
        req.classroom = await classroomModel.findById(classroomId)
        if (!req.classroom) return res.status(404).send({ message: "Class not found" })
        next()
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
}

const isOwner = (req) => req.classroom.professorId.equals(req.user.id)
const isEnrolled = (req) => req.classroom.students.some((id) => id.equals(req.user.id))

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
        res.send(quizzes.map((q) => ({
            _id: q._id,
            title: q.title,
            timeLimitMinutes: q.timeLimitMinutes,
            questionCount: q.questions.length,
            totalPoints: q.totalPoints,
            createdAt: q.createdAt,
        })))
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Loads :quizId into req.quiz if it belongs to the class from loadClassroom, or responds 404
const loadQuiz = async (req, res, next) => {
    const { quizId } = req.params
    if (!mongoose.isValidObjectId(quizId)) return res.status(404).send({ message: "Quiz not found" })

    try {
        req.quiz = await quizModel.findOne({ _id: quizId, classroomId: req.classroom._id })
        if (!req.quiz) return res.status(404).send({ message: "Quiz not found" })
        next()
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
}

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
