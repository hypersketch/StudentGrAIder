// Scoring rules shared by the quiz cards and the gradebook, so they always agree.

// Points for the student's two score boxes. Multiple choice / true-false count toward both.
//   AI total:        open responses use aiScore; null until the AI has scored every one.
//   Professor total: open responses use professorScore, counting 0 until the professor marks them, so the
//                    student sees a running score right after submitting. professorReviewed says when it's final.
const scoreTotals = (attempt) => {
    if (attempt.status === 'in_progress') return { aiScoreAwarded: null, professorScoreAwarded: null, professorReviewed: false }

    const autoPoints = attempt.answers.reduce((sum, a) => sum + (a.type === 'open_response' ? 0 : a.pointsAwarded), 0)
    const open = attempt.answers.filter((a) => a.type === 'open_response')

    return {
        aiScoreAwarded: open.every((a) => a.aiScore != null) ? autoPoints + open.reduce((sum, a) => sum + a.aiScore, 0) : null,
        professorScoreAwarded: autoPoints + open.reduce((sum, a) => sum + (a.professorScore ?? 0), 0),
        professorReviewed: open.every((a) => a.professorScore != null),
    }
}

// The submitted attempt with the highest score (the latest one on a tie), or null
const bestSubmitted = (attempts) => attempts
    .filter((a) => a.status !== 'in_progress')
    .reduce((best, a) => (!best || a.totalScoreAwarded >= best.totalScoreAwarded ? a : best), null)

// One student's grade on one quiz, from all their attempts on it:
//   graded:      best attempt is fully graded
//   pending:     best attempt still has open responses to grade (they count as 0 for now)
//   missed:      past the due date with nothing submitted, counts as 0%
//   in_progress: started, nothing submitted yet, doesn't count yet
//   not_taken:   not started and not due yet, doesn't count yet
// percent is 0-100 (unrounded), or null when the quiz doesn't count yet.
const quizGrade = (quiz, attempts, now = new Date()) => {
    const best = bestSubmitted(attempts)
    if (best) {
        if (!best.totalPointsPossible) return { status: 'graded', percent: null }
        const { professorScoreAwarded, professorReviewed } = scoreTotals(best)
        return {
            status: professorReviewed ? 'graded' : 'pending',
            percent: (professorScoreAwarded / best.totalPointsPossible) * 100,
        }
    }
    if (attempts.some((a) => a.status === 'in_progress')) return { status: 'in_progress', percent: null }
    if (quiz.dueAt && quiz.dueAt <= now) return { status: 'missed', percent: 0 }
    return { status: 'not_taken', percent: null }
}

// Every quiz counts the same, whatever its points: the overall grade is the average of the quiz percentages
// that count so far. null when none count yet.
const overallGrade = (grades) => {
    const counted = grades.filter((g) => g.percent != null)
    return counted.length ? counted.reduce((sum, g) => sum + g.percent, 0) / counted.length : null
}

module.exports = { scoreTotals, bestSubmitted, quizGrade, overallGrade }
