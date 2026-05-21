require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');

async function fix() {
    await mongoose.connect(process.env.MONGO_URI);
    const result = await Order.updateMany(
        { status: 'Placed', 'address.pincode': '243635' },
        { $set: { 'address.pincode': '110001' } }
    );
    console.log(`Updated ${result.modifiedCount} orders to pincode 110001`);
    process.exit();
}
fix();
