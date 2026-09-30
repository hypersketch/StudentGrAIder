const jwt = require('jsonwebtoken')
const dotenv = require('dotenv');
dotenv.config();

// Rejects requests without a valid "Authorization: Bearer <token>" header.
// On success, attaches the decoded payload ({ id, email, name, role }) to req.user.
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return res.status(401).send({ message: "Access denied. No token provided" })

    try {
        req.user = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
        next()
    } catch (err) {
        return res.status(401).send({ message: "Invalid or expired token" })
    }
}

// Use after verifyToken. Rejects users whose role is not in the allowed list.
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).send({ message: "You do not have permission to do this" })
    }
    next()
}

const requireProfessor = requireRole('professor')
const requireStudent = requireRole('student')

module.exports = { verifyToken, requireRole, requireProfessor, requireStudent }
