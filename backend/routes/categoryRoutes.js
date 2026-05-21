const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const { protect, admin } = require('../middleware/authMiddleware');

// Get all categories
router.get('/', async (req, res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add new category (Admin only)
router.post('/', protect, admin, async (req, res) => {
    try {
        const { name, icon } = req.body;
        const category = await Category.create({ name, icon });
        res.status(201).json(category);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

module.exports = router;
