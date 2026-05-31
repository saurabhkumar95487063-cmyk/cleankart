const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Order = require('./models/Order');
const User = require('./models/User');
const { addOrderItems, updateOrderStatus, getAllOrders } = require('./controllers/orderController');

dotenv.config();

// Helper to create mock response object
const mockResponse = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.data = data;
        return res;
    };
    return res;
};

async function runTest() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB!');

        // 1. Resolve test users
        const customer = await User.findOne({ role: 'user' });
        const admin = await User.findOne({ role: 'admin' });
        const laundryPartner = await User.findOne({ role: 'laundry_partner', status: 'active' });

        if (!customer || !admin || !laundryPartner) {
            console.error('Error: Could not find required test users (customer, admin, active laundry partner) in DB.');
            process.exit(1);
        }

        console.log(`Found Customer: ${customer.name} (${customer.email})`);
        console.log(`Found Admin: ${admin.name} (${admin.email})`);
        console.log(`Found Laundry Partner: ${laundryPartner.name} (${laundryPartner.email}), Service Area Pincode: ${laundryPartner.serviceArea}`);

        const pincode = laundryPartner.serviceArea;

        // 2. Create mock order as Customer
        const reqCreate = {
            user: customer,
            body: {
                items: [{ name: 'Test Shirt', price: 150, quantity: 2 }],
                totalPrice: 300,
                deliveryFee: 20,
                address: {
                    fullName: 'Test Customer Order',
                    mobile: '9876543210',
                    addressLine: 'Sector 12, Test City',
                    pincode: pincode
                },
                paymentMethod: 'Cash on Delivery'
            }
        };

        const resCreate = mockResponse();
        console.log('\n--- Step 1: Placing Order as Customer ---');
        await addOrderItems(reqCreate, resCreate);

        if (resCreate.statusCode && resCreate.statusCode !== 201) {
            throw new Error(`Failed to place order: ${JSON.stringify(resCreate.data)}`);
        }

        const createdOrder = resCreate.data;
        const orderId = createdOrder._id;
        console.log(`Order placed successfully. ID: ${orderId}, Initial Status in DB: ${createdOrder.status}`);
        
        if (createdOrder.status !== 'Pending') {
            throw new Error(`Expected initial status to be 'Pending', but got '${createdOrder.status}'`);
        }
        if (createdOrder.laundryPartner) {
            throw new Error(`Expected laundryPartner to be undefined/unset, but got '${createdOrder.laundryPartner}'`);
        }

        // 3. Query orders as Laundry Partner - Should not find this order
        console.log('\n--- Step 2: Listing orders as Laundry Partner (Order is Pending) ---');
        const reqLPList1 = {
            user: laundryPartner
        };
        const resLPList1 = mockResponse();
        await getAllOrders(reqLPList1, resLPList1);

        const ordersLP1 = resLPList1.data;
        const foundInLP1 = ordersLP1.some(o => o._id.toString() === orderId.toString());
        console.log(`Is the new order visible to Laundry Partner? ${foundInLP1}`);
        if (foundInLP1) {
            throw new Error('Order should NOT be visible to the Laundry Partner when status is Pending.');
        }

        // 4. Update status to 'Placed' as Admin (simulate Admin Confirmation)
        console.log('\n--- Step 3: Admin Confirming Order (Status -> Placed) ---');
        const reqAdminConfirm = {
            user: admin,
            params: { id: orderId },
            body: { status: 'Placed' }
        };
        const resAdminConfirm = mockResponse();
        await updateOrderStatus(reqAdminConfirm, resAdminConfirm);

        const confirmedOrder = resAdminConfirm.data;
        console.log(`Order status updated by Admin to: ${confirmedOrder.status}`);
        console.log(`Order laundryPartner assigned (should be undefined/null): ${confirmedOrder.laundryPartner}`);
        
        if (confirmedOrder.status !== 'Placed') {
            throw new Error(`Expected status to be updated to 'Placed', but got '${confirmedOrder.status}'`);
        }
        if (confirmedOrder.laundryPartner) {
            throw new Error(`Revert Failed: order.laundryPartner was automatically assigned to '${confirmedOrder.laundryPartner}' instead of remaining unclaimed.`);
        }

        // 5. Query orders as Laundry Partner again - Should find this order under "Available Orders to Claim"
        console.log('\n--- Step 4: Listing orders as Laundry Partner (Order is Placed) ---');
        const reqLPList2 = {
            user: laundryPartner
        };
        const resLPList2 = mockResponse();
        await getAllOrders(reqLPList2, resLPList2);

        const ordersLP2 = resLPList2.data;
        const foundInLP2 = ordersLP2.find(o => o._id.toString() === orderId.toString());
        console.log(`Is the new order visible to Laundry Partner now? ${!!foundInLP2}`);
        if (!foundInLP2) {
            throw new Error('Order should be visible to the Laundry Partner as Placed in their service area.');
        }
        console.log(`Matching Order status visible to Laundry Partner: ${foundInLP2.status}, laundryPartner field: ${foundInLP2.laundryPartner}`);

        // 6. Claim order as Laundry Partner (Status -> Laundry Confirmed)
        console.log('\n--- Step 5: Laundry Partner Claiming Order (Status -> Laundry Confirmed) ---');
        const reqLPClaim = {
            user: laundryPartner,
            params: { id: orderId },
            body: { status: 'Laundry Confirmed' }
        };
        const resLPClaim = mockResponse();
        await updateOrderStatus(reqLPClaim, resLPClaim);

        const claimedOrder = resLPClaim.data;
        console.log(`Order updated. New Status: ${claimedOrder.status}`);
        console.log(`Assigned Laundry Partner ID: ${claimedOrder.laundryPartner?._id || claimedOrder.laundryPartner}`);
        
        if (claimedOrder.status !== 'Laundry Confirmed') {
            throw new Error(`Expected status to update to 'Laundry Confirmed', but got '${claimedOrder.status}'`);
        }
        
        const assignedId = (claimedOrder.laundryPartner?._id || claimedOrder.laundryPartner).toString();
        if (assignedId !== laundryPartner._id.toString()) {
            throw new Error(`Expected laundryPartner to be set to '${laundryPartner._id}', but got '${assignedId}'`);
        }

        console.log('\n--- Test Successful! Revert of Auto-Assignment and Claim Pooling Flow (Option A) works perfectly! ---');

        // Cleanup
        console.log('\nCleaning up test order...');
        await Order.findByIdAndDelete(orderId);
        console.log('Cleanup complete.');

    } catch (error) {
        console.error('\nTest Failed with error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

runTest();
