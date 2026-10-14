import React, { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import getUserInfo from '../../utilities/decodeJwt';
import api, { errorMessage } from '../../utilities/api';
import { formatDue, isPastDue, toDueInputs, fromDueInputs } from '../../utilities/dueDate';

const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

const TYPE_LABELS = {
    multiple_choice: 'Multiple choice',
    true_false: 'True / False',
    open_response: 'Open response',
};

// key is only for React lists; it isn't sent to the server
let nextKey = 0;
const newQuestion = (type) => ({
    key: nextKey++,
    type,
    text: '',
    points: 1,
    options: type === 'multiple_choice' ? ['', '', '', ''] : undefined,
    correctOptionIndex: null,
    sampleAnswer: '',
});

// Returns a list of problems to fix before saving (empty when the quiz is valid)
const findProblems = (title, questions) => {
    const problems = [];
    if (!title.trim()) problems.push('Give the quiz a name.');
    if (questions.length === 0) problems.push('Add at least one question.');
    questions.forEach((q, i) => {
        const n = `Question ${i + 1}`;
        if (!q.text.trim()) problems.push(`${n}: enter the question.`);
        if (!(Number(q.points) >= 0) || q.points === '') problems.push(`${n}: points must be 0 or more.`);
        if (q.type === 'multiple_choice' && q.options.some((o) => !o.trim())) problems.push(`${n}: fill in every answer option.`);
        if (q.type !== 'open_response' && q.correctOptionIndex == null) problems.push(`${n}: pick the correct answer.`);
    });
    return problems;
};

// Server quiz -> editable form state
const fromServer = (quiz) => ({
    title: quiz.title,
    timeLimit: quiz.timeLimitMinutes ? String(quiz.timeLimitMinutes) : '',
    maxAttempts: String(quiz.maxAttempts || 1),
    dueDate: toDueInputs(quiz.dueAt).date,
    dueTime: toDueInputs(quiz.dueAt).time,
    published: quiz.published !== false,
    questions: quiz.questions.map((q) => ({
        key: nextKey++,
        questionId: q.questionId,
        type: q.type,
        text: q.text,
        points: q.points,
        options: q.type === 'multiple_choice' ? q.options : undefined,
        correctOptionIndex: q.correctOptionIndex ?? null,
        sampleAnswer: q.sampleAnswer || '',
    })),
});

const toPayload = (q) => ({
    // Sending questionId back keeps it stable, so student attempts still match the question
    ...(q.questionId && { questionId: q.questionId }),
    type: q.type,
    text: q.text.trim(),
    points: Number(q.points),
    ...(q.type === 'multiple_choice' && { options: q.options.map((o) => o.trim()) }),
    ...(q.type !== 'open_response' && { correctOptionIndex: q.correctOptionIndex }),
    ...(q.type === 'open_response' && q.sampleAnswer.trim() && { sampleAnswer: q.sampleAnswer.trim() }),
});

// Professor creates a quiz (/classes/:classId/quizzes/new) or views and edits an
// existing one (/classes/:classId/quizzes/:quizId). Existing quizzes open read-only
// until "Edit quiz" is clicked.
const QuizMakerPage = () => {
    const { classId, quizId } = useParams();
    const isNew = !quizId;
    const navigate = useNavigate();
    const [user] = useState(() => getUserInfo());
    const [classroom, setClassroom] = useState();
    const [loadError, setLoadError] = useState('');
    const [title, setTitle] = useState('');
    const [timeLimit, setTimeLimit] = useState('');
    const [maxAttempts, setMaxAttempts] = useState('1');
    const [dueDate, setDueDate] = useState('');
    const [dueTime, setDueTime] = useState('');
    // Students who already submitted; edits only apply to attempts started after saving
    const [submittedStudents, setSubmittedStudents] = useState(0);
    const [questions, setQuestions] = useState(() => (isNew ? [newQuestion('multiple_choice')] : []));
    // Last saved version of an existing quiz, restored by "Cancel"
    const [saved, setSaved] = useState();
    const [editing, setEditing] = useState(isNew);
    const [problems, setProblems] = useState([]);
    // Which button is saving: 'draft', 'publish', or null
    const [saving, setSaving] = useState(null);

    const isProfessor = user?.role === 'professor';
    const loading = !isNew && !saved && !loadError;

    const loadForm = (form) => {
        setTitle(form.title);
        setTimeLimit(form.timeLimit);
        setMaxAttempts(form.maxAttempts);
        setDueDate(form.dueDate);
        setDueTime(form.dueTime);
        setQuestions(form.questions);
    };

    useEffect(() => {
        if (!isProfessor) return;
        api.get('/classrooms')
            .then(({ data }) => {
                const found = data.find((c) => c._id === classId);
                if (found) setClassroom(found);
                else setLoadError("This class doesn't exist or isn't yours.");
            })
            .catch((err) => setLoadError(errorMessage(err)));
    }, [classId, isProfessor]);

    useEffect(() => {
        if (!isProfessor || !quizId) return;
        api.get(`/classrooms/${classId}/quizzes/${quizId}`)
            .then(({ data }) => {
                const form = fromServer(data);
                setSubmittedStudents(data.submittedStudents || 0);
                setSaved(form);
                loadForm(form);
            })
            .catch((err) => setLoadError(errorMessage(err)));
    }, [classId, quizId, isProfessor]);

    if (!isProfessor) return <Navigate to="/" replace />;

    const backTo = `/?class=${classId}`;
    const totalPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);

    const updateQuestion = (key, changes) =>
        setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...changes } : q)));
    const removeQuestion = (key) => setQuestions((prev) => prev.filter((q) => q.key !== key));
    const addQuestion = (type) => setQuestions((prev) => [...prev, newQuestion(type)]);

    // Deletes the quiz and every student's attempts on it, then goes back to the class
    const deleteQuiz = async () => {
        const scores = submittedStudents > 0
            ? ` ${submittedStudents} student${submittedStudents === 1 ? ' has' : 's have'} taken it, and their scores will be deleted too.`
            : '';
        if (!window.confirm(`Delete "${saved?.title || 'this quiz'}"?${scores} This can't be undone.`)) return;
        setSaving('delete');
        try {
            await api.delete(`/classrooms/${classId}/quizzes/${quizId}`);
            navigate(backTo);
        } catch (err) {
            setProblems([errorMessage(err)]);
            setSaving(null);
        }
    };

    const cancelEditing = () => {
        loadForm(saved);
        setProblems([]);
        setEditing(false);
    };

    const isPublished = !isNew && saved?.published;

    // publish: true checks everything and shows the quiz to students. A draft only needs a name and stays hidden.
    const handleSave = async (publish) => {
        const found = publish ? findProblems(title, questions) : title.trim() ? [] : ['Give the quiz a name.'];
        setProblems(found);
        if (found.length) return;
        if (!publish && isPublished && !window.confirm('Students will stop seeing this quiz until you publish it again. Save it as a draft?')) return;

        const body = {
            title: title.trim(),
            timeLimitMinutes: timeLimit ? Number(timeLimit) : null,
            maxAttempts: Number(maxAttempts) || 1,
            dueAt: fromDueInputs(dueDate, dueTime),
            published: publish,
            questions: questions.map(toPayload),
        };

        setSaving(publish ? 'publish' : 'draft');
        try {
            if (isNew) {
                await api.post(`/classrooms/${classId}/quizzes`, body);
                navigate(backTo);
                return;
            }
            const { data } = await api.put(`/classrooms/${classId}/quizzes/${quizId}`, body);
            const form = fromServer(data);
            setSaved(form);
            loadForm(form);
            setEditing(false);
        } catch (err) {
            setProblems([errorMessage(err)]);
        }
        setSaving(null);
    };

    const heading = isNew ? 'New quiz' : editing ? 'Editing quiz' : saved?.title || 'Quiz';

    return (
        <div className="flex flex-col min-h-screen font-sans">
            {/* Top bar */}
            <header className="min-h-[15vh] bg-grader-navy text-white p-[15px] flex flex-col">
                <Link to={backTo} className="text-sm text-white/80 hover:text-white no-underline self-start">
                    ← Back to classes
                </Link>
                <h1 className="text-[1.4em] font-bold text-center my-auto">
                    {heading}{classroom && ` - ${classroom.courseCode} ${classroom.className}`}
                </h1>
            </header>

            {loadError ? (
                <p className="p-10 text-center text-grader-muted">{loadError}</p>
            ) : loading ? (
                <p className="p-10 text-center text-grader-muted">Loading quiz…</p>
            ) : (
                <div className="flex flex-1">
                    {/* Left sidebar: add questions */}
                    <aside className="w-64 shrink-0 bg-[#f0f0f0] p-[15px]">
                        {editing ? (
                            <>
                                <h3 className="text-base font-bold text-grader-muted mb-2">Add a question</h3>
                                {Object.entries(TYPE_LABELS).map(([type, label]) => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => addQuestion(type)}
                                        className="block w-full mb-2 px-3 py-2 rounded-[3px] bg-grader-mint text-black text-sm font-bold text-left"
                                    >
                                        + {label}
                                    </button>
                                ))}
                            </>
                        ) : (
                            <p className="text-sm text-grader-muted">
                                Correct answers are highlighted. Click <strong>Edit quiz</strong> to make changes.
                            </p>
                        )}
                    </aside>

                    {/* Center: the quiz */}
                    <main className="flex-1 flex flex-col items-center px-5 pt-[50px] pb-10 gap-6">
                        {editing ? (
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Enter quiz name here"
                                aria-label="Quiz name"
                                className="w-full max-w-xl text-center text-[1.3em] font-bold border-b-2 border-grader-border focus:border-grader-navy focus:outline-none py-2"
                            />
                        ) : (
                            <h2 className="w-full max-w-xl text-center text-[1.3em] font-bold py-2 m-0">{title}</h2>
                        )}

                        {editing && submittedStudents > 0 && (
                            <p className="w-full max-w-xl m-0 px-3 py-2 rounded-[3px] border border-[rgb(233,73,73)] bg-red-50 text-sm text-grader-text">
                                <strong>{submittedStudents} student{submittedStudents === 1 ? ' has' : 's have'} already submitted this quiz.</strong>{' '}
                                Changes only apply to attempts started after you save. Submitted attempts keep the questions and points they had.
                            </p>
                        )}

                        {questions.length === 0 && (
                            <p className="text-grader-muted">Add a question from the left sidebar.</p>
                        )}

                        {questions.map((q, i) => (
                            <QuestionCard
                                key={q.key}
                                number={i + 1}
                                question={q}
                                readOnly={!editing}
                                onChange={(changes) => updateQuestion(q.key, changes)}
                                onDelete={() => removeQuestion(q.key)}
                            />
                        ))}
                    </main>

                    {/* Right sidebar: settings + save */}
                    <aside className="w-64 shrink-0 bg-[#f0f0f0] p-[15px]">
                        <h3 className="text-base font-bold text-grader-muted mb-2">Quiz settings</h3>
                        <label className="block text-sm font-bold text-grader-muted mb-1" htmlFor="time-limit">
                            Time limit (minutes)
                        </label>
                        {editing ? (
                            <input
                                id="time-limit"
                                type="number"
                                min="1"
                                value={timeLimit}
                                onChange={(e) => setTimeLimit(e.target.value)}
                                placeholder="No limit"
                                className="w-full px-2 py-1 border border-grader-border rounded-[3px] mb-4"
                            />
                        ) : (
                            <p id="time-limit" className="text-sm text-grader-text mb-4">{timeLimit || 'No limit'}</p>
                        )}

                        <label className="block text-sm font-bold text-grader-muted mb-1" htmlFor="max-attempts">
                            Attempts allowed
                        </label>
                        {editing ? (
                            <input
                                id="max-attempts"
                                type="number"
                                min="1"
                                max="20"
                                value={maxAttempts}
                                onChange={(e) => setMaxAttempts(e.target.value)}
                                className="w-full px-2 py-1 border border-grader-border rounded-[3px] mb-4"
                            />
                        ) : (
                            <p id="max-attempts" className="text-sm text-grader-text mb-4">{maxAttempts}</p>
                        )}

                        <label className="block text-sm font-bold text-grader-muted mb-1" htmlFor="due-date">
                            Due date
                        </label>
                        {editing ? (
                            <div className="mb-4">
                                {/* type="date" opens the browser's calendar when clicked */}
                                <input
                                    id="due-date"
                                    type="date"
                                    value={dueDate}
                                    onChange={(e) => {
                                        setDueDate(e.target.value);
                                        if (e.target.value && !dueTime) setDueTime('23:59');
                                    }}
                                    className="w-full px-2 py-1 border border-grader-border rounded-[3px] mb-1"
                                />
                                <input
                                    type="time"
                                    aria-label="Time due"
                                    value={dueTime}
                                    disabled={!dueDate}
                                    onChange={(e) => setDueTime(e.target.value)}
                                    className="w-full px-2 py-1 border border-grader-border rounded-[3px] disabled:opacity-60"
                                />
                                {dueDate && (
                                    <button
                                        type="button"
                                        onClick={() => { setDueDate(''); setDueTime(''); }}
                                        className="mt-1 text-xs text-grader-muted hover:text-grader-navy underline"
                                    >
                                        Remove due date
                                    </button>
                                )}
                            </div>
                        ) : (
                            <p id="due-date" className="text-sm text-grader-text mb-4">
                                {dueDate ? formatDue(fromDueInputs(dueDate, dueTime)) : 'No due date'}
                                {dueDate && isPastDue(fromDueInputs(dueDate, dueTime)) && ' (closed)'}
                            </p>
                        )}

                        <p className="text-sm text-grader-text mb-1">
                            {questions.length} question{questions.length === 1 ? '' : 's'}
                        </p>
                        <p className="text-sm text-grader-text mb-1">{totalPoints} total points</p>
                        <p className="text-sm text-grader-text mb-4">
                            {isPublished ? 'Published - students can see it' : 'Draft - hidden from students'}
                        </p>

                        {editing ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => handleSave(false)}
                                    disabled={!!saving}
                                    className="w-full mb-2 py-2 rounded-[3px] border border-grader-border bg-white text-grader-text font-bold disabled:opacity-60"
                                >
                                    {saving === 'draft' ? 'Saving…' : 'Save as draft'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSave(true)}
                                    disabled={!!saving}
                                    className="w-full py-2 rounded-[3px] bg-grader-green hover:brightness-110 text-white font-bold disabled:opacity-60"
                                >
                                    {saving === 'publish' ? 'Publishing…' : isPublished ? 'Publish changes' : 'Publish quiz'}
                                </button>
                                {!isNew && (
                                    <button
                                        type="button"
                                        onClick={cancelEditing}
                                        disabled={!!saving}
                                        className="w-full mt-2 py-2 rounded-[3px] border border-grader-border bg-white text-grader-text font-bold"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setEditing(true)}
                                    className="w-full py-2 rounded-[3px] bg-grader-green hover:brightness-110 text-white font-bold"
                                >
                                    Edit quiz
                                </button>
                                <Link
                                    to={`/classes/${classId}/quizzes/${quizId}/grade`}
                                    className="block w-full mt-2 py-2 rounded-[3px] border border-grader-border bg-white text-grader-text text-center font-bold no-underline hover:text-grader-navy"
                                >
                                    Grade submissions
                                </Link>
                                <button
                                    type="button"
                                    onClick={deleteQuiz}
                                    disabled={!!saving}
                                    className="w-full mt-2 py-2 rounded-[3px] bg-[rgb(233,73,73)] hover:brightness-110 text-white font-bold disabled:opacity-60"
                                >
                                    Delete quiz
                                </button>
                            </>
                        )}

                        {problems.length > 0 && (
                            <ul className="mt-4 pl-4 text-sm text-red-600 list-disc">
                                {problems.map((p) => <li key={p}>{p}</li>)}
                            </ul>
                        )}
                    </aside>
                </div>
            )}
        </div>
    );
};

// One question "module": navy card, gray question text, mint answer grid, red delete.
// readOnly shows the same card as plain text with the correct answer highlighted.
const QuestionCard = ({ number, question: q, readOnly, onChange, onDelete }) => {
    const choices = q.type === 'true_false' ? ['True', 'False'] : q.options;

    if (readOnly) return (
        <div className="w-full max-w-xl bg-grader-navy text-white rounded-md p-4">
            <div className="flex items-center justify-between mb-2 text-sm">
                <span className="font-bold">Question {number} · {TYPE_LABELS[q.type]}</span>
                <span>{q.points} pt{Number(q.points) === 1 ? '' : 's'}</span>
            </div>
            <p className="bg-gray-400 text-black text-center py-2.5 px-3 mb-3 rounded-[3px] whitespace-pre-wrap">{q.text}</p>
            {q.type === 'open_response' ? (
                <div className="bg-grader-mint text-black py-2 px-3 rounded-[3px]">
                    <p className="text-xs font-bold mb-1">Sample answer</p>
                    <p className="m-0 whitespace-pre-wrap">{q.sampleAnswer || <em className="text-gray-700">None given</em>}</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3">
                    {choices.map((choice, i) => {
                        const correct = q.correctOptionIndex === i;
                        return (
                            <div
                                key={i}
                                className={`flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-black ${
                                    correct ? 'bg-grader-mint ring-2 ring-white font-bold' : 'bg-grader-mint/50'
                                }`}
                            >
                                <span aria-hidden="true">{correct ? '✓' : '○'}</span>
                                <span className="break-words min-w-0">{choice}</span>
                                {correct && <span className="sr-only">(correct answer)</span>}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    const setOption = (index, value) => onChange({ options: q.options.map((o, i) => (i === index ? value : o)) });

    const removeOption = (index) => {
        let correct = q.correctOptionIndex;
        if (correct === index) correct = null;
        else if (correct > index) correct -= 1;
        onChange({ options: q.options.filter((_, i) => i !== index), correctOptionIndex: correct });
    };

    return (
        <div className="w-full max-w-xl bg-grader-navy text-white rounded-md p-4">
            <div className="flex items-center justify-between mb-2 text-sm">
                <span className="font-bold">Question {number} · {TYPE_LABELS[q.type]}</span>
                <label className="flex items-center gap-1.5">
                    Points
                    <input
                        type="number"
                        min="0"
                        value={q.points}
                        onChange={(e) => onChange({ points: e.target.value })}
                        className="w-16 px-1.5 py-0.5 rounded-[3px] text-black"
                    />
                </label>
            </div>

            <textarea
                value={q.text}
                onChange={(e) => onChange({ text: e.target.value })}
                placeholder="Input question here"
                aria-label={`Question ${number} text`}
                rows={2}
                className="w-full bg-gray-400 text-black placeholder-gray-700 text-center py-2.5 px-3 mb-3 rounded-[3px] resize-y focus:outline-none focus:ring-2 focus:ring-white"
            />

            {q.type === 'open_response' ? (
                <textarea
                    value={q.sampleAnswer}
                    onChange={(e) => onChange({ sampleAnswer: e.target.value })}
                    placeholder="Sample full-credit answer (optional) - the AI grader compares student answers against this"
                    aria-label={`Question ${number} sample answer`}
                    rows={3}
                    className="w-full bg-grader-mint text-black placeholder-gray-700 py-2 px-3 rounded-[3px] resize-y focus:outline-none"
                />
            ) : (
                <>
                    <p className="text-xs text-white/80 mb-1.5">Select the correct answer</p>
                    <div className="grid grid-cols-2 gap-3">
                        {choices.map((choice, i) => (
                            <label
                                key={i}
                                className={`flex items-center gap-2 bg-grader-mint text-black rounded-[3px] px-2 py-1.5 ${
                                    q.correctOptionIndex === i ? 'ring-2 ring-white font-bold' : ''
                                }`}
                            >
                                <input
                                    type="radio"
                                    name={`correct-${q.key}`}
                                    checked={q.correctOptionIndex === i}
                                    onChange={() => onChange({ correctOptionIndex: i })}
                                />
                                {q.type === 'true_false' ? (
                                    <span>{choice}</span>
                                ) : (
                                    <>
                                        <input
                                            value={choice}
                                            onChange={(e) => setOption(i, e.target.value)}
                                            placeholder={`#${i + 1}`}
                                            aria-label={`Question ${number} option ${i + 1}`}
                                            className="flex-1 min-w-0 bg-transparent placeholder-gray-600 focus:outline-none"
                                        />
                                        {q.options.length > MIN_OPTIONS && (
                                            <button
                                                type="button"
                                                onClick={() => removeOption(i)}
                                                aria-label={`Remove option ${i + 1}`}
                                                className="text-gray-700 hover:text-black leading-none"
                                            >
                                                &times;
                                            </button>
                                        )}
                                    </>
                                )}
                            </label>
                        ))}
                    </div>
                    {q.type === 'multiple_choice' && q.options.length < MAX_OPTIONS && (
                        <button
                            type="button"
                            onClick={() => onChange({ options: [...q.options, ''] })}
                            className="mt-2 text-sm text-white/80 hover:text-white"
                        >
                            + Add option
                        </button>
                    )}
                </>
            )}

            <button
                type="button"
                onClick={onDelete}
                className="w-full mt-3 py-1.5 rounded-[3px] bg-[rgb(233,73,73)] hover:brightness-110 text-white text-sm"
            >
                Delete
            </button>
        </div>
    );
};

export default QuizMakerPage;
