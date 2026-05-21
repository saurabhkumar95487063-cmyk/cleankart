const mongoose = require('mongoose');
const Order = require('../models/Order');
const dotenv = require('dotenv');
dotenv.config();

const updatePincode = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Find the most recent order with pincode '243635'
        const order = await Order.findOne({ 'address.pincode': '243635' }).sort({ createdAt: -1 });

        if (!order) {
            console.log('No order found with pincode 243635');
            process.exit(1);
        }

        order.address.pincode = '110001';
        await order.save();

        console.log(`Updated pincode for order ${order._id} to 110001`);
        process.exit(0);
    } catch (err) {
        console.error('Update failed:', err);
        process.exit(1);
    }
};

updatePincode();
