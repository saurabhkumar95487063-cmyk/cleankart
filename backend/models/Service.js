const mongoose = require('mongoose');

const serviceSchema = mongoose.Schema({
    category: { type: String, required: true }, // Men's Wear, Women's Wear, Home & Others
    name: { type: String, required: true },
    price: { type: Number, required: true }, // Default/Base price
    prices: [
        {
            serviceType: { type: String }, // e.g., 'Wash & Iron', 'Dry Clean'
            price: { type: Number }
        }
    ],
    image: { type: String, default: 'placeholder.png' },
    icon: { type: String, default: 'fas fa-shirt' }
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);
