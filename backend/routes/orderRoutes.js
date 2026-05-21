const express = require('express');
const router = express.Router();
const { getMyOrders, updateOrderStatus, placeOrder, generateInvoice, getAllOrders, updateOrderRating, getPartnerStats, createRazorpayOrder } = require('../controllers/orderController');
const { validateCoupon } = require('../controllers/couponController');
const { protect, delivery } = require('../middleware/authMiddleware');
const upload = require('../config/upload');

router.post('/validate-coupon', protect, validateCoupon);
router.post('/razorpay-order', protect, createRazorpayOrder);

router.post('/', protect, upload.array('garmentImages', 25), placeOrder);
router.get('/all', protect, getAllOrders);
router.get('/myorders', protect, getMyOrders);
router.get('/stats', protect, getPartnerStats);
router.get('/:id/invoice', protect, generateInvoice);
router.put('/:id/status', protect, delivery, updateOrderStatus);
router.post('/:id/rate', protect, updateOrderRating);

router.get('/check-pincode/:pincode', async (req, res) => {
    try {
        const User = require('../models/User');
        const activePartner = await User.findOne({
            role: 'laundry_partner',
            serviceArea: req.params.pincode,
            status: 'active'
        });
        if (activePartner) {
            res.json({ serviceable: true, message: `CleanKart is actively delivering in pincode ${req.params.pincode}! Let's get washing!` });
        } else {
            res.json({ serviceable: false, message: `CleanKart is not active in pincode ${req.params.pincode} yet. We are expanding to your area soon!` });
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
