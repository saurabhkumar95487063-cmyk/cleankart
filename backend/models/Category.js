const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    icon: { type: String, default: 'fas fa-box' },
    subCategories: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
