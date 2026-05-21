require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const update = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB!');
        
        // Update all pickup_agent, delivery_agent, and laundry_partner to serviceArea 110001
        const result = await User.updateMany(
            { role: { $in: ['pickup_agent', 'delivery_agent', 'laundry_partner'] } },
            { $set: { serviceArea: '110001' } }
        );
        
        console.log(`Updated ${result.modifiedCount} partner/agent accounts to serviceArea: 110001`);
        
        // Verify
        const partners = await User.find(
            { role: { $in: ['pickup_agent', 'delivery_agent', 'laundry_partner'] } },
            'name email role serviceArea'
        );
        console.log('Updated Partners in DB:', JSON.stringify(partners, null, 2));
        
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
update();
