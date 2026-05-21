require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function testAdminLogin() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const email = 'admin@cleankart.com';
        const password = 'admin123';

        console.log(`Searching for admin user with email: ${email}`);
        const user = await User.findOne({ email });

        if (!user) {
            console.error('❌ Admin user NOT found in database!');
            mongoose.connection.close();
            return;
        }

        console.log('✅ Admin user found in database!');
        console.log(`Name: ${user.name}`);
        console.log(`Email: ${user.email}`);
        console.log(`Phone: ${user.phone}`);
        console.log(`Role: ${user.role}`);
        console.log(`Status: ${user.status}`);
        console.log(`IsVerified: ${user.isVerified}`);

        console.log('\nValidating password...');
        const isMatch = await user.matchPassword(password);
        if (isMatch) {
            console.log('🎉 SUCCESS: Admin password is CORRECT! You can log in with "admin123".');
        } else {
            console.error('❌ FAILURE: Admin password does NOT match in the database!');
        }

        mongoose.connection.close();
    } catch (err) {
        console.error('Database connection error:', err);
    }
}

testAdminLogin();
