const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Order = require('../models/Order');
const Address = require('../models/Address');
const Coupon = require('../models/Coupon');
const Service = require('../models/Service');
const Category = require('../models/Category');

dotenv.config();

const nukeData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const myPhone = '9548706353';

        // 1. Delete all Users EXCEPT ME
        const users = await User.deleteMany({ phone: { $ne: myPhone } });
        console.log(`🗑️ Deleted ${users.deletedCount} test users.`);

        // 2. Delete ALL Orders
        const orders = await Order.deleteMany({});
        console.log(`🗑️ Deleted ${orders.deletedCount} test orders.`);

        // 3. Delete ALL Addresses
        const addresses = await Address.deleteMany({});
        console.log(`🗑️ Deleted ${addresses.deletedCount} addresses.`);

        // 4. Delete ALL Coupons
        const coupons = await Coupon.deleteMany({});
        console.log(`🗑️ Deleted ${coupons.deletedCount} coupons.`);

        // 5. Delete ALL Services (If you want to start fresh)
        // const services = await Service.deleteMany({});
        // console.log(`🗑️ Deleted ${services.deletedCount} services.`);

        // 6. Delete ALL Categories
        // const categories = await Category.deleteMany({});
        // console.log(`🗑️ Deleted ${categories.deletedCount} categories.`);

        console.log('\n✨ Database is now FRESH and READY for production!');
        
        process.exit(0);
    } catch (err) {
        console.error('Error during nuke:', err);
        process.exit(1);
    }
};

nukeData();
