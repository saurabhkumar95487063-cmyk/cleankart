require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const seedPartners = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB for seeding partners');

        const partners = [
            {
                name: 'Test Pickup',
                email: 'pickup@cleankart.com',
                phone: '1111111111',
                password: 'password',
                role: 'pickup_agent',
                status: 'active',
                isVerified: true,
                serviceArea: '110001'
            },
            {
                name: 'Test Delivery',
                email: 'delivery@cleankart.com',
                phone: '2222222222',
                password: 'password',
                role: 'delivery_agent',
                status: 'active',
                isVerified: true,
                serviceArea: '110001'
            },
            {
                name: 'Test Laundry',
                email: 'laundry@cleankart.com',
                phone: '3333333333',
                password: 'password',
                role: 'laundry_partner',
                status: 'active',
                isVerified: true,
                serviceArea: '110001',
                address: 'Main Market, Delhi'
            },
            {
                name: 'Test Customer',
                email: 'customer@cleankart.com',
                phone: '9999999999',
                password: 'password',
                role: 'user',
                status: 'active',
                isVerified: true
            },
            {
                name: 'Test Customer',
                email: 'test@cleankart.com',
                phone: '9999999998',
                password: 'password',
                role: 'user',
                status: 'active',
                isVerified: true
            },
            {
                name: 'Test Customer',
                email: 'testuser@cleankart.com',
                phone: '9999999997',
                password: 'password',
                role: 'user',
                status: 'active',
                isVerified: true
            },
            {
                name: 'Test Customer',
                email: 'test@gmail.com',
                phone: '9999999996',
                password: 'password',
                role: 'user',
                status: 'active',
                isVerified: true
            }
        ];

        for (const p of partners) {
            await User.deleteMany({ email: p.email });
            await User.create(p);
        }

        console.log('Partner accounts created successfully!');
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

seedPartners();
