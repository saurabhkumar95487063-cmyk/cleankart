require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');
const http = require('http');

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');
        
        // Find the laundry partner
        const laundry = await User.findOne({ email: 'laundry@cleankart.com' });
        
        // Reset order for testing
        const orderId = '6a094819a4fddfc3f151bb56';
        await Order.findByIdAndUpdate(orderId, {
            status: 'Placed',
            $unset: { laundryPartner: 1, pickupAgent: 1 }
        });
        
        // Mock the request
        const req = {
            params: { id: orderId },
            body: { status: 'Laundry Confirmed' },
            user: { _id: laundry._id, role: 'laundry_partner' }
        };
        
        const res = {
            json: (data) => console.log('SUCCESS:', data.status, data.laundryPartner),
            status: (code) => ({ json: (err) => console.error('ERROR', code, err) })
        };
        
        // Require the controller and run it manually
        const { updateOrderStatus } = require('../controllers/orderController');
        await updateOrderStatus(req, res);
        
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
test();
