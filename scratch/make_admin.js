const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
// Note: If you have other models like Order, Service, include them here
// const Order = require('../models/Order');

dotenv.config();

const makeAdminAndClean = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const myPhone = '9548706353';

        // 1. Make me Admin
        const adminUser = await User.findOneAndUpdate(
            { phone: myPhone },
            { role: 'admin', isVerified: true, status: 'active' },
            { new: true }
        );

        if (adminUser) {
            console.log(`✅ Success! ${adminUser.name} is now an ADMIN.`);
            
            // 2. Delete ALL other users (optional but requested "test data hata do")
            // const otherUsers = await User.deleteMany({ phone: { $ne: myPhone } });
            // console.log(`🗑️ Deleted ${otherUsers.deletedCount} other test users.`);

            // 3. Delete ALL test orders
            try {
                const Order = mongoose.model('Order') || require('../models/Order');
                const orders = await Order.deleteMany({});
                console.log(`🗑️ Deleted ${orders.deletedCount} test orders.`);
            } catch (e) {
                console.log('Order model not found or no orders to delete.');
            }

        } else {
            console.log('❌ User not found. Please signup first.');
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

makeAdminAndClean();
