require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');

const wipeData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // 1. Delete ALL Orders
        const orderResult = await Order.deleteMany({});
        console.log(`Deleted ${orderResult.deletedCount} orders.`);

        // 2. Delete ALL Users EXCEPT Admin
        const userResult = await User.deleteMany({
            role: { $ne: 'admin' }
        });
        console.log(`Deleted ${userResult.deletedCount} users (including partners and customers).`);

        console.log('Website is completely fresh and ready!');
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

wipeData();
