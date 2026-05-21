require('dotenv').config();
const mongoose = require('mongoose');
const Service = require('../models/Service');

const updateIcons = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const updates = [
            { name: 'Shirt', icon: '/images/icons/shirt.png' },
            { name: 'T-Shirt', icon: '/images/icons/tshirt.png' },
            { name: 'Jeans', icon: '/images/icons/jeans.png' },
            { name: 'Saree', icon: '/images/icons/saree.png' },
            { name: 'Trouser', icon: '/images/icons/trouser.png' },
            { name: 'Jacket', icon: '/images/icons/jacket.png' }
        ];

        for (const update of updates) {
            await Service.updateOne({ name: update.name }, { $set: { icon: update.icon } });
            console.log(`Updated icon for ${update.name}`);
        }

        console.log('Icons updated successfully!');
        process.exit();
    } catch (err) {
        console.error('Update failed:', err);
        process.exit(1);
    }
};

updateIcons();
