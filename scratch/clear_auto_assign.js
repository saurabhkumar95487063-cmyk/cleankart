require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User'); // Required to register model
const Order = require('../models/Order');

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB!');
        
        // Clear pickupAgent from any order that is not yet picked up
        // so they correctly show up in Available Pickups for the new testing flow
        const result = await Order.updateMany(
            { status: { $in: ['Placed', 'Laundry Confirmed'] } },
            { $unset: { pickupAgent: 1 } }
        );
        
        console.log(`Cleared auto-assign for ${result.modifiedCount} existing orders.`);
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
run();
