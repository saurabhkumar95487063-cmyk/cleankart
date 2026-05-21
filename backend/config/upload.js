const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination(req, file, cb) {
        let dir = 'public/uploads/kyc';
        if (file.fieldname === 'serviceIcon') {
            dir = 'public/uploads/icons';
        } else if (file.fieldname === 'garmentImages') {
            dir = 'public/uploads/garments';
        }
        
        const uploadPath = path.join(__dirname, '..', dir);
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename(req, file, cb) {
        let prefix = 'kyc';
        if (file.fieldname === 'serviceIcon') {
            prefix = 'icon';
        } else if (file.fieldname === 'garmentImages') {
            prefix = 'garment';
        }
        cb(null, `${prefix}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter(req, file, cb) {
        const filetypes = /jpe?g|png|webp|pdf/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Images and PDFs only!'));
        }
    }
});

module.exports = upload;
