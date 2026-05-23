require('dotenv').config();
const mongoose = require('mongoose');
const Service = require('./models/Service');
const User = require('./models/User');
const Category = require('./models/Category');

const categories = [
    { name: "Men's Wear", icon: 'fas fa-shirt' },
    { name: "Women's Wear", icon: 'fas fa-person-dress' },
    { name: "Home & Others", icon: 'fas fa-house' },
    { name: "Premium Care", icon: 'fas fa-crown' }
];

const services = [
    // Men's Wear
    { category: "Men's Wear", name: "Shirt", price: 25, icon: "fas fa-shirt" },
    { category: "Men's Wear", name: "T-Shirt", price: 15, icon: "fas fa-tshirt" },
    { category: "Men's Wear", name: "Jeans", price: 30, icon: "fas fa-uniting-nations" }, // Using fa-uniting-nations as a placeholder for pants or find a better one
    { category: "Men's Wear", name: "Trouser", price: 25, icon: "fas fa-socks" }, // socks for now
    { category: "Men's Wear", name: "Jacket", price: 50, icon: "fas fa-user-tie" },
    { category: "Men's Wear", name: "Suit", price: 100, icon: "fas fa-user-ninja" },
    
    // Women's Wear
    { category: "Women's Wear", name: "Saree", price: 40, icon: "fas fa-universal-access" },
    { category: "Women's Wear", name: "Salwar Suit", price: 30, icon: "fas fa-person-dress" },
    { category: "Women's Wear", name: "Kurti", price: 25, icon: "fas fa-person-dress-burst" },
    { category: "Women's Wear", name: "Leggings", price: 15, icon: "fas fa-shoe-prints" },
    { category: "Women's Wear", name: "Dupatta", price: 10, icon: "fas fa-wind" },
    
    // Home & Others
    { category: "Home & Others", name: "Bed Sheet", price: 40, icon: "fas fa-bed" },
    { category: "Home & Others", name: "Pillow Cover", price: 10, icon: "fas fa-mattress-pillow" },
    { category: "Home & Others", name: "Blanket", price: 60, icon: "fas fa-rug" },
    { category: "Home & Others", name: "Curtain", price: 30, icon: "fas fa-scroll" },
    { category: "Home & Others", name: "Towel", price: 15, icon: "fas fa-soap" },
    
    // Premium Care
    { category: "Premium Care", name: "Premium Silk Saree", price: 150, icon: "fas fa-crown" },
    { category: "Premium Care", name: "Premium Designer Suit", price: 250, icon: "fas fa-user-tie" },
    { category: "Premium Care", name: "Premium Sherwani", price: 300, icon: "fas fa-crown" },
    { category: "Premium Care", name: "Premium Leather Jacket", price: 400, icon: "fas fa-user-ninja" }
];

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB for seeding');

        // Seed Categories
        console.log('Seeding Categories...');
        await Category.deleteMany();
        await Category.insertMany(categories);
        console.log('Categories Seeded!');

        // Seed Services
        console.log('Seeding Services...');
        await Service.deleteMany();
        await Service.insertMany(services);
        console.log('Services Seeded!');

        // Admin should be registered manually or exists already; removing test admin creation to prevent test data seeding
        console.log('Skipping test admin creation to avoid seeding test data');

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

seedData();
