// Draft quizzes: hidden from students until published
const {
    useTestDatabase,
    request, app, quizModel, professor, student, auth, questions, setup, start,
} = require('./quizFixtures');

useTestDatabase();

describe('draft quizzes', () => {
    // An unfinished multiple choice question: no text, blank options, no correct answer picked
    const unfinished = { type: 'multiple_choice', text: '', options: ['', '', '', ''], correctOptionIndex: null, points: 1 };

    const saveDraft = (classroom, body) => request(app).post(`/classrooms/${classroom._id}/quizzes`).set(auth(professor))
        .send({ title: 'Draft quiz', questions: [unfinished], published: false, ...body });

    test('a draft can be saved unfinished, but needs a name', async () => {
        const { classroom } = await setup();
        const res = await saveDraft(classroom);
        expect(res.status).toBe(201);
        expect(res.body.published).toBe(false);
        expect((await saveDraft(classroom, { title: '  ' })).status).toBe(400);
        expect((await saveDraft(classroom, { questions: [] })).status).toBe(201);
    });

    test('students never see drafts; the professor sees them marked as drafts', async () => {
        const { classroom } = await setup();
        const { body: draft } = await saveDraft(classroom);
        const listUrl = `/classrooms/${classroom._id}/quizzes`;

        const forStudent = (await request(app).get(listUrl).set(auth(student))).body;
        expect(forStudent.map((q) => q.title)).toEqual(['Quiz 1']);
        expect(forStudent[0].published).toBeUndefined();

        const forProfessor = (await request(app).get(listUrl).set(auth(professor))).body;
        expect(forProfessor.find((q) => q._id === draft._id).published).toBe(false);
        expect(forProfessor.find((q) => q.title === 'Quiz 1').published).toBe(true);

        const base = `${listUrl}/${draft._id}/attempts`;
        expect((await request(app).get(`${base}/mine`).set(auth(student))).status).toBe(404);
        expect((await start(base)).status).toBe(404);
    });

    test('publishing checks the whole quiz, then students can take it', async () => {
        const { classroom } = await setup();
        const { body: draft } = await saveDraft(classroom);
        const url = `/classrooms/${classroom._id}/quizzes/${draft._id}`;

        const tooSoon = await request(app).put(url).set(auth(professor)).send({ title: 'Draft quiz', questions: [unfinished], published: true });
        expect(tooSoon.status).toBe(400);
        expect((await quizModel.findById(draft._id)).published).toBe(false);

        const ready = await request(app).put(url).set(auth(professor)).send({ title: 'Ready quiz', questions: questions.slice(0, 1), published: true });
        expect(ready.status).toBe(200);
        expect(ready.body.published).toBe(true);
        expect((await start(`${url}/attempts`)).status).toBe(201);
    });

    test('a published quiz can go back to being a draft', async () => {
        const { classroom, quiz, base } = await setup();
        const res = await request(app).put(`/classrooms/${classroom._id}/quizzes/${quiz._id}`).set(auth(professor))
            .send({ title: 'Quiz 1', questions, published: false });
        expect(res.body.published).toBe(false);
        expect((await request(app).get(`${base}/mine`).set(auth(student))).status).toBe(404);
    });
});
