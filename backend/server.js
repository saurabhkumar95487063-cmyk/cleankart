require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketio = require('socket.io');
const connectDB = require('./config/db');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Connect to Database
connectDB();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5001',
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // Increased for development to prevent lockouts
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests from this IP, please try again after 15 minutes' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Increased for development to prevent lockouts
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many auth requests from this IP, please try again after 15 minutes' }
});

app.use('/api/', limiter);
app.use('/api/auth', authLimiter);

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/services', require('./routes/serviceRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/feedback', require('./routes/feedbackRoutes'));

// Socket.io for Real-time tracking
io.on('connection', (socket) => {
    console.log('New client connected');
    
    socket.on('joinTrackingRoom', (orderId) => {
        socket.join(`order_${orderId}`);
    });

    socket.on('joinUserRoom', (userId) => {
        socket.join(`user_${userId}`);
    });

    socket.on('locationUpdate', (data) => {
        io.to(`order_${data.orderId}`).emit('locationUpdate', data);
    });

    socket.on('statusUpdate', (data) => {
        io.to(`user_${data.userId}`).emit('statusUpdate', data);
    });

    socket.on('disconnect', () => console.log('Client disconnected'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    
    // Daily Midnight Wallet Reset (00:00)
    const cron = require('node-cron');
    const User = require('./models/User');
    
    cron.schedule('0 0 * * *', async () => {
        console.log('--- CRON START: Resetting Partner Wallets ---');
        try {
            const result = await User.updateMany(
                { 
                    role: { $in: ['pickup_agent', 'delivery_agent', 'laundry_partner'] }, 
                    todayEarnings: { $gt: 0 } 
                },
                [
                    { 
                        $set: { 
                            mainWallet: { $add: [{ $ifNull: ["$mainWallet", 0] }, { $ifNull: ["$todayEarnings", 0] }] },
                            todayEarnings: 0,
                            lastEarningUpdate: new Date()
                        } 
                    }
                ]
            );
            console.log(`--- CRON END: Updated ${result.modifiedCount} partners ---`);
        } catch (err) {
            console.error('CRON ERROR:', err);
        }
    });
});
