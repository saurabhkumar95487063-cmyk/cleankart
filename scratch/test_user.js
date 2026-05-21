const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = "mongodb://cleankartuser:cleankartpass1234@ac-aeo1olc-shard-00-00.vtsyrn3.mongodb.net:27017,ac-aeo1olc-shard-00-01.vtsyrn3.mongodb.net:27017,ac-aeo1olc-shard-00-02.vtsyrn3.mongodb.net:27017/cleankart?ssl=true&replicaSet=atlas-djrvsg-shard-0&authSource=admin&appName=Cluster0";

async function test() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');
        
        const users = await User.find({});
        console.log('Total users:', users.length);
        console.log('All Users:', JSON.stringify(users.map(u => ({ _id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role, isVerified: u.isVerified })), null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

test();
