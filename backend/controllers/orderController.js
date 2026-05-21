const Order = require('../models/Order');
const razorpay = require('../config/razorpay');

const addOrderItems = async (req, res) => {
    let { items, totalPrice, address, paymentMethod, deliveryFee } = req.body;
    
    // Robust parsing for FormData requests
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch (e) {}
    }
    if (typeof address === 'string') {
        try { address = JSON.parse(address); } catch (e) {}
    }
    if (typeof totalPrice === 'string') {
        totalPrice = parseFloat(totalPrice);
    }
    if (typeof deliveryFee === 'string') {
        deliveryFee = parseFloat(deliveryFee);
    }
    let serviceablePartnerId = null;
    // Verify pincode serviceability in India
    if (address && address.pincode) {
        const User = require('../models/User');
        const serviceable = await User.findOne({
            role: 'laundry_partner',
            serviceArea: address.pincode,
            status: 'active'
        });
        
        if (!serviceable) {
            res.status(400).json({ 
                message: `CleanKart Service Unavailable: We do not serve pincode ${address.pincode} yet. We are expanding to your area soon!` 
            });
            return;
        }
        serviceablePartnerId = serviceable._id;
    }
    
    if (totalPrice < 100) {
        res.status(400).json({ message: 'Minimum order amount must be ₹100' });
        return;
    }

    if (items && items.length === 0) {
        res.status(400).json({ message: 'No order items' });
        return;
    } else {
        let garmentImages = [];
        if (req.files && req.files.length > 0) {
            garmentImages = req.files.map(file => `/uploads/garments/${file.filename}`);
        }

        const order = new Order({
            user: req.user._id,
            items,
            totalPrice,
            deliveryFee: deliveryFee || 20,
            address,
            paymentMethod,
            garmentImages,
            laundryPartner: serviceablePartnerId
        });

        // AUTO-ASSIGN PICKUP AGENT DISABLED 
        // Order will remain unassigned so that it appears in "Available Pickups" 
        // after the laundry partner confirms it.
        /*
        try {
            const User = require('../models/User');
            const activeBoys = await User.find({
                role: 'pickup_agent',
                serviceArea: address.pincode,
                status: 'active'
            }).sort({ completedOrdersCount: 1 }); // Least orders first

            if (activeBoys.length > 0) {
                order.pickupAgent = activeBoys[0]._id;
                console.log(`Auto-assigned order to: ${activeBoys[0].name}`);
            }
        } catch (err) {
            console.error('Auto-assign failed:', err);
        }
        */

        try {
            const createdOrder = await order.save();
            res.status(201).json(createdOrder);
        } catch (err) {
            console.error('Order Save Error:', err);
            res.status(400).json({ message: err.message });
        }
    }
};

const getMyOrders = async (req, res) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find orders that are NOT delivered OR delivered within the last 7 days
    const orders = await Order.find({ 
        user: req.user._id,
        $or: [
            { status: { $ne: 'Delivered' } },
            { status: 'Delivered', updatedAt: { $gte: sevenDaysAgo } }
        ]
    })
    .populate('pickupAgent deliveryAgent', 'name phone')
    .sort({ createdAt: -1 });
    
    res.json(orders);
};

const updateOrderStatus = async (req, res) => {
    const order = await Order.findById(req.params.id).populate('user', 'name phone');
    const { status, laundryPartnerId, pickupInspectionReport, laundryInspectionReport, deliveryInspectionReport, customerDeliveryAcknowledgement } = req.body;
    if (order) {
        const oldStatus = order.status;
        order.status = status || order.status;
        
        if (pickupInspectionReport) order.pickupInspectionReport = pickupInspectionReport;
        if (laundryInspectionReport) order.laundryInspectionReport = laundryInspectionReport;
        if (deliveryInspectionReport) order.deliveryInspectionReport = deliveryInspectionReport;
        if (customerDeliveryAcknowledgement) order.customerDeliveryAcknowledgement = customerDeliveryAcknowledgement;
        
        // CLAIMING LOGIC (Pooling System)
        if (status === 'Laundry Confirmed' && req.user.role === 'laundry_partner') {
            order.laundryPartner = req.user._id;
        } else if (status === 'Pickup Assigned' && req.user.role === 'pickup_agent') {
            order.pickupAgent = req.user._id;
        } else if (status === 'Delivery Assigned' && req.user.role === 'delivery_agent') {
            order.deliveryAgent = req.user._id;
        }

        const updatedOrder = await (await order.save()).populate('pickupAgent deliveryAgent laundryPartner', 'name phone');
        
        // Add earnings to today's wallet based on status
        const User = require('../models/User'); // Ensure User model is available
        
        // 1. Pickup Complete -> Give Pickup Agent 12.5% + ₹10 Delivery Bonus
        if (status === 'Arrived in Laundry' && oldStatus !== 'Arrived in Laundry') {
            if (order.pickupAgent) {
                const bonus = (order.deliveryFee || 20) / 2;
                await User.findByIdAndUpdate(order.pickupAgent, { 
                    $inc: { 
                        todayEarnings: Math.round(order.totalPrice * 0.125) + bonus,
                        completedOrdersCount: 1
                    } 
                });
            }
        }
        
        // 2. Delivery Complete -> Give Delivery Agent 12.5% and Laundry Partner 65%
        if (status === 'Delivered' && oldStatus !== 'Delivered') {
            // Laundry Partner gets 65%
            if (order.laundryPartner) {
                await User.findByIdAndUpdate(order.laundryPartner, { 
                    $inc: { 
                        todayEarnings: Math.round(order.totalPrice * 0.65),
                        completedOrdersCount: 1
                    } 
                });
            }
            // 3. Delivery Agent gets 12.5% + ₹10 Delivery Bonus
            if (order.deliveryAgent) {
                const bonus = (order.deliveryFee || 20) / 2;
                const incData = { 
                    todayEarnings: Math.round(order.totalPrice * 0.125) + bonus,
                    completedOrdersCount: 1
                };
                
                // If COD, increment cashInHand by full total price (clothes + delivery fee)
                if (order.paymentMethod === 'Cash on Delivery') {
                    incData.cashInHand = order.totalPrice + (order.deliveryFee || 20);
                }
                
                await User.findByIdAndUpdate(order.deliveryAgent, { $inc: incData });
            }
        }

        // SIMULATED WHATSAPP NOTIFICATION
        if (oldStatus !== status) {
            console.log('--------------------------------------------');
            console.log(`WHATSAPP TRIGGER: To ${order.user.name} (${order.user.phone || 'N/A'})`);
            console.log(`MESSAGE: Your CleanKart Order #${order._id.toString().slice(-6)} status is now: ${status}`);
            console.log('--------------------------------------------');
        }

        res.json(updatedOrder);
    } else {
        res.status(404).json({ message: 'Order not found' });
    }
};

const getAllOrders = async (req, res) => {
    try {
        let query = {};
        
        // ROLE-BASED DATA ISOLATION (Pooling & Claim System)
        if (req.user.role === 'pickup_agent') {
            query.$or = [
                { status: { $in: ['Placed', 'Laundry Confirmed'] }, 'address.pincode': req.user.serviceArea, pickupAgent: { $exists: false } },
                { pickupAgent: req.user._id }
            ];
        } else if (req.user.role === 'delivery_agent') {
            query.$or = [
                { status: 'Ready', 'address.pincode': req.user.serviceArea, deliveryAgent: { $exists: false } },
                { deliveryAgent: req.user._id }
            ];
        } else if (req.user.role === 'laundry_partner') {
            query.$or = [
                { status: 'Placed', 'address.pincode': req.user.serviceArea, laundryPartner: { $exists: false } },
                { laundryPartner: req.user._id }
            ];
        } else if (req.user.role === 'admin') {
            query = {};
        }

        const orders = await Order.find(query).populate('pickupAgent deliveryAgent laundryPartner', 'name phone').sort({ updatedAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Generate HTML Invoice
const generateInvoice = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('user', 'name email');
        if (!order) return res.status(404).send('Order not found');

        // Check if user is the owner, an admin, or an assigned agent/partner
        const isOwner = order.user._id.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';
        const isPickupAgent = order.pickupAgent && order.pickupAgent.toString() === req.user._id.toString();
        const isDeliveryAgent = order.deliveryAgent && order.deliveryAgent.toString() === req.user._id.toString();
        const isLaundryPartner = order.laundryPartner && order.laundryPartner.toString() === req.user._id.toString();

        if (!isOwner && !isAdmin && !isPickupAgent && !isDeliveryAgent && !isLaundryPartner) {
            return res.status(401).send('Not authorized to view this invoice');
        }

        const html = `
            <html>
            <head>
                <title>CleanKart Invoice - #${order._id.toString().slice(-6)}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; margin: 0; background-color: #f4f7f6; color: #333; }
                    .invoice-container { max-width: 800px; margin: 40px auto; background: #fff; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); position: relative; overflow: hidden; }
                    .invoice-container::before { content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 8px; background: linear-gradient(90deg, #0d6efd, #0dcaf0); }
                    
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f0f0f0; padding-bottom: 30px; margin-bottom: 30px; }
                    .brand h1 { color: #0d6efd; margin: 0; font-size: 32px; letter-spacing: -1px; }
                    .brand p { margin: 5px 0 0; color: #666; font-size: 14px; }
                    
                    .invoice-info { text-align: right; }
                    .invoice-info h2 { margin: 0; color: #333; font-size: 24px; }
                    .invoice-info p { margin: 5px 0; color: #777; font-size: 14px; }

                    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
                    .details-title { font-weight: bold; color: #0d6efd; text-transform: uppercase; font-size: 12px; margin-bottom: 10px; display: block; border-bottom: 1px solid #eee; padding-bottom: 5px; }
                    .details-content { font-size: 14px; line-height: 1.6; color: #444; }

                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                    th { background: #f9fafb; text-align: left; padding: 15px; font-size: 13px; color: #666; text-transform: uppercase; border-bottom: 2px solid #eee; }
                    td { padding: 15px; border-bottom: 1px solid #eee; font-size: 15px; }
                    .item-name { font-weight: 600; color: #333; }
                    
                    .totals { margin-left: auto; width: 250px; }
                    .total-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
                    .total-row.grand-total { border-bottom: none; padding-top: 15px; color: #0d6efd; font-size: 20px; font-weight: bold; }

                    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 13px; }
                    
                    .action-bar { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 100; }
                    .btn-print { background: #0d6efd; color: #fff; border: none; padding: 12px 30px; border-radius: 50px; font-weight: bold; cursor: pointer; box-shadow: 0 5px 15px rgba(13, 110, 253, 0.4); display: flex; align-items: center; gap: 10px; font-size: 16px; transition: all 0.3s; }
                    .btn-print:hover { background: #0b5ed7; transform: translateY(-2px); box-shadow: 0 8px 20px rgba(13, 110, 253, 0.5); }

                    @media print {
                        body { background: #fff; padding: 0; }
                        .invoice-container { margin: 0; box-shadow: none; border-radius: 0; max-width: 100%; }
                        .action-bar { display: none; }
                    }
                </style>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            </head>
            <body>
                <div class="invoice-container">
                    <div class="header">
                        <div class="brand">
                            <h1>CleanKart</h1>
                            <p>Premium Laundry & Dry Cleaning</p>
                        </div>
                        <div class="invoice-info">
                            <h2>INVOICE</h2>
                            <p><strong>ID:</strong> #${order._id.toString().slice(-6)}</p>
                            <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                        </div>
                    </div>
                    
                    <div class="details-grid">
                        <div>
                            <span class="details-title">Customer Details</span>
                            <div class="details-content">
                                <strong>${order.user.name}</strong><br>
                                ${order.user.email}<br>
                                Ph: ${order.address.mobile}
                            </div>
                        </div>
                        <div>
                            <span class="details-title">Delivery Address</span>
                            <div class="details-content">
                                <strong>${order.address.fullName}</strong><br>
                                ${order.address.addressLine}<br>
                                ${order.address.pincode}
                            </div>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Item Description</th>
                                <th style="text-align: center;">Qty</th>
                                <th style="text-align: right;">Price</th>
                                <th style="text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${order.items.map(item => `
                                <tr>
                                    <td><span class="item-name">${item.name}</span></td>
                                    <td style="text-align: center;">${item.quantity}</td>
                                    <td style="text-align: right;">₹${item.price}</td>
                                    <td style="text-align: right;">₹${item.price * item.quantity}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="totals">
                        <div class="total-row">
                            <span>Subtotal</span>
                            <span>₹${order.totalPrice}</span>
                        </div>
                        <div class="total-row">
                            <span>Delivery Fee</span>
                            <span>₹${order.deliveryFee || 0}</span>
                        </div>
                        <div class="total-row grand-total">
                            <span>Grand Total</span>
                            <span>₹${order.totalPrice + (order.deliveryFee || 0)}</span>
                        </div>
                    </div>

                    ${order.garmentImages && order.garmentImages.length > 0 ? `
                    <div style="margin-top: 40px; border-top: 2px solid #f0f0f0; padding-top: 30px; clear: both;">
                        <span class="details-title" style="font-weight: bold; color: #0d6efd; text-transform: uppercase; font-size: 12px; margin-bottom: 15px; display: block; border-bottom: 1px solid #eee; padding-bottom: 5px;">Garment Images (Customer Snaps)</span>
                        <div class="garment-photos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 15px;">
                            ${order.garmentImages.map(img => `
                                <div style="border: 1px solid #eee; border-radius: 10px; overflow: hidden; height: 130px; background: #fafafa; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                                    <img src="${img}" style="width: 100%; height: 100%; object-fit: cover;">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <div class="footer">
                        <p><i class="fas fa-heart text-danger"></i> Thank you for choosing CleanKart!</p>
                        <p>This is a computer generated invoice and does not require a physical signature.</p>
                        <p style="margin-top: 10px; color: #ccc;">support@cleankart.in</p>
                    </div>
                </div>

                <div class="action-bar">
                    <button class="btn-print" onclick="window.print()">
                        <i class="fas fa-download"></i> Download / Print Bill
                    </button>
                </div>
            </body>
            </html>
        `;
        res.send(html);
    } catch (err) {
        res.status(500).send('Error generating invoice');
    }
};

const updateOrderRating = async (req, res) => {
    try {
        const { rating, review } = req.body;
        const order = await Order.findById(req.params.id);

        if (order) {
            if (order.user.toString() !== req.user._id.toString()) {
                return res.status(401).json({ message: 'Not authorized' });
            }
            order.rating = rating;
            order.review = review;
            const updatedOrder = await order.save();
            res.json(updatedOrder);
        } else {
            res.status(404).json({ message: 'Order not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getPartnerStats = async (req, res) => {
    try {
        const User = require('../models/User');
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if it's a new day to transfer earnings
        const today = new Date();
        const lastUpdate = new Date(user.lastEarningUpdate || Date.now());
        
        if (today.toDateString() !== lastUpdate.toDateString()) {
            user.mainWallet = (user.mainWallet || 0) + (user.todayEarnings || 0);
            user.todayEarnings = 0;
            user.lastEarningUpdate = today;
            await user.save();
        }

        let totalEarnings = 0;
        let totalOrders = user.completedOrdersCount || 0;

        const Order = require('../models/Order');
        if (user.role === 'laundry_partner') {
            const orders = await Order.find({ laundryPartner: user._id, status: 'Delivered' });
            totalEarnings = orders.reduce((sum, o) => sum + (o.totalPrice * 0.65), 0);
        } else {
            const query = { status: 'Delivered' };
            if (user.role === 'pickup_agent') query.pickupAgent = user._id;
            if (user.role === 'delivery_agent') query.deliveryAgent = user._id;
            
            const orders = await Order.find(query);
            totalEarnings = orders.reduce((sum, o) => sum + (o.totalPrice * 0.125), 0);
        }
        
        res.json({
            totalOrders,
            totalEarnings: Math.round(totalEarnings),
            todayEarnings: user.todayEarnings || 0,
            mainWallet: user.mainWallet || 0,
            cashInHand: user.cashInHand || 0
        });
    } catch (error) {
        console.error('Stats Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const createRazorpayOrder = async (req, res) => {
    const { amount } = req.body;
    
    const options = {
        amount: amount * 100, // amount in smallest currency unit (paise)
        currency: "INR",
        receipt: `receipt_${Date.now()}`
    };

    try {
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error('Razorpay Error:', error);
        res.status(500).json({ message: 'Error creating Razorpay order' });
    }
};

module.exports = { addOrderItems, placeOrder: addOrderItems, getMyOrders, getAllOrders, updateOrderStatus, generateInvoice, updateOrderRating, getPartnerStats, createRazorpayOrder };
