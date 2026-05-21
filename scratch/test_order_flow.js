require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');

const runFlow = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB!');

        // Find users
        const customer = await User.findOne({ email: 'customer@cleankart.com' });
        const pickupAgent = await User.findOne({ email: 'pickup@cleankart.com' });
        const laundryPartner = await User.findOne({ email: 'laundry@cleankart.com' });
        const deliveryAgent = await User.findOne({ email: 'delivery@cleankart.com' });

        if (!customer || !pickupAgent || !laundryPartner || !deliveryAgent) {
            console.error('Test users are missing!');
            process.exit(1);
        }

        console.log('Found all test users.');

        // 1. Create a test order (Placed) auto-assigned to laundry partner
        const order = new Order({
            user: customer._id,
            items: [{ name: 'Test Suit', price: 200, quantity: 1 }],
            totalPrice: 200,
            deliveryFee: 20,
            address: {
                fullName: 'Test Customer Flow',
                mobile: '1234567890',
                addressLine: 'Test Address Line',
                pincode: '110001'
            },
            paymentMethod: 'Cash on Delivery',
            laundryPartner: laundryPartner._id,
            status: 'Placed'
        });

        let savedOrder = await order.save();
        console.log('\n--- STEP 1: Order Placed ---');
        console.log(`Order ID: ${savedOrder._id}, Status: ${savedOrder.status}, Assigned Laundry Partner: ${savedOrder.laundryPartner}`);

        // Define helper function to simulate status update
        const updateStatus = async (orderId, targetStatus, user) => {
            const ord = await Order.findById(orderId);
            if (!ord) throw new Error('Order not found');

            ord.status = targetStatus;
            
            // Claiming logic
            if (targetStatus === 'Pickup Assigned' && user.role === 'pickup_agent') {
                ord.pickupAgent = user._id;
            } else if (targetStatus === 'Delivery Assigned' && user.role === 'delivery_agent') {
                ord.deliveryAgent = user._id;
            }

            const updated = await ord.save();
            return updated;
        };

        // 2. Pickup Agent claims the order (Pickup Assigned)
        savedOrder = await updateStatus(savedOrder._id, 'Pickup Assigned', pickupAgent);
        console.log('\n--- STEP 2: Claimed by Pickup Agent ---');
        console.log(`Status: ${savedOrder.status}, Pickup Agent: ${savedOrder.pickupAgent}`);

        // 3. Pickup Agent marks as Picked
        savedOrder = await updateStatus(savedOrder._id, 'Picked', pickupAgent);
        console.log('\n--- STEP 3: Picked Up ---');
        console.log(`Status: ${savedOrder.status}`);

        // 4. Pickup Agent marks as Dropped at Laundry
        savedOrder = await updateStatus(savedOrder._id, 'Dropped at Laundry', pickupAgent);
        console.log('\n--- STEP 4: Dropped at Laundry ---');
        console.log(`Status: ${savedOrder.status}`);

        // 5. Laundry Partner confirms order (Arrived in Laundry)
        savedOrder = await updateStatus(savedOrder._id, 'Arrived in Laundry', laundryPartner);
        console.log('\n--- STEP 5: Arrived in Laundry (Confirmed) ---');
        console.log(`Status: ${savedOrder.status}`);

        // 6. Laundry Partner starts washing
        savedOrder = await updateStatus(savedOrder._id, 'Washing', laundryPartner);
        console.log('\n--- STEP 6: Washing ---');
        console.log(`Status: ${savedOrder.status}`);

        // 7. Laundry Partner marks ready
        savedOrder = await updateStatus(savedOrder._id, 'Ready', laundryPartner);
        console.log('\n--- STEP 7: Ready ---');
        console.log(`Status: ${savedOrder.status}`);

        // 8. Delivery Agent claims the order (Delivery Assigned)
        savedOrder = await updateStatus(savedOrder._id, 'Delivery Assigned', deliveryAgent);
        console.log('\n--- STEP 8: Claimed by Delivery Agent ---');
        console.log(`Status: ${savedOrder.status}, Delivery Agent: ${savedOrder.deliveryAgent}`);

        // 9. Delivery Agent picks up (Out for Delivery)
        savedOrder = await updateStatus(savedOrder._id, 'Out for Delivery', deliveryAgent);
        console.log('\n--- STEP 9: Out for Delivery ---');
        console.log(`Status: ${savedOrder.status}`);

        // 10. Delivery Agent delivers (Delivered)
        savedOrder = await updateStatus(savedOrder._id, 'Delivered', deliveryAgent);
        console.log('\n--- STEP 10: Delivered ---');
        console.log(`Status: ${savedOrder.status}`);

        // Cleanup
        await Order.findByIdAndDelete(savedOrder._id);
        console.log('\nCleaned up test order.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

runFlow();
