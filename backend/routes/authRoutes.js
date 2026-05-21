const express = require('express');
const router = express.Router();
const upload = require('../config/upload');
const { registerUser, loginUser, getUserProfile, updateUserProfile } = require('../controllers/authController');
const { getMyAddress, saveAddress } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', upload.single('kycDocument'), registerUser);
router.post('/login', loginUser);
router.post('/verify-signup', require('../controllers/authController').verifySignup);
router.post('/forgotpassword', require('../controllers/authController').forgotPassword);
router.post('/resetpassword', require('../controllers/authController').resetPassword);
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);
router.get('/address', protect, getMyAddress);
router.post('/address', protect, saveAddress);

module.exports = router;
