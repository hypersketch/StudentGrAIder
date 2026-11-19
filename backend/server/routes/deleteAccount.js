const express = require("express");
const router = express.Router();
const bcrypt = require('bcrypt')
const userModel = require('../models/userModel')
const classroomModel = require('../models/classroomModel')
const quizModel = require('../models/quizModel')
const attemptModel = require('../models/attemptModel')
const { verifyToken } = require('../middleware/auth')

// A logged-in user deletes their own account. Body: { password } to confirm it's really them.
// Professors lose every class they own with its quizzes and all student attempts on them.
// Students lose their quiz attempts and leave every class and join request.
router.delete('/me', verifyToken, async (req, res) => {
    const { password } = req.body || {}
    if (typeof password !== 'string' || !password) return res.status(400).send({ message: "Enter your password to delete your account" })

    try {
        const user = await userModel.findById(req.user.id)
        if (!user) return res.status(404).send({ message: "This account no longer exists" })

        const isPasswordValid = await bcrypt.compare(password, user.password)
        if (!isPasswordValid) return res.status(401).send({ message: "Password is incorrect" })

        const deleted = { classesDeleted: 0, quizzesDeleted: 0, attemptsDeleted: 0 }
        if (user.role === 'professor') {
            const classIds = await classroomModel.find({ professorId: user._id }).distinct('_id')
            const quizIds = await quizModel.find({ classroomId: { $in: classIds } }).distinct('_id')
            deleted.attemptsDeleted = (await attemptModel.deleteMany({ quizId: { $in: quizIds } })).deletedCount
            deleted.quizzesDeleted = (await quizModel.deleteMany({ classroomId: { $in: classIds } })).deletedCount
            deleted.classesDeleted = (await classroomModel.deleteMany({ _id: { $in: classIds } })).deletedCount
        } else {
            deleted.attemptsDeleted = (await attemptModel.deleteMany({ studentId: user._id })).deletedCount
            await classroomModel.updateMany(
                { $or: [{ students: user._id }, { pendingStudents: user._id }] },
                { $pull: { students: user._id, pendingStudents: user._id } }
            )
        }

        await userModel.deleteOne({ _id: user._id })
        res.send({ message: "Account deleted", ...deleted })
    } catch (err) {
        res.status(500).send({ message: "Internal server error" })
    }
})

module.exports = router;
