const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = "mongodb://cleankartuser:cleankartpass1234@ac-aeo1olc-shard-00-00.vtsyrn3.mongodb.net:27017,ac-aeo1olc-shard-00-01.vtsyrn3.mongodb.net:27017,ac-aeo1olc-shard-00-02.vtsyrn3.mongodb.net:27017/cleankart?ssl=true&replicaSet=atlas-djrvsg-shard-0&authSource=admin&appName=Cluster0";

async function test() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');
        
        const result = await User.updateOne(
            { phone: '9548706353' },
            { $set: { email: 'saurabhkumar95487063@gmail.com' } }
        );
        console.log('Update result:', result);
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

test();
