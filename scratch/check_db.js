const mongoose = require('mongoose');
const Order = require('./backend/models/Order');
require('dotenv').config({ path: './backend/.env' });

async function run() {
    try {
        console.log("Connecting to:", process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully");
        const orders = await Order.find().sort({ createdAt: -1 }).limit(10);
        console.log("Latest 10 orders:");
        orders.forEach(o => {
            console.log(`ID: ${o._id}, Status: ${o.status}, LaundryPartner: ${o.laundryPartner}, createdAt: ${o.createdAt}`);
        });
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
