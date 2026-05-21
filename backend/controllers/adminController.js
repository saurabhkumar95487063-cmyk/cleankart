const User = require('../models/User');
const Order = require('../models/Order');
const Service = require('../models/Service');
const Coupon = require('../models/Coupon');

const getAdminStats = async (req, res) => {
    try {
        const totalOrders = await Order.countDocuments();
        const totalRevenueResult = await Order.aggregate([
            { $match: { status: 'Delivered' } },
            { $group: { _id: null, total: { $sum: '$totalPrice' } } }
        ]);
        const totalRevenue = totalRevenueResult[0]?.total || 0;
        const pendingApps = await User.countDocuments({ status: 'pending' });
        const activePartners = await User.countDocuments({ 
            role: { $in: ['pickup_agent', 'delivery_agent', 'laundry_partner'] },
            status: 'active'
        });

        res.json({ totalOrders, totalRevenue, pendingApps, activePartners });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

const getPendingPartners = async (req, res) => {
    try {
        const partners = await User.find({ status: 'pending' }).select('-password');
        res.json(partners);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

const updatePartnerStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const partner = await User.findById(req.params.id);
        if (partner) {
            partner.status = status;
            await partner.save();
            res.json({ message: `Partner status updated to ${status}` });
        } else {
            res.status(404).json({ message: 'Partner not found' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

const getActivePartners = async (req, res) => {
    try {
        const partners = await User.find({ 
            role: { $in: ['pickup_agent', 'delivery_agent', 'laundry_partner'] },
            status: 'active'
        }).select('-password');
        res.json(partners);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Renamed to match adminRoutes.js
const getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('user', 'name email')
            .populate('pickupAgent', 'name phone')
            .populate('deliveryAgent', 'name phone')
            .populate('laundryPartner', 'name phone')
            .sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (order) {
            order.status = req.body.status;
            await order.save();
            res.json({ message: 'Order status updated' });
        } else {
            res.status(404).json({ message: 'Order not found' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Renamed to match adminRoutes.js
const getSalesReport = async (req, res) => {
    try {
        const reports = await Order.aggregate([
            { $match: { status: 'Delivered' } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    revenue: { $sum: "$totalPrice" },
                    orderCount: { $sum: 1 }
                }
            },
            { $sort: { _id: -1 } },
            { $limit: 7 }
        ]);
        
        const formatted = reports.map(r => ({
            date: r._id,
            revenue: r.revenue,
            orderCount: r.orderCount
        }));

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

const exportOrdersCSV = async (req, res) => {
    try {
        const orders = await Order.find().populate('user', 'name email');
        let csv = 'Order ID,Customer,Amount,Status,Date\n';
        orders.forEach(o => {
            csv += `${o._id},${o.user?.name || 'Guest'},${o.totalPrice},${o.status},${o.createdAt.toLocaleDateString()}\n`;
        });
        res.header('Content-Type', 'text/csv');
        res.attachment('orders.csv');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ message: 'Export failed' });
    }
};

const settleCash = async (req, res) => {
    try {
        const partner = await User.findById(req.params.id);
        if (partner) {
            partner.cashInHand = 0;
            await partner.save();
            res.json({ message: 'Cash settled successfully' });
        } else {
            res.status(404).json({ message: 'Partner not found' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

const settleWallet = async (req, res) => {
    try {
        const partner = await User.findById(req.params.id);
        if (partner) {
            partner.mainWallet = 0;
            await partner.save();
            res.json({ message: 'Wallet settled successfully' });
        } else {
            res.status(404).json({ message: 'Partner not found' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

const deletePartner = async (req, res) => {
    try {
        const partner = await User.findByIdAndDelete(req.params.id);
        if (partner) {
            res.json({ message: 'Partner deleted successfully' });
        } else {
            res.status(404).json({ message: 'Partner not found' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

const togglePartnerStatus = async (req, res) => {
    try {
        const partner = await User.findById(req.params.id);
        if (partner) {
            partner.status = partner.status === 'active' ? 'inactive' : 'active';
            await partner.save();
            res.json({ message: `Partner is now ${partner.status}` });
        } else {
            res.status(404).json({ message: 'Partner not found' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

const getAdminServices = async (req, res) => {
    try {
        const services = await Service.find().populate('category', 'name');
        res.json(services);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

const deleteService = async (req, res) => {
    try {
        await Service.findByIdAndDelete(req.params.id);
        res.json({ message: 'Service deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Get all registered customers with order counts
const getAllCustomers = async (req, res) => {
    try {
        const customers = await User.find({ role: 'user', isVerified: true }).select('name phone email createdAt').sort({ createdAt: -1 });
        
        // Enhance with order counts and last known address
        const enhancedCustomers = await Promise.all(customers.map(async (customer) => {
            const orderCount = await Order.countDocuments({ user: customer._id });
            const lastOrder = await Order.findOne({ user: customer._id }).sort({ createdAt: -1 });
            const lastAddress = lastOrder ? 
                `${lastOrder.address.addrLine}, ${lastOrder.address.pincode}` : 
                'No address saved';

            return {
                _id: customer._id,
                name: customer.name,
                email: customer.email,
                phone: customer.phone,
                createdAt: customer.createdAt,
                orderCount,
                lastAddress
            };
        }));

        res.json(enhancedCustomers);
    } catch (err) {
        console.error('Error in getAllCustomers:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { 
    getAdminStats, 
    getPendingPartners, 
    updatePartnerStatus, 
    getActivePartners, 
    getAllOrders, 
    updateOrderStatus, 
    getSalesReport,
    exportOrdersCSV,
    settleCash,
    settleWallet,
    deletePartner,
    togglePartnerStatus,
    getAdminServices,
    deleteService,
    getAllCustomers,
    createCoupon: async (req, res) => {
        try {
            const { code, discountType, discountValue, minOrderValue, expiryDate } = req.body;
            const coupon = new Coupon({
                code: code.toUpperCase(),
                discountType,
                discountValue,
                minOrderValue,
                expiryDate
            });
            await coupon.save();
            res.status(201).json(coupon);
        } catch (err) {
            res.status(400).json({ message: err.message });
        }
    },
    getCoupons: async (req, res) => {
        try {
            const coupons = await Coupon.find().sort({ createdAt: -1 });
            res.json(coupons);
        } catch (err) {
            res.status(500).json({ message: 'Server error' });
        }
    },
    deleteCoupon: async (req, res) => {
        try {
            await Coupon.findByIdAndDelete(req.params.id);
            res.json({ message: 'Coupon deleted' });
        } catch (err) {
            res.status(500).json({ message: 'Server error' });
        }
    }
};
