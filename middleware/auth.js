const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        next();
    });
}

function requireApprovedFabricator(req, res, next) {
    requireAuth(req, res, () => {
        if (!req.user.approved) return res.status(403).json({ error: 'Account pending approval' });
        next();
    });
}

module.exports = { requireAuth, requireAdmin, requireApprovedFabricator };
