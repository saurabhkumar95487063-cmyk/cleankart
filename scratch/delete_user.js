const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

const deleteUser = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const phone = '9548706353';
        const email = 'saurabhkumar43280@gmail.com';

        const result = await User.deleteMany({ 
            $or: [{ phone }, { email }] 
        });

        console.log(`Successfully deleted ${result.deletedCount} user(s) matching ${phone} or ${email}`);
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

deleteUser();
