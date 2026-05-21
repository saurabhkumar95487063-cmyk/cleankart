require('dotenv').config();
const mongoose = require('mongoose');
const Service = require('../models/Service');

async function fixIcons() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const services = await Service.find();
        
        for (let s of services) {
            const name = s.name.toLowerCase();
            let icon = 'fas fa-shirt'; // default

            if (name.includes('jeans') || name.includes('trouser') || name.includes('pant')) icon = 'fas fa-socks';
            else if (name.includes('suit') || name.includes('saree') || name.includes('kurti')) icon = 'fas fa-person-dress';
            else if (name.includes('jacket') || name.includes('coat')) icon = 'fas fa-vest';
            else if (name.includes('bed sheet') || name.includes('blanket')) icon = 'fas fa-bed';
            else if (name.includes('t-shirt')) icon = 'fas fa-shirt';
            else if (name.includes('shirt')) icon = 'fas fa-shirt';
            else if (name.includes('shoe')) icon = 'fas fa-shoe-prints';
            else if (name.includes('tie')) icon = 'fas fa-user-tie';
            
            s.icon = icon;
            await s.save();
        }
        
        console.log('All service icons fixed successfully!');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
fixIcons();
