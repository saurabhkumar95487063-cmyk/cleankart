const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../models/User');

async function checkWallets() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const users = await User.find({ role: { $in: ['pickup_agent', 'delivery_agent', 'laundry_partner'] } });
        
        console.log('--- Partner Wallet Status ---');
        users.forEach(u => {
            console.log(`Name: ${u.name}`);
            console.log(`Role: ${u.role}`);
            console.log(`Today Earnings: ₹${u.todayEarnings}`);
            console.log(`Main Wallet: ₹${u.mainWallet}`);
            console.log(`Last Update: ${u.lastEarningUpdate}`);
            console.log('---------------------------');
        });
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

checkWallets();
