import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import getUserInfo from '../../utilities/decodeJwt';
import api, { errorMessage } from '../../utilities/api';
import Overlay, { overlayInput, overlayLabel, overlaySubmit } from '../overlay';

const headerButton = 'ml-2.5 px-2.5 py-1.5 rounded-[3px] bg-grader-green text-white text-sm no-underline hover:text-white';
const card = 'border border-grader-text rounded-md p-[15px] mb-[15px] bg-white';

// What a student sees on a quiz card, from the myAttempt summary the quiz list returns
const attemptLabel = (attempt) => {
    if (!attempt) return 'Take quiz →';
    if (attempt.status === 'in_progress') return 'Resume →';
    const score = `${attempt.totalScoreAwarded} / ${attempt.totalPointsPossible} pts`;
    return attempt.status === 'graded' ? score : `${score} · awaiting grading`;
};

// The site's front page. Logged-out visitors see the same layout with
// Log In / Sign Up buttons in place of their classes and quizzes.
// The selected class lives in the URL (?class=<id>) so it survives coming back from the quiz maker.
const HomePage = () => {
    // Read the token on first render so logged-in users don't see a flash of the logged-out page
    const [user, setUser] = useState(() => getUserInfo());
    const [classes, setClasses] = useState([]);
    const [quizzes, setQuizzes] = useState([]);
    const [showNewClass, setShowNewClass] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();

    const isProfessor = user?.role === 'professor';
    const selectedClass = classes.find((c) => c._id === searchParams.get('class')) || classes[0];

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

    useEffect(() => {
        if (!selectedClass) return;
        api.get(`/classrooms/${selectedClass._id}/quizzes`).then(({ data }) => setQuizzes(data)).catch(handleError);
    }, [selectedClass, handleError]);

    const handleClassCreated = (classroom) => {
        setClasses((prev) => [...prev, classroom].sort((a, b) => a.courseCode.localeCompare(b.courseCode)));
        selectClass(classroom._id);
        setShowNewClass(false);
    };

    return (
        <div className="flex min-h-screen bg-white font-sans">
            {/* Sidebar */}
            <aside className="w-[220px] shrink-0 flex flex-col bg-grader-sidebar border-r border-grader-border p-[15px]">
                <h2 className="text-[1.4em] font-bold mb-5">
                    Student <span className="text-green-700">GrAIder</span>
                </h2>

                {!isProfessor && (
                    <div className="flex mb-5">
                        <input
                            type="text"
                            placeholder="Find My Professor"
                            className="flex-1 min-w-0 p-[5px] border border-grader-border text-sm"
                        />
                        <button
                            type="button"
                            aria-label="Search"
                            className="w-[30px] flex items-center justify-center bg-grader-mint"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="11" cy="11" r="7" />
                                <line x1="16.5" y1="16.5" x2="21" y2="21" />
                            </svg>
                        </button>
                    </div>
                )}

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
                            {c.courseCode} — {c.className}
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
                    ) : !selectedClass ? (
                        <div className={`${card} text-grader-muted`}>
                            {isProfessor
                                ? 'Create your first class with "+ New class" in the sidebar, then add quizzes to it.'
                                : 'No quizzes yet. Quizzes from your classes will show up here.'}
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between mb-[15px]">
                                <h3 className="text-[1.1em] font-bold text-grader-text m-0">
                                    {selectedClass.courseCode} — {selectedClass.className}
                                </h3>
                                {isProfessor && (
                                    <Link
                                        to={`/classes/${selectedClass._id}/quizzes/new`}
                                        className="px-2.5 py-1.5 rounded-[3px] bg-grader-green text-white text-sm font-bold no-underline hover:text-white"
                                    >
                                        + Create quiz
                                    </Link>
                                )}
                            </div>

                            {quizzes.length === 0 ? (
                                <div className={`${card} text-grader-muted`}>
                                    {isProfessor ? 'No quizzes in this class yet.' : 'No quizzes in this class yet. Check back later.'}
                                </div>
                            ) : (
                                quizzes.map((q) => {
                                    const body = (
                                        <>
                                            <p className="mb-0 font-bold">{q.title}</p>
                                            <div className="flex items-center justify-between mt-2.5 gap-[5px]">
                                                <span className="text-sm text-grader-muted">
                                                    {q.questionCount} question{q.questionCount === 1 ? '' : 's'} · {q.totalPoints} pts
                                                    {q.timeLimitMinutes ? ` · ${q.timeLimitMinutes} min` : ''}
                                                </span>
                                                {!isProfessor && (
                                                    <span className="text-sm font-bold text-grader-navy">{attemptLabel(q.myAttempt)}</span>
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

const NewClassOverlay = ({ onClose, onCreated }) => {
    const [form, setForm] = useState({ className: '', courseCode: '' });
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
                {error && <p className="text-red-600 text-sm m-0">{error}</p>}
                <button type="submit" className={overlaySubmit}>Create class</button>
            </form>
        </Overlay>
    );
};

export default HomePage;
