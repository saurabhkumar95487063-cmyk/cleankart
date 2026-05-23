const express = require('express');
const router = express.Router();
const { 
    getPendingPartners, 
    getActivePartners, 
    updatePartnerStatus, 
    getAdminStats, 
    getAllOrders, 
    getSalesReport, 
    exportOrdersCSV, 
    settleCash, 
    settleWallet,
    getAllCustomers,
    createCoupon,
    getCoupons,
    deleteCoupon,
    getFeedbacks,
    deleteFeedback
} = require('../controllers/adminController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/partners/pending', protect, admin, getPendingPartners);
router.get('/partners/active', protect, admin, getActivePartners);
router.put('/partners/:id/status', protect, admin, updatePartnerStatus);
router.put('/partners/:id/settle-cash', protect, admin, settleCash);
router.put('/partners/:id/settle-wallet', protect, admin, settleWallet);
router.get('/stats', protect, admin, getAdminStats);
router.get('/orders', protect, admin, getAllOrders);
router.get('/customers', protect, admin, getAllCustomers);
router.get('/reports', protect, admin, getSalesReport);
router.get('/export-csv', protect, admin, exportOrdersCSV);

// Coupon Management
router.get('/coupons', protect, admin, getCoupons);
router.post('/coupons', protect, admin, createCoupon);
router.delete('/coupons/:id', protect, admin, deleteCoupon);

// Feedback Management
router.get('/feedbacks', protect, admin, getFeedbacks);
router.delete('/feedbacks/:id', protect, admin, deleteFeedback);

module.exports = router;
