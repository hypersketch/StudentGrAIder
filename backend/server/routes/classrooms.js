const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const classroomModel = require('../models/classroomModel')
const { DEFAULT_STUDENT_LIMIT } = classroomModel
const userModel = require('../models/userModel')
const { classroomValidation, classroomSettingsValidation } = require('../models/classroomValidator')
const { verifyToken, requireProfessor, requireStudent } = require('../middleware/auth')
const { loadClassroom, isOwner, isEnrolled } = require('../middleware/loaders')

const SEARCH_LIMIT = 10
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Use after verifyToken + loadClassroom
const requireOwner = (req, res, next) => {
    if (!isOwner(req)) return res.status(403).send({ message: "You do not have permission to do this" })
    next()
}

const fullMessage = (classroom) => `This class is full (${classroom.students.length}/${classroom.studentLimit})`

// Professor creates a class they own
router.post('/', verifyToken, requireProfessor, async (req, res) => {
    const { error, data } = classroomValidation(req.body);
    if (error) return res.status(400).send({ message: error.errors[0].message });

    try {
        const classroom = await classroomModel.create({
            className: data.className,
            courseCode: data.courseCode,
            studentLimit: data.studentLimit,
            professorId: req.user.id,
        })
        res.status(201).send(classroom)
    } catch (err) {
        if (err.code === 11000) return res.status(409).send({ message: "You already have a class with that course code" })
        res.status(500).send({ message: "Internal server error" })
    }
})

// Professors get the classes they teach (with pending join requests), students get the classes they're enrolled in
router.get('/', verifyToken, async (req, res) => {
    const isProfessor = req.user.role === 'professor'
    const filter = isProfessor ? { professorId: req.user.id } : { students: req.user.id }

    try {
        const classrooms = await classroomModel.find(filter).select(isProfessor ? '' : '-pendingStudents').sort({ courseCode: 1 })
        res.send(classrooms)
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Students search every class by "courseCode className professorName", e.g. ?q=10 or ?q=101 bob.
// Each word typed has to appear somewhere in that text. Results say whether the student is
// already enrolled or has a request waiting.
router.get('/search', verifyToken, requireStudent, async (req, res) => {
    const words = String(req.query.q || '').trim().split(/\s+/).filter(Boolean).slice(0, 5).map((w) => w.slice(0, 50))
    if (words.length === 0) return res.send([])

    try {
        const studentId = new mongoose.Types.ObjectId(req.user.id)
        const matches = await classroomModel.aggregate([
            // Classes whose professor no longer exists drop out here
            { $lookup: { from: 'users', localField: 'professorId', foreignField: '_id', as: 'professor' } },
            { $unwind: '$professor' },
            { $addFields: { label: { $concat: ['$courseCode', ' ', '$className', ' ', '$professor.name'] } } },
            { $match: { $and: words.map((w) => ({ label: { $regex: escapeRegex(w), $options: 'i' } })) } },
            { $sort: { courseCode: 1, className: 1 } },
            { $limit: SEARCH_LIMIT },
            {
                $project: {
                    courseCode: 1,
                    className: 1,
                    professorName: '$professor.name',
                    enrolled: { $in: [studentId, { $ifNull: ['$students', []] }] },
                    requested: { $in: [studentId, { $ifNull: ['$pendingStudents', []] }] },
                    full: {
                        $gte: [{ $size: { $ifNull: ['$students', []] } }, { $ifNull: ['$studentLimit', DEFAULT_STUDENT_LIMIT] }],
                    },
                },
            },
        ])

        res.send(matches.map(({ enrolled, requested, full, ...c }) => ({
            ...c,
            status: enrolled ? 'enrolled' : requested ? 'requested' : full ? 'full' : null,
        })))
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Student asks to join a class; the professor approves or declines it below
router.post('/:classroomId/join-requests', verifyToken, requireStudent, loadClassroom, async (req, res) => {
    if (isEnrolled(req)) return res.status(409).send({ message: "You are already in this class" })
    if (req.classroom.students.length >= req.classroom.studentLimit) return res.status(409).send({ message: fullMessage(req.classroom) })

    try {
        await classroomModel.updateOne({ _id: req.classroom._id }, { $addToSet: { pendingStudents: req.user.id } })
        res.status(201).send({ status: 'requested' })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// The students waiting to join, for the professor who owns the class
router.get('/:classroomId/join-requests', verifyToken, requireProfessor, loadClassroom, requireOwner, async (req, res) => {
    try {
        const students = await userModel.find({ _id: { $in: req.classroom.pendingStudents } }, 'name email').sort({ name: 1 })
        res.send(students)
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Loads :studentId if that student has a request waiting on this class, or responds 404
const loadRequest = (req, res, next) => {
    const { studentId } = req.params
    const waiting = mongoose.isValidObjectId(studentId) && req.classroom.pendingStudents.some((id) => id.equals(studentId))
    if (!waiting) return res.status(404).send({ message: "No join request from that student" })
    next()
}

// Professor approves a request: the student moves into the class, unless it's full
router.post('/:classroomId/join-requests/:studentId/approve', verifyToken, requireProfessor, loadClassroom, requireOwner, loadRequest, async (req, res) => {
    const { studentId } = req.params
    try {
        // The limit is checked in the same update, so two quick approvals can't go over it
        const { modifiedCount } = await classroomModel.updateOne(
            {
                _id: req.classroom._id,
                $expr: { $lt: [{ $size: { $ifNull: ['$students', []] } }, { $ifNull: ['$studentLimit', DEFAULT_STUDENT_LIMIT] }] },
            },
            { $pull: { pendingStudents: studentId }, $addToSet: { students: studentId } }
        )
        if (modifiedCount === 0) {
            const latest = await classroomModel.findById(req.classroom._id)
            if (latest.students.length < latest.studentLimit) return res.status(404).send({ message: "No join request from that student" })
            return res.status(409).send({ message: `${fullMessage(latest)}. Raise the limit or remove a student first.` })
        }
        res.send({ message: "Student added to the class" })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Professor declines a request
router.delete('/:classroomId/join-requests/:studentId', verifyToken, requireProfessor, loadClassroom, requireOwner, loadRequest, async (req, res) => {
    try {
        await classroomModel.updateOne({ _id: req.classroom._id }, { $pull: { pendingStudents: req.params.studentId } })
        res.send({ message: "Request declined" })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Professor changes a class's settings. Body: { studentLimit }
router.patch('/:classroomId', verifyToken, requireProfessor, loadClassroom, requireOwner, async (req, res) => {
    const { error, data } = classroomSettingsValidation(req.body);
    if (error) return res.status(400).send({ message: error.errors[0].message });

    const enrolled = req.classroom.students.length
    if (data.studentLimit < enrolled) {
        return res.status(400).send({ message: `${enrolled} students are already enrolled. Remove some before lowering the limit below ${enrolled}.` })
    }

    try {
        req.classroom.studentLimit = data.studentLimit
        await req.classroom.save()
        res.send(req.classroom)
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// The class roster (name + email) for the professor who owns the class
router.get('/:classroomId/students', verifyToken, requireProfessor, loadClassroom, requireOwner, async (req, res) => {
    try {
        const students = await userModel.find({ _id: { $in: req.classroom.students } }, 'name email').sort({ name: 1 })
        res.send(students)
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Professor removes a student from the class. Their past quiz attempts are kept.
router.delete('/:classroomId/students/:studentId', verifyToken, requireProfessor, loadClassroom, requireOwner, async (req, res) => {
    const { studentId } = req.params
    const enrolled = mongoose.isValidObjectId(studentId) && req.classroom.students.some((id) => id.equals(studentId))
    if (!enrolled) return res.status(404).send({ message: "That student isn't in this class" })

    try {
        await classroomModel.updateOne({ _id: req.classroom._id }, { $pull: { students: studentId } })
        res.send({ message: "Student removed from the class" })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

// Student drops a class they're in. Their past quiz attempts are kept, so they come back if they rejoin.
router.delete('/:classroomId/enrollment', verifyToken, requireStudent, loadClassroom, async (req, res) => {
    if (!isEnrolled(req)) return res.status(404).send({ message: "You aren't in this class" })

    try {
        await classroomModel.updateOne({ _id: req.classroom._id }, { $pull: { students: req.user.id } })
        res.send({ message: "You dropped the class" })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

module.exports = router;
