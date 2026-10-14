import React, { useState, useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import getUserInfo from '../../utilities/decodeJwt';
import api, { errorMessage } from '../../utilities/api';
import percent from '../../utilities/percent';

// Professor grades a quiz's submissions (/classes/:classId/quizzes/:quizId/grade).
// Multiple choice and true/false are graded automatically; each open response gets a Correct / Incorrect mark here.
// Each attempt is graded on the questions the student actually got, saved with the attempt when they submitted.
const GradeQuizPage = () => {
    const { classId, quizId } = useParams();
    const [user] = useState(() => getUserInfo());
    const [quiz, setQuiz] = useState();
    const [attempts, setAttempts] = useState();
    const [loadError, setLoadError] = useState('');

    const isProfessor = user?.role === 'professor';
    const quizUrl = `/classrooms/${classId}/quizzes/${quizId}`;

    useEffect(() => {
        if (!isProfessor) return;
        Promise.all([api.get(quizUrl), api.get(`${quizUrl}/attempts`)])
            .then(([quizRes, attemptsRes]) => {
                setQuiz(quizRes.data);
                setAttempts(attemptsRes.data);
            })
            .catch((err) => setLoadError(errorMessage(err)));
    }, [quizUrl, isProfessor]);

    if (!isProfessor) return <Navigate to="/" replace />;

    const openAnswers = (attempt) => attempt.answers.filter((a) => a.type === 'open_response');
    const needsGrading = (attempt) => openAnswers(attempt).some((a) => a.professorScore == null);
    const waiting = attempts ? attempts.filter(needsGrading).length : 0;
    const anyOpen = attempts ? attempts.some((a) => openAnswers(a).length > 0) : false;

    // Swaps in the graded attempt, keeping the student's name and email from the list
    const handleReviewed = (updated) =>
        setAttempts((prev) => prev.map((a) => (a._id === updated._id ? { ...a, ...updated } : a)));

    return (
        <div className="flex flex-col min-h-screen font-sans">
            {/* Top bar */}
            <header className="min-h-[15vh] bg-grader-navy text-white p-[15px] flex flex-col">
                <Link to={`/classes/${classId}/quizzes/${quizId}`} className="text-sm text-white/80 hover:text-white no-underline self-start">
                    ← Back to quiz
                </Link>
                <h1 className="text-[1.4em] font-bold text-center my-auto">Grading - {quiz?.title || 'Quiz'}</h1>
            </header>

            {loadError ? (
                <p className="p-10 text-center text-grader-muted">{loadError}</p>
            ) : !quiz || !attempts ? (
                <p className="p-10 text-center text-grader-muted">Loading submissions…</p>
            ) : (
                <main className="flex-1 flex flex-col items-center px-5 pt-10 pb-10 gap-6">
                    <p className="w-full max-w-xl text-center text-grader-muted m-0">
                        {attempts.length === 0
                            ? 'No one has submitted this quiz yet.'
                            : !anyOpen
                                ? 'No open-response answers to grade, so everything was graded automatically.'
                                : waiting === 0
                                    ? `All ${attempts.length} submission${attempts.length === 1 ? ' is' : 's are'} graded.`
                                    : `${waiting} of ${attempts.length} submission${attempts.length === 1 ? '' : 's'} need grading.`}
                    </p>
                    {anyOpen && !quiz.aiGradingEnabled && (
                        <p className="w-full max-w-xl text-center text-xs text-grader-muted m-0">
                            AI grading is off. Add ANTHROPIC_API_KEY to the backend's .env to get a first-pass AI score on every open response.
                        </p>
                    )}

                    {attempts.map((attempt) => (
                        <Submission
                            key={attempt._id}
                            attempt={attempt}
                            quiz={quiz}
                            openAnswers={openAnswers(attempt)}
                            needsGrading={needsGrading(attempt)}
                            reviewUrl={`${quizUrl}/attempts/${attempt._id}/answers`}
                            onReviewed={handleReviewed}
                        />
                    ))}
                </main>
            )}
        </div>
    );
};

// One student's attempt: their score, then each open-response answer with Correct / Incorrect buttons
const Submission = ({ attempt, quiz, openAnswers, needsGrading, reviewUrl, onReviewed }) => {
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const questionFor = (questionId) => quiz.questions.find((q) => q.questionId === questionId);
    // Questions the professor added after this attempt was submitted. They don't count toward it.
    const addedLater = quiz.questions.filter((q) => !attempt.answers.some((a) => a.questionId === q.questionId)).length;

    // body is { correct: true | false } for full points or 0, or { points } for partial credit
    const mark = async (questionId, body) => {
        setSaving(true);
        setError('');
        try {
            const { data } = await api.post(`${reviewUrl}/${questionId}/review`, body);
            onReviewed(data);
        } catch (err) {
            setError(errorMessage(err));
        }
        setSaving(false);
    };

    // Asks the AI to grade any open responses on this attempt that it hasn't scored yet
    const runAiGrading = async () => {
        setSaving('ai');
        setError('');
        try {
            const { data } = await api.post(`${reviewUrl.replace(/\/answers$/, '')}/ai-grade`);
            onReviewed(data);
        } catch (err) {
            setError(errorMessage(err));
        }
        setSaving(false);
    };

    return (
        <div className="w-full max-w-xl border border-grader-text rounded-md p-5 bg-white">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-bold text-grader-text m-0 break-words">{attempt.studentName}</p>
                    <p className="text-sm text-grader-muted m-0 break-words">
                        {attempt.studentEmail}
                        {quiz.maxAttempts > 1 && ` · attempt ${attempt.attemptNumber}`}
                    </p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-[1.3em] font-bold text-grader-navy m-0">
                        {needsGrading ? '--' : percent(attempt.totalScoreAwarded, attempt.totalPointsPossible)}
                    </p>
                    <p className={`text-sm font-bold m-0 ${needsGrading ? 'text-[rgb(233,73,73)]' : 'text-green-700'}`}>
                        {needsGrading ? 'Needs grading' : 'Graded'}
                    </p>
                </div>
            </div>

            {addedLater > 0 && (
                <p className="mt-3 mb-0 text-sm text-grader-muted italic">
                    {addedLater} question{addedLater === 1 ? ' was' : 's were'} added after this attempt - not counted.
                </p>
            )}

            {/* AI grading runs by itself after each submit; this retries it or catches up older attempts */}
            {quiz.aiGradingEnabled && openAnswers.some((a) => a.aiScore == null) && (
                <button
                    type="button"
                    onClick={runAiGrading}
                    disabled={saving}
                    className="mt-3 px-2.5 py-1 rounded-[3px] border border-grader-navy text-grader-navy text-sm font-bold hover:bg-grader-navy hover:text-white disabled:opacity-60"
                >
                    {saving === 'ai' ? 'AI is grading…' : 'Run AI grading'}
                </button>
            )}

            {openAnswers.length > 0 && (
                <div className="flex flex-col gap-4 mt-4">
                    {openAnswers.map((a) => {
                        // Attempts from before question copies were saved fall back to the quiz as it is now
                        const q = questionFor(a.questionId);
                        const text = a.text ?? q?.text;
                        const points = a.points ?? q?.points;
                        // true = full points, false = 0, 'partial' = anything in between, null = not graded yet
                        const decision = a.professorScore == null
                            ? null
                            : a.professorScore >= points ? true : a.professorScore === 0 ? false : 'partial';
                        return (
                            <div key={a.questionId} className="bg-grader-navy text-white rounded-md p-4">
                                <div className="flex items-center justify-between mb-2 text-sm">
                                    <span className="font-bold">Open response{!q && ' (since removed from the quiz)'}</span>
                                    <span>{points} pt{points === 1 ? '' : 's'}</span>
                                </div>
                                <p className="bg-gray-400 text-black text-center py-2.5 px-3 mb-3 rounded-[3px] whitespace-pre-wrap">{text}</p>

                                <p className="text-xs text-white/80 mb-1">Student's answer</p>
                                <p className="mb-3 whitespace-pre-wrap">{a.responseText || <em className="text-white/60">No answer</em>}</p>

                                {q?.sampleAnswer && (
                                    <>
                                        <p className="text-xs text-white/80 mb-1">Sample answer</p>
                                        <p className="mb-3 text-sm text-white/90 whitespace-pre-wrap">{q.sampleAnswer}</p>
                                    </>
                                )}
                                {/* The AI's first pass: a suggestion until the professor gives their own score */}
                                {a.aiScore != null && (
                                    <div className="mb-3 px-3 py-2 rounded-[3px] bg-white/10 text-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-bold">AI score: {a.aiScore} / {points}</span>
                                            {a.professorScore !== a.aiScore && (
                                                <button
                                                    type="button"
                                                    onClick={() => mark(a.questionId, { points: a.aiScore })}
                                                    disabled={saving}
                                                    className="px-2 py-0.5 rounded-[3px] bg-white text-grader-navy text-xs font-bold disabled:opacity-60"
                                                >
                                                    Use AI score
                                                </button>
                                            )}
                                        </div>
                                        {a.aiFeedback && <p className="mt-1 mb-0 text-white/90">{a.aiFeedback}</p>}
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => mark(a.questionId, { correct: true })}
                                        disabled={saving}
                                        aria-pressed={decision === true}
                                        className={`py-1.5 rounded-[3px] bg-grader-mint text-black hover:brightness-110 disabled:opacity-60 ${
                                            decision === true ? 'ring-2 ring-white font-bold' : decision != null ? 'opacity-50' : ''
                                        }`}
                                    >
                                        ✓ Correct
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => mark(a.questionId, { correct: false })}
                                        disabled={saving}
                                        aria-pressed={decision === false}
                                        className={`py-1.5 rounded-[3px] bg-[rgb(233,73,73)] text-white hover:brightness-110 disabled:opacity-60 ${
                                            decision === false ? 'ring-2 ring-white font-bold' : decision != null ? 'opacity-50' : ''
                                        }`}
                                    >
                                        ✗ Incorrect
                                    </button>
                                </div>
                                <PointsInput
                                    id={`points-${attempt._id}-${a.questionId}`}
                                    score={a.professorScore}
                                    points={points}
                                    partial={decision === 'partial'}
                                    saving={saving}
                                    onSave={(value) => mark(a.questionId, { points: value })}
                                />
                            </div>
                        );
                    })}
                </div>
            )}

            {error && <p className="mt-3 mb-0 text-sm text-red-600">{error}</p>}
        </div>
    );
};

// Partial credit: type any score from 0 to the question's points (decimals allowed) and press Save or Enter.
// Shows the current score, whichever way it was given.
const PointsInput = ({ id, score, points, partial, saving, onSave }) => {
    const current = score == null ? '' : String(score);
    const [value, setValue] = useState(current);
    useEffect(() => setValue(current), [current]);
    const changed = value.trim() !== '' && value !== current;

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (changed) onSave(Number(value));
            }}
            className="flex items-center gap-2 mt-3 text-sm"
        >
            <label htmlFor={id} className="text-white/80">Points</label>
            <input
                id={id}
                type="number"
                min="0"
                max={points}
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={`w-20 px-2 py-1 rounded-[3px] text-black ${partial ? 'ring-2 ring-white font-bold' : ''}`}
            />
            <span>/ {points}</span>
            <button
                type="submit"
                disabled={!changed || saving}
                className="px-2 py-1 rounded-[3px] bg-white text-grader-navy font-bold disabled:opacity-50"
            >
                Save
            </button>
            {partial && <span className="text-white/80">Partial credit</span>}
        </form>
    );
};

export default GradeQuizPage;
