const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');
        const users = await User.find({});
        console.log('All Users in DB:');
        console.log(JSON.stringify(users.map(u => ({
            name: u.name,
            email: u.email,
            phone: u.phone,
            role: u.role,
            isVerified: u.isVerified,
            status: u.status
        })), null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
run();
