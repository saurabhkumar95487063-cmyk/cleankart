require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');

const prepare = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB!');
        
        // Reset the placed order for a complete pool testing flow
        const orderId = '6a094819a4fddfc3f151bb56';
        const result = await Order.findByIdAndUpdate(
            orderId,
            {
                $set: {
                    status: 'Placed',
                    'address.pincode': '110001'
                },
                $unset: {
                    pickupAgent: '',
                    laundryPartner: '',
                    deliveryAgent: ''
                }
            },
            { new: true }
        );
        
        if (result) {
            console.log('Order reset successfully for claim testing:', JSON.stringify(result, null, 2));
        } else {
            console.log('Order not found in DB to reset');
        }
        
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
prepare();
