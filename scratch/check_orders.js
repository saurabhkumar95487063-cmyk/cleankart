require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User'); // Required to register model
const Order = require('../models/Order');

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB!');
        
        const orders = await Order.find().populate('pickupAgent deliveryAgent laundryPartner', 'name email role');
        console.log('Orders in DB:', JSON.stringify(orders, null, 2));
        
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
check();
