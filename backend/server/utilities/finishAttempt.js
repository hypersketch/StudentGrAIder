const attemptModel = require('../models/attemptModel')
const quizModel = require('../models/quizModel')
const { queueAIGrading } = require('./aiGrading')

// Extra time after the deadline for answers already on their way (slow connections, the browser's own auto-submit)
const GRACE_MS = 20 * 1000
const MAX_RESPONSE_LENGTH = 20000

// When an attempt started at startedAt must be in: the end of the time limit or the due date, whichever is first.
// undefined when the quiz has neither.
const deadlineFor = (quiz, startedAt) => {
    const ends = [
        quiz.timeLimitMinutes && startedAt.getTime() + quiz.timeLimitMinutes * 60000,
        quiz.dueAt && quiz.dueAt.getTime(),
    ].filter(Boolean)
    return ends.length ? new Date(Math.min(...ends)) : undefined
}

const isPastDeadline = (attempt, now = Date.now()) => !!attempt.deadlineAt && now > attempt.deadlineAt.getTime() + GRACE_MS

// Keeps only the fields a student can send for each answer, and cuts very long text
const cleanAnswers = (answers) => (Array.isArray(answers) ? answers : [])
    .filter((a) => a && a.questionId)
    .slice(0, 500)
    .map((a) => ({
        questionId: String(a.questionId),
        ...(Number.isInteger(a.selectedOptionIndex) && { selectedOptionIndex: a.selectedOptionIndex }),
        ...(typeof a.responseText === 'string' && { responseText: a.responseText.slice(0, MAX_RESPONSE_LENGTH) }),
    }))

// Grades one question. Multiple choice / true-false are scored now; open responses wait for the AI or professor.
// Keeps a copy of the question so later edits to the quiz don't change this attempt.
const gradeAnswer = (question, submitted = {}) => {
    const answer = {
        questionId: question.questionId,
        type: question.type,
        text: question.text,
        points: question.points,
        options: question.options,
        pointsAwarded: 0,
    }

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

// Locks in and grades an in-progress attempt. Questions with no matching answer count as unanswered.
// Only the first finish counts, so a late submit and the server's own auto-submit can't both grade it.
// Returns the finished attempt, or null if it was already finished.
const finishAttempt = async (attempt, quiz, answers, { autoSubmitted = false } = {}) => {
    const given = cleanAnswers(answers)
    const graded = quiz.questions.map((q) => gradeAnswer(q, given.find((a) => a.questionId === String(q.questionId))))

    const { modifiedCount } = await attemptModel.updateOne(
        { _id: attempt._id, status: 'in_progress' },
        {
            $set: {
                answers: graded,
                totalScoreAwarded: graded.reduce((sum, a) => sum + a.pointsAwarded, 0),
                totalPointsPossible: quiz.totalPoints,
                submittedAt: new Date(),
                autoSubmitted,
                // Fully graded unless an open response still needs a score
                status: quiz.questions.some((q) => q.type === 'open_response') ? 'submitted' : 'graded',
            },
            $unset: { savedAnswers: 1 },
        }
    )
    if (!modifiedCount) return null

    // Open responses get a first-pass AI score in the background (when AI grading is set up)
    if (quiz.questions.some((q) => q.type === 'open_response')) queueAIGrading(attempt._id)
    return attemptModel.findById(attempt._id)
}

// Submits every attempt whose time ran out, using the answers saved before the deadline.
// filter narrows it down (e.g. { quizId } or { studentId }). Returns how many were submitted.
const finishExpiredAttempts = async (filter = {}) => {
    const expired = await attemptModel.find({
        ...filter,
        status: 'in_progress',
        deadlineAt: { $lt: new Date(Date.now() - GRACE_MS) },
    })
    let finished = 0
    for (const attempt of expired) {
        const quiz = await quizModel.findById(attempt.quizId)
        if (quiz && await finishAttempt(attempt, quiz, attempt.savedAnswers, { autoSubmitted: true })) finished++
    }
    return finished
}

module.exports = { GRACE_MS, deadlineFor, isPastDeadline, cleanAnswers, finishAttempt, finishExpiredAttempts }
