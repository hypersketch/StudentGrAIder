# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Student GrAIder is a quiz platform: professors build quizzes in classes, students join classes and take them. Multiple choice / true-false are auto-graded; open responses get an optional AI first pass (Claude) and a professor's final score. See README.md for the feature list, diagrams, and full API table.

## Commands

### Backend (run from `backend/server/`)
```
npm run server       # start with nodemon (auto-reload) on port 8081
npm test             # Jest + supertest against an in-memory MongoDB; no .env or internet needed
npm test -- timer    # run one test file by name
node mongodbtest.js  # standalone MongoDB connectivity diagnostic
node sendTestEmail.js you@example.com  # send one test email with the current mail settings
```

### Frontend (run from `frontend/`)
```
npm start                  # dev server on port 8096
CI=true npm run build      # production build; CI=true turns lint warnings into errors (use this to check changes)
```
The frontend has no tests yet.

## Environment setup

`backend/server/.env` (not committed):
```
DB_URL=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/studentgraider?appName=StudentGrAIder
ACCESS_TOKEN_SECRET=<random secret>
ENABLE_DEV_LOGIN=true      # optional: one-click "Test professor/student" logins (routes/devLogin.js). Never in production.
```

Optional, for AI grading of open responses (`utilities/aiGrader.js`). Without a key, AI grading is off and professors grade by hand.
```
ANTHROPIC_API_KEY=<key from console.anthropic.com>
AI_GRADER_MODEL=claude-haiku-5-5   # optional; this is the default
```

Optional, for password reset emails (`utilities/mailer.js`). Gmail (`GMAIL_USER` + `GMAIL_APP_PASSWORD`, an app password) wins over generic SMTP (`SMTP_HOST` etc.). With neither, emails go to a free Ethereal test inbox: nothing is delivered, and the backend logs a preview link instead. `node sendTestEmail.js <address>` checks the setup.
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=<smtp username>
SMTP_PASS=<smtp password>
MAIL_FROM=Student GrAIder <no-reply@yourdomain.com>
FRONTEND_URL=http://localhost:8096   # where the emailed reset link points
```

`frontend/.env` (committed): `PORT=8096`, `REACT_APP_BACKEND_SERVER_URI=http://localhost:8081`.

## Architecture

**Two independent apps** - no monorepo tooling, no shared code. Install and run each folder separately.

### Backend startup
`server.js` requires the route files; each route file pulls in the models, middleware, and utilities it needs on first require (Node caches each file, so it loads once). Then `server.js` connects to MongoDB (`config/db.config.js`), mounts the routers, mounts `routes/devLogin.js` only if `ENABLE_DEV_LOGIN=true`, starts a once-a-minute `finishExpiredAttempts()` sweep, and listens on 8081.

Mount points: `/user` (login, signup, password reset, refresh-token, dev-login), `/classrooms`, `/classrooms/:classroomId/quizzes`, `/classrooms/:classroomId/quizzes/:quizId/attempts`, `/classrooms/:classroomId/grades`. Nested routers use `express.Router({ mergeParams: true })` to read parent params.

### Request flow
Frontend `utilities/api.js` (axios, adds `Authorization: Bearer <token>`) -> route -> **middleware chain runs first, left to right, any step can stop the request** -> route handler -> utilities / models -> JSON response.
- `middleware/auth.js`: `verifyToken` (sets `req.user` = `{ id, email, name, role }`), `requireProfessor`, `requireStudent`, `requireRole(...)`.
- `middleware/loaders.js`: `loadClassroom` -> `req.classroom`, `loadQuiz` -> `req.quiz` (only if it belongs to that class), both 404 otherwise. `isOwner(req)` / `isEnrolled(req)` are plain checks, not middleware.
- `routes/attempts.js` bundles chains as `studentOnly` and `ownerOnly`; other routes list middleware inline.

### Backend layout
- `models/` - Mongoose schemas: `userModel` (unique email; unique name, case-insensitive via collation), `classroomModel` (`students`, `pendingStudents` join requests, `studentLimit` default 25), `quizModel` (embedded questions: multiple_choice / true_false / open_response; `published` false = draft; `timeLimitMinutes`, `dueAt`, `maxAttempts`), `attemptModel` (answers with a copy of each question, `deadlineAt`, `savedAnswers`, AI/professor scores). Validators (zod) in `userValidator.js` and `classroomValidator.js`.
- `routes/` - one file per area; see README.md for every endpoint.
- `utilities/finishAttempt.js` - deadlines, autosave cleaning, grading a submission (`finishAttempt`), auto-submitting timed-out attempts (`finishExpiredAttempts`).
- `utilities/grades.js` - score rules shared by quiz cards and the gradebook (`scoreTotals`, `bestSubmitted`, `quizGrade`, `overallGrade`).
- `utilities/aiGrader.js` (the Claude call) and `utilities/aiGrading.js` (applies AI grades to attempts; `queueAIGrading` runs in the background after each submit).
- `utilities/mailer.js`, `utilities/generateToken.js` (1-hour JWTs).

### Frontend layout
- `src/index.js` -> `src/App.js` (routes; `UserContext`; starts `utilities/session.js` keep-alive).
- `components/pages/` - one file per screen: `homePage` (sidebar, class search, join requests, roster, quiz cards, overall grade), `quizMakerPage` (create/view/edit, drafts, settings, delete), `takeQuizPage` (start, timer, autosave, results), `gradeQuizPage` (open-response grading, AI score), `gradebookPage`, `loginPage`, `registerPage`, `forgotPasswordPage`, `resetPasswordPage`. Login/signup/forgot/reset render as overlays on top of `homePage` (`components/overlay.js`).
- `utilities/` - `api.js` (axios instance + `errorMessage`), `decodeJwt.js` (reads the token client-side, no verification), `session.js` (refreshes the login while the user is active or a quiz is open), `percent.js`, `dueDate.js`.
- Styling is Tailwind with custom `grader-*` colors in `tailwind.config.js`. Bootstrap CSS is still loaded and its `!important` utilities (e.g. `p-5`, `mb-3`, `border`) override Tailwind's same-named classes, so removing Bootstrap changes the look.

## Key rules (don't break these)
- **Attempts are graded on what the student saw.** Answers store a copy of question text/points/options at submit; later quiz edits never change submitted attempts. Review and grading use `answer.points`, falling back to the quiz only for old attempts.
- **The server owns the timer.** `deadlineAt` = min(start + time limit, due date), set at start. Submits after deadline + 20s grace grade `savedAnswers` instead of the request body. Finishing is a conditional update on `status: 'in_progress'` so it can only happen once.
- **Students never see which multiple choice / true-false answers were right** (`attemptForStudent` strips `isCorrect` and per-question points).
- **Professor scores always beat AI scores.** `pointsAwarded` for an open response = `professorScore` if set, else `aiScore`. The P box is a running score (ungraded open responses count 0); `professorReviewed` says when it's final.
- **Overall grade = average of quiz percentages** (equal weight), best attempt per quiz; past-due never-submitted quizzes count 0; drafts never count.
- **Drafts are invisible to students** (quiz list filter + `requirePublished` on attempt routes) and skip validation until published.

## Conventions
- **Tests:** one file per feature in `backend/server/__tests__/`. Quiz-related files share `quizFixtures.js` (`useTestDatabase`, made-up users, `setup()`, `start()`). `testEnv.js` blanks `ANTHROPIC_API_KEY`, `SMTP_HOST` and the `GMAIL_*` settings so tests never call paid services; mock `utilities/aiGrader` and `utilities/mailer` with `jest.mock`. Add tests for every new route, including the 401/403/404 cases.
- **Errors:** routes answer `{ message }` with a status code; the frontend shows it via `errorMessage(err)`.
- **No em dashes** in UI text, comments, or docs - use a plain hyphen.
- **Line endings:** files are CRLF in the working tree (git `core.autocrlf=true`, LF in the repo). Keep CRLF when editing.
- **Editing via the shell:** JavaScript template literals (backticks, `${...}`) get mangled inside bash `-e` strings and heredocs. Write multi-line patches or scripts to a file first, or use the Edit tool.
- **Dependencies:** pin new packages to a release at least two weeks old (`--save-exact`) and run `npm audit --omit=dev` after installing. Never `npm audit fix --force` in `frontend/` (it breaks `react-scripts`).
