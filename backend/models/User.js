const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { 
        type: String, 
        default: 'user',
        enum: ['user', 'admin', 'pickup_agent', 'delivery_agent', 'laundry_partner'] 
    },
    serviceArea: { type: String }, // Pincode or City for agents
    address: { type: String }, // Full address for partners
    kycDocument: { type: String }, // Path to the uploaded document
    status: { type: String, default: 'active' }, // active or pending (for agents)
    isVerified: { type: Boolean, default: false },
    resetPasswordOtp: { type: String },
    resetPasswordExpire: { type: Date },
    todayEarnings: { type: Number },
    mainWallet: { type: Number },
    lastEarningUpdate: { type: Date },
    completedOrdersCount: { type: Number },
    cashInHand: { type: Number },
    // Payment Details for Settlement
    upiId: { type: String },
    bankAccountNo: { type: String },
    bankIfsc: { type: String },
    bankName: { type: String }
}, { timestamps: true });

userSchema.pre('save', async function() {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
