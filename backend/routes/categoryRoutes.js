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
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Category name is required' });
        }
        const category = await Category.create({ 
            name: name.trim(), 
            icon: icon && icon.trim() ? icon.trim() : 'fas fa-tags' 
        });
        res.status(201).json(category);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Category with this name already exists' });
        }
        res.status(400).json({ message: err.message || 'Failed to create category' });
    }
});

// Update category (Admin only)
router.put('/:id', protect, admin, async (req, res) => {
    try {
        const { name, icon } = req.body;
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
        if (name) category.name = name.trim();
        if (icon) category.icon = icon.trim();
        const updatedCategory = await category.save();
        res.json(updatedCategory);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Category name already in use' });
        }
        res.status(400).json({ message: err.message });
    }
});

// Delete category (Admin only)
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
        await category.deleteOne();
        res.json({ message: 'Category deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
