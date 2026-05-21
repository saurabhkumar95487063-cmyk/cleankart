require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Address = require('../models/Address');

async function clearDemoData() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        console.log('Clearing all Orders...');
        const ordersResult = await Order.deleteMany({});
        console.log(`Deleted ${ordersResult.deletedCount} orders.`);

        console.log('Clearing all saved Addresses...');
        const addressesResult = await Address.deleteMany({});
        console.log(`Deleted ${addressesResult.deletedCount} addresses.`);

        console.log('Resetting all users wallet balances, earnings, completed orders counts, and cash in hand to 0...');
        const usersResult = await User.updateMany({}, {
            $set: {
                todayEarnings: 0,
                mainWallet: 0,
                completedOrdersCount: 0,
                cashInHand: 0
            }
        });
        console.log(`Updated stats for ${usersResult.modifiedCount} users.`);

        console.log('All test demo data successfully cleared!');
        process.exit(0);
    } catch (err) {
        console.error('Error clearing demo data:', err);
        process.exit(1);
    }
}

clearDemoData();
