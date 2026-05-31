const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [{
        service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
        name: String,
        price: Number,
        quantity: Number
    }],
    totalPrice: { type: Number, required: true },
    deliveryFee: { type: Number, default: 20 },
    address: {
        fullName: String,
        mobile: String,
        addressLine: String,
        pincode: String
    },
    status: { type: String, default: 'Pending' },
    paymentMethod: { type: String, default: 'Cash on Delivery' },
    pickupAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deliveryAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    laundryPartner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    review: { type: String },
    garmentImages: [{ type: String }],
    pickupInspectionReport: { type: String },
    laundryInspectionReport: { type: String },
    deliveryInspectionReport: { type: String },
    customerDeliveryAcknowledgement: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
