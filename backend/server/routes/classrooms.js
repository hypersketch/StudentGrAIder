const express = require("express");
const router = express.Router();
const classroomModel = require('../models/classroomModel')
const { classroomValidation } = require('../models/classroomValidator')
const { verifyToken, requireProfessor } = require('../middleware/auth')

// Professor creates a class they own
router.post('/', verifyToken, requireProfessor, async (req, res) => {
    const { error, data } = classroomValidation(req.body);
    if (error) return res.status(400).send({ message: error.errors[0].message });

    try {
        const classroom = await classroomModel.create({
            className: data.className,
            courseCode: data.courseCode,
            professorId: req.user.id,
        })
        res.status(201).send(classroom)
    } catch (err) {
        if (err.code === 11000) return res.status(409).send({ message: "You already have a class with that course code" })
        res.status(500).send({ message: "Internal server error" })
    }
})

// Professors get the classes they teach, students get the classes they're enrolled in
router.get('/', verifyToken, async (req, res) => {
    const filter = req.user.role === 'professor' ? { professorId: req.user.id } : { students: req.user.id }

    try {
        const classrooms = await classroomModel.find(filter).sort({ courseCode: 1 })
        res.send(classrooms)
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

module.exports = router;
