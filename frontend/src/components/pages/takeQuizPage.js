import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import getUserInfo from '../../utilities/decodeJwt';
import api, { errorMessage } from '../../utilities/api';
import { formatDue, isPastDue } from '../../utilities/dueDate';
import { holdSession } from '../../utilities/session';

const TYPE_LABELS = {
    multiple_choice: 'Multiple choice',
    true_false: 'True / False',
    open_response: 'Open response',
};

// Answers in progress are kept in the browser so a refresh doesn't lose them
const draftKey = (attemptId) => `quiz-draft-${attemptId}`;
const loadDraft = (attemptId) => {
    try { return JSON.parse(localStorage.getItem(draftKey(attemptId))) || {}; } catch { return {}; }
};
const saveDraft = (attemptId, answers) => {
    try { localStorage.setItem(draftKey(attemptId), JSON.stringify(answers)); } catch { /* storage unavailable */ }
};
const clearDraft = (attemptId) => {
    try { localStorage.removeItem(draftKey(attemptId)); } catch { /* storage unavailable */ }
};

// Answers are kept as { questionId: { selectedOptionIndex | responseText } } here, and as a list on the server
const toList = (answers) => Object.entries(answers).map(([questionId, a]) => ({ questionId, ...a }));
const fromSaved = (saved = []) => Object.fromEntries(saved.map(({ questionId, ...a }) => [questionId, a]));

const isAnswered = (question, answer) =>
    question.type === 'open_response' ? !!answer?.responseText?.trim() : answer?.selectedOptionIndex != null;

const formatTime = (ms) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
};

const sidebar = 'w-64 shrink-0 bg-[#f0f0f0] p-[15px]';
const primaryButton = 'w-full py-2 rounded-[3px] bg-grader-green hover:brightness-110 text-white font-bold disabled:opacity-60';

// Student takes a quiz (/classes/:classId/quizzes/:quizId/take): start screen -> answering -> results
const TakeQuizPage = () => {
    const { classId, quizId } = useParams();
    const [user] = useState(() => getUserInfo());
    const [quiz, setQuiz] = useState();
    const [attempt, setAttempt] = useState();
    const [attemptsUsed, setAttemptsUsed] = useState(0);
    const [answers, setAnswers] = useState({});
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState('');
    const [busy, setBusy] = useState(false);
    const [now, setNow] = useState(Date.now());
    // Server clock minus this computer's clock, so the countdown can't be stretched by changing the computer's time
    const [clockOffset, setClockOffset] = useState(0);
    // Autosave to the server: 'saved', 'saving', or 'error'
    const [saveState, setSaveState] = useState('saved');
    const saveTimer = useRef();
    const submittedRef = useRef(false);

    const base = `/classrooms/${classId}/quizzes/${quizId}/attempts`;
    const backTo = `/?class=${classId}`;
    const isStudent = user?.role === 'student';

    // Loads the quiz as it is now and the student's latest attempt
    const load = useCallback(() => api.get(`${base}/mine`).then(({ data }) => {
        setQuiz(data.quiz);
        setAttempt(data.attempt);
        setAttemptsUsed(data.attemptsUsed);
        setClockOffset(new Date(data.serverNow).getTime() - Date.now());
        // This browser's draft if it has one, otherwise what the server saved (e.g. started on another device)
        const draft = data.attempt?.status === 'in_progress' ? loadDraft(data.attempt._id) : {};
        setAnswers(Object.keys(draft).length ? draft : fromSaved(data.attempt?.savedAnswers));
    }), [base]);

    // Sends the answers to the server shortly after the student stops changing them
    const saveToServer = useCallback((attemptId, next) => {
        clearTimeout(saveTimer.current);
        setSaveState('saving');
        saveTimer.current = setTimeout(() => {
            api.put(`${base}/${attemptId}/answers`, { answers: toList(next) })
                .then(() => setSaveState('saved'))
                .catch(() => setSaveState('error'));
        }, 800);
    }, [base]);
    useEffect(() => () => clearTimeout(saveTimer.current), []);

    useEffect(() => {
        if (!isStudent) return;
        load().catch((err) => setLoadError(errorMessage(err)));
    }, [load, isStudent]);

    const inProgress = attempt?.status === 'in_progress';
    // The server set the deadline when the attempt started (end of the time limit or the due date, whichever
    // is first) and enforces it; this countdown just shows it, on the server's clock
    const deadline = inProgress && attempt.deadlineAt ? new Date(attempt.deadlineAt).getTime() : null;
    const timeLeft = deadline ? deadline - (now + clockOffset) : null;

    // Keep the login fresh for as long as a quiz is open, even if the student is just reading
    useEffect(() => (inProgress ? holdSession() : undefined), [inProgress]);

    const submit = useCallback(async () => {
        if (submittedRef.current) return;
        submittedRef.current = true;
        setBusy(true);
        setError('');
        clearTimeout(saveTimer.current);
        try {
            const { data } = await api.post(`${base}/${attempt._id}/submit`, {
                answers: quiz.questions.map((q) => ({ questionId: q.questionId, ...answers[q.questionId] })),
            });
            clearDraft(attempt._id);
            setAttempt(data);
        } catch (err) {
            submittedRef.current = false;
            setError(errorMessage(err));
        }
        setBusy(false);
    }, [base, attempt, quiz, answers]);

    // Countdown; submits automatically when time runs out
    useEffect(() => {
        if (!deadline) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [deadline]);

    useEffect(() => {
        if (timeLeft != null && timeLeft <= 0) submit();
    }, [timeLeft, submit]);

    if (!isStudent) return <Navigate to="/" replace />;

    // Starts the first try or a retake. Reloads afterwards so a retake gets any changes the professor made.
    const startQuiz = async () => {
        setBusy(true);
        setError('');
        try {
            await api.post(base);
            await load();
            submittedRef.current = false;
            setNow(Date.now());
        } catch (err) {
            setError(errorMessage(err));
        }
        setBusy(false);
    };

    const setAnswer = (questionId, answer) => {
        const next = { ...answers, [questionId]: answer };
        setAnswers(next);
        saveDraft(attempt._id, next);
        saveToServer(attempt._id, next);
    };

    const unanswered = quiz ? quiz.questions.filter((q) => !isAnswered(q, answers[q.questionId])).length : 0;

    const confirmSubmit = () => {
        const message = unanswered
            ? `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Submit anyway?`
            : "Submit your answers? You won't be able to change them afterwards.";
        if (window.confirm(message)) submit();
    };

    return (
        <div className="flex flex-col min-h-screen font-sans">
            {/* Top bar */}
            <header className="min-h-[15vh] bg-grader-navy text-white p-[15px] flex flex-col">
                <div className="flex items-start justify-between">
                    <Link to={backTo} className="text-sm text-white/80 hover:text-white no-underline">
                        ← Back to classes
                    </Link>
                    {timeLeft != null && (
                        <span
                            className={`px-2.5 py-1 rounded-[3px] font-bold tabular-nums ${timeLeft < 60000 ? 'bg-[rgb(233,73,73)]' : 'bg-white/15'}`}
                            aria-live="polite"
                        >
                            ⏱ {formatTime(timeLeft)}
                        </span>
                    )}
                </div>
                <h1 className="text-[1.4em] font-bold text-center my-auto">{quiz?.title || 'Quiz'}</h1>
            </header>

            {loadError ? (
                <p className="p-10 text-center text-grader-muted">{loadError}</p>
            ) : !quiz ? (
                <p className="p-10 text-center text-grader-muted">Loading quiz…</p>
            ) : !attempt ? (
                <StartScreen quiz={quiz} onStart={startQuiz} busy={busy} error={error} />
            ) : inProgress ? (
                <div className="flex flex-1">
                    {/* Left sidebar: jump to a question */}
                    <aside className={sidebar}>
                        <h3 className="text-base font-bold text-grader-muted mb-2">Questions</h3>
                        <div className="grid grid-cols-5 gap-1.5">
                            {quiz.questions.map((q, i) => (
                                <a
                                    key={q.questionId}
                                    href={`#question-${i + 1}`}
                                    className={`flex items-center justify-center h-9 rounded-[3px] text-sm font-bold no-underline ${
                                        isAnswered(q, answers[q.questionId])
                                            ? 'bg-grader-mint text-black'
                                            : 'bg-white text-grader-text border border-grader-border'
                                    }`}
                                    aria-label={`Question ${i + 1}${isAnswered(q, answers[q.questionId]) ? ', answered' : ''}`}
                                >
                                    {i + 1}
                                </a>
                            ))}
                        </div>
                    </aside>

                    {/* Center: questions */}
                    <main className="flex-1 flex flex-col items-center px-5 pt-[50px] pb-10 gap-6">
                        {quiz.questions.map((q, i) => (
                            <QuestionCard
                                key={q.questionId}
                                number={i + 1}
                                question={q}
                                answer={answers[q.questionId]}
                                onAnswer={(a) => setAnswer(q.questionId, a)}
                            />
                        ))}
                    </main>

                    {/* Right sidebar: progress + submit */}
                    <aside className={sidebar}>
                        <h3 className="text-base font-bold text-grader-muted mb-2">Progress</h3>
                        <p className="text-sm text-grader-text mb-1">
                            {quiz.questions.length - unanswered} of {quiz.questions.length} answered
                        </p>
                        <p className="text-sm text-grader-text mb-1">{quiz.totalPoints} points possible</p>
                        <p className={`text-xs mb-4 ${saveState === 'error' ? 'text-red-600 font-bold' : 'text-grader-muted'}`} aria-live="polite">
                            {saveState === 'saving'
                                ? 'Saving…'
                                : saveState === 'error'
                                    ? "Couldn't save your latest answers. Check your connection."
                                    : 'All answers saved'}
                        </p>
                        <button type="button" onClick={confirmSubmit} disabled={busy} className={primaryButton}>
                            {busy ? 'Submitting…' : 'Submit quiz'}
                        </button>
                        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                    </aside>
                </div>
            ) : (
                <Results
                    quiz={quiz}
                    attempt={attempt}
                    attemptsUsed={attemptsUsed}
                    backTo={backTo}
                    onRetake={startQuiz}
                    busy={busy}
                    error={error}
                />
            )}
        </div>
    );
};

const StartScreen = ({ quiz, onStart, busy, error }) => isPastDue(quiz.dueAt) ? (
    <div className="flex-1 flex items-start justify-center p-10">
        <div className="w-full max-w-md border border-grader-text rounded-md p-6 bg-white text-center">
            <p className="text-grader-text font-bold mb-1">This quiz is closed</p>
            <p className="text-sm text-grader-muted m-0">It was due {formatDue(quiz.dueAt)}.</p>
        </div>
    </div>
) : (
    <div className="flex-1 flex items-start justify-center p-10">
        <div className="w-full max-w-md border border-grader-text rounded-md p-6 bg-white text-center">
            <p className="text-grader-text mb-1">
                {quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'} · {quiz.totalPoints} points
            </p>
            <p className="text-grader-text mb-4">
                {quiz.timeLimitMinutes ? `Time limit: ${quiz.timeLimitMinutes} minutes` : 'No time limit'}
            </p>
            {quiz.dueAt && (
                <p className="text-grader-text font-bold mb-4">Due {formatDue(quiz.dueAt)}</p>
            )}
            <p className="text-sm text-grader-muted mb-5">
                {quiz.maxAttempts > 1 ? `You get ${quiz.maxAttempts} attempts, and your best score counts.` : 'You get one attempt.'}
                {quiz.timeLimitMinutes && ' The timer starts when you click Start, and the quiz submits itself when time runs out.'}
                {quiz.dueAt && ' If you are still working at the due time, the quiz submits itself.'}
            </p>
            <button type="button" onClick={onStart} disabled={busy} className={primaryButton}>
                {busy ? 'Starting…' : 'Start quiz'}
            </button>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
    </div>
);

// One question "module": navy card, gray question text, mint answer grid
const QuestionCard = ({ number, question: q, answer, onAnswer }) => (
    <div id={`question-${number}`} className="w-full max-w-xl bg-grader-navy text-white rounded-md p-4 scroll-mt-4">
        <div className="flex items-center justify-between mb-2 text-sm">
            <span className="font-bold">Question {number} · {TYPE_LABELS[q.type]}</span>
            <span>{q.points} pt{q.points === 1 ? '' : 's'}</span>
        </div>
        <p className="bg-gray-400 text-black text-center py-2.5 px-3 mb-3 rounded-[3px] whitespace-pre-wrap">{q.text}</p>

        {q.type === 'open_response' ? (
            <textarea
                value={answer?.responseText || ''}
                onChange={(e) => onAnswer({ responseText: e.target.value })}
                placeholder="Type your answer here"
                aria-label={`Question ${number} answer`}
                rows={4}
                className="w-full bg-grader-mint text-black placeholder-gray-700 py-2 px-3 rounded-[3px] resize-y focus:outline-none focus:ring-2 focus:ring-white"
            />
        ) : (
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={`Question ${number} choices`}>
                {q.options.map((option, i) => {
                    const selected = answer?.selectedOptionIndex === i;
                    return (
                        <label
                            key={i}
                            className={`flex items-center gap-2 bg-grader-mint text-black rounded-[3px] px-2 py-1.5 cursor-pointer ${
                                selected ? 'ring-2 ring-white font-bold' : ''
                            }`}
                        >
                            <input
                                type="radio"
                                name={`question-${q.questionId}`}
                                checked={selected}
                                onChange={() => onAnswer({ selectedOptionIndex: i })}
                            />
                            <span className="break-words min-w-0">{option}</span>
                        </label>
                    );
                })}
            </div>
        )}
    </div>
);

// After submitting: the score and the student's answers. Which multiple choice / true-false answers were wrong
// isn't shown, so retakes can't be used to work out the correct answers. Questions come from the copy saved with
// the attempt, so later edits to the quiz don't change what's shown here.
const Results = ({ quiz, attempt, attemptsUsed, backTo, onRetake, busy, error }) => {
    const pending = attempt.status === 'submitted';
    const attemptsLeft = isPastDue(quiz.dueAt) ? 0 : quiz.maxAttempts - attemptsUsed;
    const questionFor = (questionId) => quiz.questions.find((q) => q.questionId === questionId);

    return (
        <main className="flex-1 flex flex-col items-center px-5 pt-10 pb-10 gap-6">
            <div className="w-full max-w-xl border border-grader-text rounded-md p-5 bg-white text-center">
                <p className="text-grader-muted text-sm mb-1">
                    {pending ? 'Score so far' : 'Score'}
                    {quiz.maxAttempts > 1 && ` · attempt ${attempt.attemptNumber} of ${quiz.maxAttempts}`}
                </p>
                <p className="text-[2em] font-bold text-grader-navy m-0">
                    {attempt.totalScoreAwarded} / {attempt.totalPointsPossible}
                </p>
                {attempt.autoSubmitted && (
                    <p className="text-sm text-grader-muted mt-2 mb-0">
                        Time ran out, so the answers saved before the deadline were submitted.
                    </p>
                )}
                {pending && (
                    <p className="text-sm text-grader-muted mt-2 mb-0">
                        Open-response answers are waiting to be graded. Your score will update once they are.
                    </p>
                )}
                {quiz.maxAttempts > 1 && (
                    <p className="text-sm text-grader-muted mt-2 mb-0">Your best attempt is the one that counts.</p>
                )}
                {attemptsLeft > 0 && (
                    <button
                        type="button"
                        onClick={onRetake}
                        disabled={busy}
                        className="mt-4 px-4 py-2 rounded-[3px] bg-grader-green hover:brightness-110 text-white font-bold disabled:opacity-60"
                    >
                        {busy ? 'Starting…' : `Try again (${attemptsLeft} left)`}
                    </button>
                )}
                {error && <p className="mt-3 mb-0 text-sm text-red-600">{error}</p>}
                <div>
                    <Link to={backTo} className="inline-block mt-4 text-grader-navy font-bold">← Back to classes</Link>
                </div>
            </div>

            {attempt.answers.map((a, i) => {
                // Attempts from before question copies were saved fall back to the quiz as it is now
                const q = questionFor(a.questionId);
                const text = a.text ?? q?.text;
                const points = a.points ?? q?.points;
                const options = a.options ?? q?.options;

                // Only open responses get a per-question result; it doesn't give away any choice
                const status = a.type !== 'open_response'
                    ? null
                    : a.aiScore != null || a.professorScore != null
                        ? { label: `${a.pointsAwarded} / ${points} pts`, className: 'bg-grader-mint text-black' }
                        : { label: 'Awaiting grading', className: 'bg-white/20 text-white' };

                const yourAnswer = a.type === 'open_response'
                    ? a.responseText
                    : a.selectedOptionIndex != null ? options?.[a.selectedOptionIndex] : null;

                return (
                    <div key={a.questionId} className="w-full max-w-xl bg-grader-navy text-white rounded-md p-4">
                        <div className="flex items-center justify-between mb-2 text-sm gap-2">
                            <span className="font-bold">Question {i + 1}</span>
                            {status ? (
                                <span className={`px-2 py-0.5 rounded-[3px] font-bold ${status.className}`}>{status.label}</span>
                            ) : (
                                <span>{points} pt{points === 1 ? '' : 's'}</span>
                            )}
                        </div>
                        <p className="bg-gray-400 text-black text-center py-2.5 px-3 mb-3 rounded-[3px] whitespace-pre-wrap">{text}</p>
                        <p className="text-xs text-white/80 mb-1">Your answer</p>
                        <p className="m-0 whitespace-pre-wrap">{yourAnswer || <em className="text-white/60">No answer</em>}</p>
                        {(a.professorFeedback || a.aiFeedback) && (
                            <p className="mt-2 mb-0 text-sm text-white/90">Feedback: {a.professorFeedback || a.aiFeedback}</p>
                        )}
                    </div>
                );
            })}
        </main>
    );
};

export default TakeQuizPage;
