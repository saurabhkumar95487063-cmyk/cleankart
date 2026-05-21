const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../models/User');

async function forceWalletUpdate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        console.log('--- FORCE UPDATING ALL WALLETS (LOOP) ---');
        const users = await User.find({ 
            role: { $in: ['pickup_agent', 'delivery_agent', 'laundry_partner'] }, 
            todayEarnings: { $gt: 0 } 
        });
        
        for (let user of users) {
            console.log(`Processing ${user.name}...`);
            user.mainWallet = (user.mainWallet || 0) + user.todayEarnings;
            user.todayEarnings = 0;
            user.lastEarningUpdate = new Date('2026-05-15T23:59:59Z');
            await user.save();
        }
        
        console.log(`Updated ${users.length} users.`);
        
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

forceWalletUpdate();
