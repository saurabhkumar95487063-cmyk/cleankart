const mongoose = require('mongoose');

const addressSchema = mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fullName: { type: String, required: true },
    mobile: { type: String, required: true },
    addressLine: { type: String, required: true },
    pincode: { type: String, required: true },
    label: { type: String, default: 'Home' }, // Home, Office, Other
    isDefault: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Address', addressSchema);
