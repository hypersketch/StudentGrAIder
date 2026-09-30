const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { verifyToken, requireProfessor } = require('../middleware/auth');
const { generateAccessToken } = require('../utilities/generateToken');

const app = express();
app.get('/protected', verifyToken, (req, res) => res.send({ user: req.user }));
app.get('/professor-only', verifyToken, requireProfessor, (req, res) => res.send({ ok: true }));

const studentToken = generateAccessToken('student-id', 's@example.com', 'Student One', 'student');
const professorToken = generateAccessToken('prof-id', 'p@example.com', 'Professor One', 'professor');

describe('verifyToken', () => {
    test('rejects requests with no token with 401', async () => {
        const res = await request(app).get('/protected');
        expect(res.status).toBe(401);
    });

    test('rejects a token signed with the wrong secret with 401', async () => {
        const forged = jwt.sign({ id: 'x', role: 'professor' }, 'not-the-real-secret');
        const res = await request(app).get('/protected').set('Authorization', `Bearer ${forged}`);
        expect(res.status).toBe(401);
    });

    test('rejects an expired token with 401', async () => {
        const expired = jwt.sign({ id: 'x', role: 'student' }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: -10 });
        const res = await request(app).get('/protected').set('Authorization', `Bearer ${expired}`);
        expect(res.status).toBe(401);
    });

    test('accepts a valid token and exposes the payload on req.user', async () => {
        const res = await request(app).get('/protected').set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(200);
        expect(res.body.user.name).toBe('Student One');
        expect(res.body.user.role).toBe('student');
    });
});

describe('requireProfessor', () => {
    test('rejects students with 403', async () => {
        const res = await request(app).get('/professor-only').set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(403);
    });

    test('allows professors', async () => {
        const res = await request(app).get('/professor-only').set('Authorization', `Bearer ${professorToken}`);
        expect(res.status).toBe(200);
    });

    test('rejects anonymous requests with 401 before checking role', async () => {
        const res = await request(app).get('/professor-only');
        expect(res.status).toBe(401);
    });
});
