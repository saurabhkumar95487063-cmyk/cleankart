require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB!');

        // Find the customer user
        const customer = await User.findOne({ email: 'customer@cleankart.com' });
        if (!customer) {
            console.error('Customer not found!');
            process.exit(1);
        }

        // 1. Check if serviceable laundry partner exists
        const pincode = '110001';
        const serviceable = await User.findOne({
            role: 'laundry_partner',
            serviceArea: pincode,
            status: 'active'
        });
        
        console.log('Serviceable partner found:', serviceable ? `${serviceable.name} (${serviceable._id})` : 'NONE');

        if (!serviceable) {
            console.error('No active laundry partner found for pincode ' + pincode);
            process.exit(1);
        }

        // 2. Create mock order
        const mockOrderData = {
            user: customer._id,
            items: [
                {
                    name: 'Test Shirt',
                    price: 15,
                    quantity: 2
                }
            ],
            totalPrice: 150,
            deliveryFee: 20,
            address: {
                fullName: 'Test Customer AutoAssign',
                mobile: '9999999999',
                addressLine: '123 Test Street, Delhi',
                pincode: pincode
            },
            paymentMethod: 'Cash on Delivery',
            laundryPartner: serviceable._id // Simulation of the Controller assignment
        };

        const order = new Order(mockOrderData);
        const savedOrder = await order.save();
        console.log('Saved order successfully!');
        console.log('Order ID:', savedOrder._id);
        console.log('Assigned Laundry Partner:', savedOrder.laundryPartner);

        // Delete the test order afterwards to keep DB clean
        await Order.findByIdAndDelete(savedOrder._id);
        console.log('Deleted test order.');

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

test();
