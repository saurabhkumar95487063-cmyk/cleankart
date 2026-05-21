const express = require('express');
const router = express.Router();
const upload = require('../config/upload');
const { getServices, createService, updateService, deleteService } = require('../controllers/serviceController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/', getServices);
router.post('/', protect, admin, upload.single('serviceIcon'), createService);
router.put('/:id', protect, admin, upload.single('serviceIcon'), updateService);
router.delete('/:id', protect, admin, deleteService);

module.exports = router;
