require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');
        const users = await User.find({}, 'name email role status isVerified');
        console.log('Seeded Users in DB:', JSON.stringify(users, null, 2));
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
check();
