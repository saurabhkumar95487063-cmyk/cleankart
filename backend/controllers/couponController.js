const Coupon = require('../models/Coupon');

const validateCoupon = async (req, res) => {
    try {
        const { code, cartTotal } = req.body;
        const coupon = await Coupon.findOne({ 
            code: code.toUpperCase(), 
            isActive: true 
        });

        if (!coupon) {
            return res.status(404).json({ message: 'Invalid or expired coupon' });
        }

        const now = new Date();
        if (coupon.expiryDate < now) {
            return res.status(400).json({ message: 'Coupon has expired' });
        }

        if (cartTotal < coupon.minOrderValue) {
            return res.status(400).json({ 
                message: `Minimum order of ₹${coupon.minOrderValue} required for this coupon` 
            });
        }

        res.json({
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { validateCoupon };
