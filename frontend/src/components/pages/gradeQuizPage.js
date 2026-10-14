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

    const mark = async (questionId, correct) => {
        setSaving(true);
        setError('');
        try {
            const { data } = await api.post(`${reviewUrl}/${questionId}/review`, { correct });
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

            {openAnswers.length > 0 && (
                <div className="flex flex-col gap-4 mt-4">
                    {openAnswers.map((a) => {
                        // Attempts from before question copies were saved fall back to the quiz as it is now
                        const q = questionFor(a.questionId);
                        const text = a.text ?? q?.text;
                        const points = a.points ?? q?.points;
                        const decision = a.professorScore == null ? null : a.professorScore > 0;
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
                                {a.aiScore != null && decision == null && (
                                    <p className="mb-3 text-sm text-white/90">AI score: {a.aiScore} / {points}</p>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => mark(a.questionId, true)}
                                        disabled={saving}
                                        aria-pressed={decision === true}
                                        className={`py-1.5 rounded-[3px] bg-grader-mint text-black hover:brightness-110 disabled:opacity-60 ${
                                            decision === true ? 'ring-2 ring-white font-bold' : decision === false ? 'opacity-50' : ''
                                        }`}
                                    >
                                        ✓ Correct
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => mark(a.questionId, false)}
                                        disabled={saving}
                                        aria-pressed={decision === false}
                                        className={`py-1.5 rounded-[3px] bg-[rgb(233,73,73)] text-white hover:brightness-110 disabled:opacity-60 ${
                                            decision === false ? 'ring-2 ring-white font-bold' : decision === true ? 'opacity-50' : ''
                                        }`}
                                    >
                                        ✗ Incorrect
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {error && <p className="mt-3 mb-0 text-sm text-red-600">{error}</p>}
        </div>
    );
};

export default GradeQuizPage;
