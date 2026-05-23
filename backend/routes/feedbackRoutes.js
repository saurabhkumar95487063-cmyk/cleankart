const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Feedback = require('../models/Feedback');
const User = require('../models/User');

// POST /api/feedback - Submit feedback
router.post('/', async (req, res) => {
    try {
        const { name, email, rating, message } = req.body;

        if (!name || !email || !rating || !message) {
            return res.status(400).json({ message: 'All fields (name, email, rating, message) are required' });
        }

        // Try to associate with a logged-in user if token is provided
        let userId = null;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
            } catch (err) {
                // Ignore token errors, treat as guest or pre-filled but token expired
                console.log('Feedback submission token decoding failed, proceeding without user ref');
            }
        }

        const feedback = new Feedback({
            user: userId,
            name,
            email,
            rating: Number(rating),
            message
        });

        await feedback.save();
        res.status(201).json({ message: 'Feedback submitted successfully', feedback });
    } catch (err) {
        console.error('Error submitting feedback:', err);
        res.status(500).json({ message: 'Server error while submitting feedback' });
    }
});

module.exports = router;
