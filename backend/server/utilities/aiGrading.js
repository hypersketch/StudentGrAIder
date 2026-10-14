const attemptModel = require('../models/attemptModel')
const quizModel = require('../models/quizModel')
const { isAiGradingEnabled, gradeOpenResponse } = require('./aiGrader')

// Recomputes an attempt's total and status in a single database step, so it can't clash with a professor
// grading the same attempt at the same moment. Graded once every open response has a professor or AI score.
const refreshTotals = (attemptId) => attemptModel.updateOne({ _id: attemptId, status: { $ne: 'in_progress' } }, [{
    $set: {
        totalScoreAwarded: { $sum: '$answers.pointsAwarded' },
        status: {
            $cond: [
                {
                    $allElementsTrue: [{
                        $map: {
                            input: '$answers',
                            as: 'a',
                            in: {
                                $or: [
                                    { $ne: ['$$a.type', 'open_response'] },
                                    { $ne: [{ $ifNull: ['$$a.professorScore', null] }, null] },
                                    { $ne: [{ $ifNull: ['$$a.aiScore', null] }, null] },
                                ],
                            },
                        },
                    }],
                },
                'graded',
                'submitted',
            ],
        },
    },
}])

// Has the AI grade every open response on a submitted attempt that doesn't have an AI score yet.
// Each answer is saved as soon as it's graded. The AI's points only count while the professor hasn't scored
// that answer; the professor's score always wins. Returns how many answers were graded and any errors.
const gradeAttemptWithAI = async (attemptId) => {
    const result = { graded: 0, errors: [] }
    if (!isAiGradingEnabled()) return result

    const attempt = await attemptModel.findById(attemptId)
    if (!attempt || attempt.status === 'in_progress') return result
    const quiz = await quizModel.findById(attempt.quizId)

    for (const answer of attempt.answers) {
        if (answer.type !== 'open_response' || answer.aiScore != null) continue

        // The question as the student saw it; the sample answer comes from the quiz (it isn't shown to students)
        const current = quiz?.questions.find((q) => String(q.questionId) === String(answer.questionId))
        const points = answer.points ?? current?.points
        if (points == null) continue

        try {
            const { score, feedback } = await gradeOpenResponse({
                question: answer.text ?? current?.text ?? '',
                sampleAnswer: current?.sampleAnswer,
                points,
                response: answer.responseText,
            })
            const qid = answer.questionId
            await attemptModel.updateOne(
                { _id: attempt._id },
                { $set: { 'answers.$[a].aiScore': score, 'answers.$[a].aiFeedback': feedback } },
                { arrayFilters: [{ 'a.questionId': qid }] }
            )
            // Only counts toward the total if the professor hasn't scored this answer
            await attemptModel.updateOne(
                { _id: attempt._id },
                { $set: { 'answers.$[a].pointsAwarded': score } },
                { arrayFilters: [{ 'a.questionId': qid, 'a.professorScore': null }] }
            )
            result.graded++
        } catch (err) {
            result.errors.push(err.message)
        }
    }

    if (result.graded) await refreshTotals(attempt._id)
    return result
}

// Starts AI grading in the background so submitting isn't held up. Failures are logged; the answers
// simply wait for the professor (who can also re-run AI grading from the grading page).
const queueAIGrading = (attemptId) => {
    if (!isAiGradingEnabled()) return
    gradeAttemptWithAI(attemptId)
        .then(({ errors }) => { if (errors.length) console.log(`AI grading had problems on attempt ${attemptId}: ${errors.join('; ')}`) })
        .catch((err) => console.log(`AI grading failed on attempt ${attemptId}: ${err.message}`))
}

module.exports = { gradeAttemptWithAI, queueAIGrading, refreshTotals }
