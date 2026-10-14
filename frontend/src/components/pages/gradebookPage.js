import React, { useState, useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import getUserInfo from '../../utilities/decodeJwt';
import api, { errorMessage } from '../../utilities/api';
import percent from '../../utilities/percent';
import { formatDue } from '../../utilities/dueDate';

// How each kind of grade looks in a cell
const cell = (grade) => {
    switch (grade.status) {
        case 'graded': return { text: percent(grade.percent, 100), className: 'text-grader-text' };
        case 'pending': return { text: `${percent(grade.percent, 100)}*`, className: 'text-grader-text', title: 'Open responses still need grading' };
        case 'missed': return { text: 'Missed', className: 'text-[rgb(233,73,73)] font-bold', title: 'Past due and never submitted (counts as 0%)' };
        case 'in_progress': return { text: 'Taking', className: 'text-grader-muted italic', title: 'Started but not submitted yet' };
        default: return { text: '--', className: 'text-grader-muted', title: 'Not taken yet' };
    }
};

// Professor's gradebook for a class (/classes/:classId/gradebook): students down the side, published quizzes
// across the top, and each student's overall grade. Every quiz counts the same toward the overall.
const GradebookPage = () => {
    const { classId } = useParams();
    const [user] = useState(() => getUserInfo());
    const [book, setBook] = useState();
    const [loadError, setLoadError] = useState('');

    const isProfessor = user?.role === 'professor';

    useEffect(() => {
        if (!isProfessor) return;
        api.get(`/classrooms/${classId}/grades`)
            .then(({ data }) => setBook(data))
            .catch((err) => setLoadError(errorMessage(err)));
    }, [classId, isProfessor]);

    if (!isProfessor) return <Navigate to="/" replace />;

    const anyPending = book?.students.some((s) => s.grades.some((g) => g.status === 'pending'));

    return (
        <div className="flex flex-col min-h-screen font-sans">
            {/* Top bar */}
            <header className="min-h-[15vh] bg-grader-navy text-white p-[15px] flex flex-col">
                <Link to={`/?class=${classId}`} className="text-sm text-white/80 hover:text-white no-underline self-start">
                    ← Back to class
                </Link>
                <h1 className="text-[1.4em] font-bold text-center my-auto">
                    Gradebook{book && ` - ${book.classroom.courseCode} ${book.classroom.className}`}
                </h1>
            </header>

            {loadError ? (
                <p className="p-10 text-center text-grader-muted">{loadError}</p>
            ) : !book ? (
                <p className="p-10 text-center text-grader-muted">Loading grades…</p>
            ) : book.students.length === 0 || book.quizzes.length === 0 ? (
                <p className="p-10 text-center text-grader-muted">
                    {book.students.length === 0
                        ? 'No students in this class yet.'
                        : 'No published quizzes yet. Drafts don\'t appear in the gradebook.'}
                </p>
            ) : (
                <main className="flex-1 p-5">
                    {/* Scrolls sideways when there are many quizzes; the student column stays put */}
                    <div className="overflow-x-auto border border-grader-text rounded-md bg-white">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="bg-grader-sidebar text-grader-muted">
                                    <th className="sticky left-0 bg-grader-sidebar text-left px-3 py-2 border-b border-grader-border min-w-[180px]">Student</th>
                                    {book.quizzes.map((q) => (
                                        <th key={q._id} className="px-3 py-2 border-b border-grader-border text-center font-bold min-w-[110px]">
                                            <Link to={`/classes/${classId}/quizzes/${q._id}/grade`} className="text-grader-navy no-underline hover:underline">
                                                {q.title}
                                            </Link>
                                            {q.dueAt && <div className="text-xs font-normal">Due {formatDue(q.dueAt)}</div>}
                                        </th>
                                    ))}
                                    <th className="px-3 py-2 border-b border-grader-border text-center text-grader-text">Overall</th>
                                </tr>
                            </thead>
                            <tbody>
                                {book.students.map((s) => (
                                    <tr key={s._id} className="border-b border-grader-border last:border-b-0 hover:bg-grader-sidebar">
                                        <td className="sticky left-0 bg-white px-3 py-2">
                                            <div className="font-bold text-grader-text">{s.name}</div>
                                            <div className="text-xs text-grader-muted">{s.email}</div>
                                        </td>
                                        {s.grades.map((g) => {
                                            const c = cell(g);
                                            return (
                                                <td key={g.quizId} className={`px-3 py-2 text-center tabular-nums ${c.className}`} title={c.title}>
                                                    {c.text}
                                                </td>
                                            );
                                        })}
                                        <td className="px-3 py-2 text-center font-bold text-grader-navy tabular-nums">
                                            {percent(s.overall, 100)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className="mt-3 mb-0 text-xs text-grader-muted">
                        Overall is the average of each student's quiz grades so far; every quiz counts the same.
                        Missed means past due and never submitted (counts as 0%). "--" and "Taking" don't count yet.
                        {anyPending && ' * Open responses still need grading and count as 0 until marked.'}
                        {' '}Click a quiz title to grade it.
                    </p>
                </main>
            )}
        </div>
    );
};

export default GradebookPage;
