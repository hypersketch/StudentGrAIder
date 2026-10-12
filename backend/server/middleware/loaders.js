const mongoose = require("mongoose");
const classroomModel = require('../models/classroomModel')
const quizModel = require('../models/quizModel')

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

// Use after verifyToken + loadClassroom
const isOwner = (req) => req.classroom.professorId.equals(req.user.id)
const isEnrolled = (req) => req.classroom.students.some((id) => id.equals(req.user.id))

module.exports = { loadClassroom, loadQuiz, isOwner, isEnrolled }
