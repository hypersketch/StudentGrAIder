import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import getUserInfo from '../../utilities/decodeJwt';
import api, { errorMessage } from '../../utilities/api';
import percent from '../../utilities/percent';
import { formatDue, isPastDue } from '../../utilities/dueDate';
import Overlay, { overlayInput, overlayLabel, overlaySubmit } from '../overlay';

const headerButton = 'ml-2.5 px-2.5 py-1.5 rounded-[3px] bg-grader-green text-white text-sm no-underline hover:text-white';
const card = 'border border-grader-text rounded-md p-[15px] mb-[15px] bg-white';

// What a student can do next with a quiz, from the attempt summary the quiz list returns (nothing once out of tries)
const nextStep = (quiz) => {
    if (quiz.inProgress) return 'Resume →';
    if (isPastDue(quiz.dueAt)) return 'Closed';
    if (!quiz.attemptsUsed) return 'Take quiz →';
    const left = quiz.maxAttempts - quiz.attemptsUsed;
    return left > 0 ? `Retake (${left} left) →` : null;
};

// The mint score boxes from Homepage.html
const scoreBadge = 'ml-[5px] px-2 py-1 rounded-[3px] bg-grader-mint text-black text-[0.8em]';

// The site's front page. Logged-out visitors see the same layout with
// Log In / Sign Up buttons in place of their classes and quizzes.
// The selected class lives in the URL (?class=<id>) so it survives coming back from the quiz maker.
const HomePage = () => {
    // Read the token on first render so logged-in users don't see a flash of the logged-out page
    const [user, setUser] = useState(() => getUserInfo());
    const [classes, setClasses] = useState([]);
    const [quizzes, setQuizzes] = useState([]);
    // Student's overall grade in the selected class: { overall, grades }
    const [myGrades, setMyGrades] = useState(null);
    const [showNewClass, setShowNewClass] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();

    const isProfessor = user?.role === 'professor';
    // No ?class means nothing is picked yet: the page shows only the welcome message
    const selectedClass = classes.find((c) => c._id === searchParams.get('class'));

    const selectClass = (id) => setSearchParams({ class: id });

    const logOut = useCallback(() => {
        localStorage.removeItem('accessToken');
        setUser(undefined);
        setClasses([]);
        setQuizzes([]);
    }, []);

    // An expired or invalid token means the user has to log in again
    const handleError = useCallback((err) => {
        if (err.response?.status === 401) logOut();
    }, [logOut]);

    useEffect(() => {
        if (!user) return;
        api.get('/classrooms').then(({ data }) => setClasses(data)).catch(handleError);
    }, [user, handleError]);

    const selectedId = selectedClass?._id;
    useEffect(() => {
        if (!selectedId) return;
        api.get(`/classrooms/${selectedId}/quizzes`).then(({ data }) => setQuizzes(data)).catch(handleError);
    }, [selectedId, handleError]);

    useEffect(() => {
        setMyGrades(null);
        if (!selectedId || isProfessor) return;
        api.get(`/classrooms/${selectedId}/grades/mine`).then(({ data }) => setMyGrades(data)).catch(handleError);
    }, [selectedId, isProfessor, handleError]);
    const gradesPending = myGrades?.grades.some((g) => g.status === 'pending');

    const handleClassCreated = (classroom) => {
        setClasses((prev) => [...prev, classroom].sort((a, b) => a.courseCode.localeCompare(b.courseCode)));
        selectClass(classroom._id);
        setShowNewClass(false);
    };

    // Keeps the class list (sidebar request counts, roster size, limit) in step with changes made on this page.
    // update gets the current class and returns the fields that changed.
    const updateSelectedClass = (update) =>
        setClasses((prev) => prev.map((c) => (c._id === selectedId ? { ...c, ...update(c) } : c)));

    // Student leaves the selected class: it drops out of the sidebar and the page goes back to the welcome view
    const dropClass = async () => {
        const name = `${selectedClass.courseCode} - ${selectedClass.className}`;
        if (!window.confirm(`Drop ${name}? You'll need to request to join again to get back in.`)) return;
        try {
            await api.delete(`/classrooms/${selectedId}/enrollment`);
            setClasses((prev) => prev.filter((c) => c._id !== selectedId));
            setSearchParams({});
        } catch (err) {
            handleError(err);
            window.alert(errorMessage(err));
        }
    };

    return (
        <div className="flex min-h-screen bg-white font-sans">
            {/* Sidebar */}
            <aside className="w-[220px] shrink-0 flex flex-col bg-grader-sidebar border-r border-grader-border p-[15px]">
                <h2 className="text-[1.4em] font-bold mb-5">
                    {/* Back to the clean welcome page; styled to look exactly like the plain heading */}
                    <Link to="/" className="no-underline text-inherit hover:text-inherit">
                        Student <span className="text-green-700">GrAIder</span>
                    </Link>
                </h2>

                {!isProfessor && <ClassSearch enabled={!!user} />}

                <h3 className="text-base font-bold text-grader-muted mb-1">
                    {isProfessor ? 'My Classes' : 'Subscribed Classes'}
                </h3>
                {!user ? (
                    <p className="text-[0.95em] text-grader-muted italic my-1">Log in to see your classes</p>
                ) : classes.length === 0 ? (
                    <p className="text-[0.95em] text-grader-muted italic my-1">No classes yet</p>
                ) : (
                    classes.map((c) => (
                        <button
                            key={c._id}
                            type="button"
                            onClick={() => selectClass(c._id)}
                            className={`block my-1 text-left text-[0.95em] hover:underline ${
                                c._id === selectedClass?._id ? 'font-bold text-grader-navy' : 'text-grader-text'
                            }`}
                        >
                            {c.courseCode} - {c.className}
                            {isProfessor && c.pendingStudents?.length > 0 && (
                                <span
                                    className="ml-1.5 px-1.5 rounded-full bg-grader-green text-white text-xs font-bold"
                                    title="Students waiting to join"
                                >
                                    {c.pendingStudents.length}
                                </span>
                            )}
                        </button>
                    ))
                )}

                {isProfessor && (
                    <button
                        type="button"
                        onClick={() => setShowNewClass(true)}
                        className="mt-2 px-2 py-1 rounded-[3px] bg-grader-mint text-black text-sm font-bold"
                    >
                        + New class
                    </button>
                )}

                {!isProfessor && (
                    <h3 className="mt-auto text-center text-base font-bold text-grader-muted">
                        Contact My Professor
                    </h3>
                )}
            </aside>

            {/* Main content */}
            <main className="flex-1 flex flex-col">
                <header className="min-h-[25vh] flex items-start justify-between bg-grader-navy text-white p-[15px]">
                    <div className="text-[1.2em] font-bold">{isProfessor ? 'Online Quiz Maker' : 'Online Quiz Taker'}</div>
                    {user ? (
                        <button onClick={logOut} className={headerButton}>
                            Log Out
                        </button>
                    ) : (
                        <div>
                            <Link to="/login" className={headerButton}>Log In</Link>
                            <Link to="/signup" className={headerButton}>Sign Up</Link>
                        </div>
                    )}
                </header>

                <div className="px-5 py-2.5 font-bold text-grader-muted">
                    {user ? `Welcome ${user.name}` : 'Welcome'}
                </div>

                <section className="flex-1 overflow-y-auto p-5">
                    {!user ? (
                        <div className={`${card} text-grader-muted`}>
                            <Link to="/login" className="text-grader-navy font-bold">Log in</Link> or{' '}
                            <Link to="/signup" className="text-grader-navy font-bold">sign up</Link> to see your quizzes.
                        </div>
                    ) : !selectedClass ? null : (
                        <>
                            <div className="flex items-center justify-between mb-[15px]">
                                <h3 className="text-[1.1em] font-bold text-grader-text m-0">
                                    {selectedClass.courseCode} - {selectedClass.className}
                                </h3>
                                {isProfessor && (
                                    <div className="flex items-center gap-2">
                                        <Link
                                            to={`/classes/${selectedClass._id}/gradebook`}
                                            className="px-2.5 py-1.5 rounded-[3px] border border-grader-border bg-white text-grader-text text-sm font-bold no-underline hover:text-grader-navy"
                                        >
                                            Gradebook
                                        </Link>
                                        <Link
                                            to={`/classes/${selectedClass._id}/quizzes/new`}
                                            className="px-2.5 py-1.5 rounded-[3px] bg-grader-green text-white text-sm font-bold no-underline hover:text-white"
                                        >
                                            + Create quiz
                                        </Link>
                                    </div>
                                )}
                                {!isProfessor && (
                                    <div className="flex items-center gap-2">
                                        {/* Average of the quiz grades so far; every quiz counts the same */}
                                        <span
                                            className="px-2.5 py-1.5 rounded-[3px] bg-grader-mint text-black text-sm font-bold"
                                            title={gradesPending
                                                ? 'Average of your quiz grades so far. Some open responses still need grading.'
                                                : 'Average of your quiz grades so far. Every quiz counts the same.'}
                                        >
                                            Overall: {percent(myGrades?.overall, 100)}{gradesPending && '*'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={dropClass}
                                            className="px-2.5 py-1.5 rounded-[3px] border border-grader-border bg-white text-grader-text text-sm font-bold hover:text-[rgb(233,73,73)]"
                                        >
                                            Drop class
                                        </button>
                                    </div>
                                )}
                            </div>

                            {isProfessor && <JoinRequests classroom={selectedClass} onChange={updateSelectedClass} />}
                            {isProfessor && <ClassRoster classroom={selectedClass} onChange={updateSelectedClass} />}

                            {quizzes.length === 0 ? (
                                <div className={`${card} text-grader-muted`}>
                                    {isProfessor ? 'No quizzes in this class yet.' : 'No quizzes in this class yet. Check back later.'}
                                </div>
                            ) : (
                                quizzes.map((q) => {
                                    const body = (
                                        <>
                                            <p className="mb-0 font-bold">
                                                {q.title}
                                                {isProfessor && q.published === false && (
                                                    <span className="ml-2 px-1.5 py-0.5 rounded-[3px] bg-gray-200 text-grader-muted text-xs font-bold align-middle">
                                                        Draft
                                                    </span>
                                                )}
                                            </p>
                                            <div className="flex items-center justify-between mt-2.5 gap-[5px]">
                                                <span className="text-sm text-grader-muted">
                                                    {q.questionCount} question{q.questionCount === 1 ? '' : 's'} · {q.totalPoints} pts
                                                    {q.timeLimitMinutes ? ` · ${q.timeLimitMinutes} min` : ''}
                                                    {q.dueAt ? ` · ${isPastDue(q.dueAt) ? 'Was due' : 'Due'} ${formatDue(q.dueAt)}` : ''}
                                                </span>
                                                {!isProfessor && (
                                                    <span className="flex items-center">
                                                        {nextStep(q) && (
                                                            <span className="mr-1 text-sm font-bold text-grader-navy">{nextStep(q)}</span>
                                                        )}
                                                        {/* Once the professor has graded everything, their score is the one that counts */}
                                                        {!q.myAttempt?.professorReviewed && (
                                                            <span className={scoreBadge} title="AI score">
                                                                AI: {percent(q.myAttempt?.aiScoreAwarded, q.myAttempt?.totalPointsPossible)}
                                                            </span>
                                                        )}
                                                        {/* Running score: open responses count as 0 until the professor marks them */}
                                                        <span
                                                            className={scoreBadge}
                                                            title={q.myAttempt && !q.myAttempt.professorReviewed
                                                                ? "Professor's grade so far. Open responses count once they're graded."
                                                                : "Professor's grade"}
                                                        >
                                                            P: {percent(q.myAttempt?.professorScoreAwarded, q.myAttempt?.totalPointsPossible)}
                                                        </span>
                                                    </span>
                                                )}
                                            </div>
                                        </>
                                    );
                                    // Professors open the quiz to view or edit it; students to take it or see their results
                                    const quizUrl = `/classes/${selectedClass._id}/quizzes/${q._id}${isProfessor ? '' : '/take'}`;
                                    return (
                                        <Link
                                            key={q._id}
                                            to={quizUrl}
                                            className={`${card} block no-underline text-grader-text hover:border-grader-navy hover:shadow-md`}
                                        >
                                            {body}
                                        </Link>
                                    );
                                })
                            )}
                        </>
                    )}
                </section>
            </main>

            {showNewClass && (
                <NewClassOverlay onClose={() => setShowNewClass(false)} onCreated={handleClassCreated} />
            )}
        </div>
    );
};

const searchIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
);

// Student search box. Finds classes by "courseCode className professorName" as you type
// (e.g. "10" -> "101 Science Bob", "103 English Joe") and sends the professor a join request.
const ClassSearch = ({ enabled }) => {
    const [query, setQuery] = useState('');
    // The search the results belong to, so older results show "Searching..." instead
    const [found, setFound] = useState({ q: '', classes: [] });
    const [open, setOpen] = useState(false);
    const [error, setError] = useState('');
    const boxRef = useRef(null);
    const q = query.trim();

    // Waits for a short pause in typing before asking the server
    useEffect(() => {
        if (!q) return;
        let stale = false;
        const timer = setTimeout(() => {
            api.get('/classrooms/search', { params: { q } })
                .then(({ data }) => { if (!stale) { setFound({ q, classes: data }); setError(''); } })
                .catch((err) => { if (!stale) setError(errorMessage(err)); });
        }, 250);
        return () => { stale = true; clearTimeout(timer); };
    }, [q]);

    // Closes the results on a click anywhere else
    useEffect(() => {
        const onMouseDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, []);

    const askToJoin = async (classroom) => {
        try {
            await api.post(`/classrooms/${classroom._id}/join-requests`);
            setFound((prev) => ({
                ...prev,
                classes: prev.classes.map((c) => (c._id === classroom._id ? { ...c, status: 'requested' } : c)),
            }));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    const statusLabel = { enrolled: 'Joined', requested: 'Requested', full: 'Full' };

    return (
        <div ref={boxRef} className="relative mb-5">
            <div className="flex">
                <input
                    type="text"
                    value={query}
                    disabled={!enabled}
                    placeholder={enabled ? 'Find a class or professor' : 'Log in to find classes'}
                    aria-label="Search classes"
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
                    className="flex-1 min-w-0 p-[5px] border border-grader-border text-sm"
                />
                <button
                    type="button"
                    aria-label="Search"
                    disabled={!enabled}
                    onClick={() => setOpen(true)}
                    className="w-[30px] flex items-center justify-center bg-grader-mint"
                >
                    {searchIcon}
                </button>
            </div>

            {open && q && (
                <div className="absolute left-0 top-full mt-1 z-20 w-72 bg-white border border-grader-border rounded-[3px] shadow-lg">
                    {error ? (
                        <p className="m-0 px-3 py-2 text-sm text-red-600">{error}</p>
                    ) : found.q !== q ? (
                        <p className="m-0 px-3 py-2 text-sm text-grader-muted italic">Searching...</p>
                    ) : found.classes.length === 0 ? (
                        <p className="m-0 px-3 py-2 text-sm text-grader-muted italic">No classes found</p>
                    ) : (
                        found.classes.map((c) => (
                            <div key={c._id} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-grader-border last:border-b-0 text-sm">
                                <span className="min-w-0 break-words">
                                    <span className="font-bold">{c.courseCode}</span> {c.className}{' '}
                                    <span className="text-grader-muted">{c.professorName}</span>
                                </span>
                                {c.status ? (
                                    <span className="shrink-0 text-grader-muted">{statusLabel[c.status]}</span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => askToJoin(c)}
                                        className="shrink-0 px-2 py-0.5 rounded-[3px] bg-grader-green text-white font-bold hover:brightness-110"
                                    >
                                        Request
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

// Professor's list of students asking to join the selected class. Hidden when nobody is waiting.
const JoinRequests = ({ classroom, onChange }) => {
    const [students, setStudents] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        setStudents([]);
        setError('');
        api.get(`/classrooms/${classroom._id}/join-requests`)
            .then(({ data }) => setStudents(data))
            .catch((err) => setError(errorMessage(err)));
    }, [classroom._id]);

    const answer = async (student, approve) => {
        const url = `/classrooms/${classroom._id}/join-requests/${student._id}`;
        try {
            await (approve ? api.post(`${url}/approve`) : api.delete(url));
            setStudents((prev) => prev.filter((s) => s._id !== student._id));
            onChange((c) => ({
                pendingStudents: c.pendingStudents.filter((id) => id !== student._id),
                ...(approve && { students: [...c.students, student._id] }),
            }));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    if (students.length === 0 && !error) return null;

    return (
        <div className={card}>
            <p className="mb-2 font-bold">Join requests ({students.length})</p>
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            {students.map((s) => (
                <div key={s._id} className="flex items-center justify-between gap-2 py-1.5 border-t border-grader-border text-sm">
                    <span className="min-w-0 break-words">
                        <span className="font-bold">{s.name}</span> <span className="text-grader-muted">{s.email}</span>
                    </span>
                    <span className="shrink-0 flex gap-2">
                        <button
                            type="button"
                            onClick={() => answer(s, true)}
                            className="px-2 py-0.5 rounded-[3px] bg-grader-green text-white font-bold hover:brightness-110"
                        >
                            Approve
                        </button>
                        <button
                            type="button"
                            onClick={() => answer(s, false)}
                            className="px-2 py-0.5 rounded-[3px] border border-grader-border bg-white text-grader-text font-bold"
                        >
                            Decline
                        </button>
                    </span>
                </div>
            ))}
        </div>
    );
};

// Professor's roster for the selected class: who's enrolled, the student limit, and Remove buttons.
// Starts collapsed so the quizzes stay near the top.
const ClassRoster = ({ classroom, onChange }) => {
    const [students, setStudents] = useState([]);
    const [limit, setLimit] = useState(String(classroom.studentLimit));
    const [error, setError] = useState('');
    const count = classroom.students.length;
    const isFull = count >= classroom.studentLimit;

    // Reloads when another class is picked or someone joins or leaves
    useEffect(() => {
        setError('');
        api.get(`/classrooms/${classroom._id}/students`)
            .then(({ data }) => setStudents(data))
            .catch((err) => setError(errorMessage(err)));
    }, [classroom._id, count]);

    useEffect(() => setLimit(String(classroom.studentLimit)), [classroom._id, classroom.studentLimit]);

    const saveLimit = async (e) => {
        e.preventDefault();
        try {
            const { data } = await api.patch(`/classrooms/${classroom._id}`, { studentLimit: limit });
            onChange(() => ({ studentLimit: data.studentLimit }));
            setError('');
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    const remove = async (student) => {
        if (!window.confirm(`Remove ${student.name} from ${classroom.courseCode}? They can ask to join again later.`)) return;
        try {
            await api.delete(`/classrooms/${classroom._id}/students/${student._id}`);
            onChange((c) => ({ students: c.students.filter((id) => id !== student._id) }));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    return (
        <details className={card}>
            <summary className="cursor-pointer font-bold">
                Students ({count} / {classroom.studentLimit})
                {isFull && <span className="ml-2 text-sm text-red-600">Full</span>}
            </summary>

            <form onSubmit={saveLimit} className="flex items-center gap-2 mt-3 text-sm">
                <label htmlFor="student-limit" className="font-bold text-grader-muted">Student limit</label>
                <input
                    id="student-limit"
                    type="number"
                    min={Math.max(1, count)}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    className="w-20 px-2 py-1 border border-grader-border rounded-[3px]"
                />
                <button
                    type="submit"
                    disabled={limit === String(classroom.studentLimit)}
                    className="px-2 py-1 rounded-[3px] bg-grader-green text-white font-bold hover:brightness-110 disabled:opacity-60"
                >
                    Save
                </button>
            </form>
            {error && <p className="mt-2 mb-0 text-sm text-red-600">{error}</p>}

            {students.length === 0 ? (
                <p className="mt-3 mb-0 text-sm text-grader-muted italic">
                    No students yet. Students find this class with the search bar and ask to join.
                </p>
            ) : (
                <div className="mt-3">
                    {students.map((s) => (
                        <div key={s._id} className="flex items-center justify-between gap-2 py-1.5 border-t border-grader-border text-sm">
                            <span className="min-w-0 break-words">
                                <span className="font-bold">{s.name}</span> <span className="text-grader-muted">{s.email}</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => remove(s)}
                                className="shrink-0 px-2 py-0.5 rounded-[3px] border border-grader-border bg-white text-grader-text font-bold hover:text-red-600"
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </details>
    );
};

const NewClassOverlay = ({ onClose, onCreated }) => {
    const [form, setForm] = useState({ className: '', courseCode: '', studentLimit: '25' });
    const [error, setError] = useState('');

    const handleChange = ({ currentTarget: input }) => setForm({ ...form, [input.name]: input.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const { data } = await api.post('/classrooms', form);
            onCreated(data);
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    return (
        <Overlay title="New class" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4 p-5">
                <div>
                    <label className={overlayLabel}>Class name</label>
                    <input name="className" placeholder="e.g. Intro to Computer Science" autoFocus onChange={handleChange} className={overlayInput} />
                </div>
                <div>
                    <label className={overlayLabel}>Course code</label>
                    <input name="courseCode" placeholder="e.g. CS101" onChange={handleChange} className={overlayInput} />
                </div>
                <div>
                    <label className={overlayLabel}>Student limit</label>
                    <input name="studentLimit" type="number" min="1" value={form.studentLimit} onChange={handleChange} className={overlayInput} />
                </div>
                {error && <p className="text-red-600 text-sm m-0">{error}</p>}
                <button type="submit" className={overlaySubmit}>Create class</button>
            </form>
        </Overlay>
    );
};

export default HomePage;
