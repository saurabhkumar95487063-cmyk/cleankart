require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    const orders = await Order.find().sort({ createdAt: -1 }).limit(5);
    console.log('Latest 5 Orders:');
    orders.forEach(o => {
        console.log(`Order ID: ${o._id}, Status: ${o.status}, Pincode: ${o.address?.pincode || 'NONE'}, Laundry: ${o.laundryPartner || 'NONE'}`);
    });
    process.exit();
}
check();
