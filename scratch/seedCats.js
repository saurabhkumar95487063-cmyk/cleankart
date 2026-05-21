require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../models/Category');

async function seed() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const defaults = [
            { name: "Men's Wear", icon: 'fas fa-shirt' },
            { name: "Women's Wear", icon: 'fas fa-person-dress' },
            { name: "Home & Others", icon: 'fas fa-house' }
        ];
        for (let d of defaults) {
            await Category.findOneAndUpdate({ name: d.name }, d, { upsert: true });
        }
        console.log('Default categories seeded successfully');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
seed();
