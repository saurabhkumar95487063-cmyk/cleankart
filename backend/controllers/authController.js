const User = require('../models/User');
const jwt = require('jsonwebtoken');

const cleanPhone = (phone) => {
    if (!phone) return phone;
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
};

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '365d' });
};



const registerUser = async (req, res) => {
    let { name, email, phone, password, role, serviceArea, address, upiId, bankAccountNo, bankIfsc, bankName } = req.body;
    
    if (email) email = email.trim().toLowerCase();
    const cleanedPhone = cleanPhone(phone);
    
    const userExists = await User.findOne({ $or: [{ email }, { phone: cleanedPhone }] });
    
    if (userExists) {
        // Allow existing customers ('user') to apply for partner roles
        if (userExists.role === 'user' && ['pickup_agent', 'delivery_agent', 'laundry_partner'].includes(role)) {
            userExists.role = role;
            userExists.status = 'pending';
            if (serviceArea) userExists.serviceArea = serviceArea;
            if (address) userExists.address = address;
            if (upiId) userExists.upiId = upiId;
            if (bankAccountNo) userExists.bankAccountNo = bankAccountNo;
            if (bankIfsc) userExists.bankIfsc = bankIfsc;
            if (bankName) userExists.bankName = bankName;
            if (req.file) userExists.kycDocument = `/uploads/kyc/${req.file.filename}`;
            
            // Initialize partner stats if not set
            if (userExists.todayEarnings === undefined) userExists.todayEarnings = 0;
            if (userExists.mainWallet === undefined) userExists.mainWallet = 0;
            if (userExists.completedOrdersCount === undefined) userExists.completedOrdersCount = 0;
            if (userExists.cashInHand === undefined) userExists.cashInHand = 0;
            userExists.lastEarningUpdate = Date.now();
            
            await userExists.save();
            return res.status(200).json({
                message: 'Application submitted successfully! Your account role is pending admin approval.',
                userId: userExists._id,
                email: userExists.email
            });
        }
        return res.status(400).json({ message: 'Email or Phone already registered' });
    }

    const status = (role === 'pickup_agent' || role === 'delivery_agent' || role === 'laundry_partner') ? 'pending' : 'active';
    const kycDocument = req.file ? `/uploads/kyc/${req.file.filename}` : null;
    
    const isPartner = ['pickup_agent', 'delivery_agent', 'laundry_partner'].includes(role);

    const user = await User.create({ 
        name, 
        email, 
        phone: cleanedPhone,
        password, 
        role: role || 'user',
        serviceArea,
        address,
        kycDocument,
        status,
        upiId,
        bankAccountNo,
        bankIfsc,
        bankName,
        isVerified: true, // Auto-verify all users immediately
        // Initialize partner specific earning/wallet fields conditionally
        todayEarnings: isPartner ? 0 : undefined,
        mainWallet: isPartner ? 0 : undefined,
        completedOrdersCount: isPartner ? 0 : undefined,
        cashInHand: isPartner ? 0 : undefined,
        lastEarningUpdate: isPartner ? Date.now() : undefined
    });

    if (user) {
        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            isVerified: user.isVerified,
            token: generateToken(user._id),
        });
    } else {
        res.status(400).json({ message: 'Invalid user data' });
    }
};



const loginUser = async (req, res) => {
    let { email, password } = req.body;
    if (email) {
        email = email.trim().toLowerCase();
    }
    
    const cleanedIdentifier = cleanPhone(email);

    // 'email' field in request can be either email or phone (raw or cleaned)
    const user = await User.findOne({ 
        $or: [
            { email: email }, 
            { phone: email },
            { phone: cleanedIdentifier }
        ] 
    });
    console.log(`Login attempt: ${email}, User found: ${!!user}`);
    
    if (!user) {
        return res.status(401).json({ message: 'No account found. Please check your number/email, or Sign up if you are new.' });
    }

    if (!(await user.matchPassword(password))) {
        return res.status(401).json({ message: 'Please enter correct password' });
    }

    // Auto-verify legacy users if needed
    if (user.isVerified === false) {
        user.isVerified = true;
        await user.save();
    }
    if (user.status === 'pending') {
        return res.status(401).json({ message: 'Account pending approval by admin' });
    }
    if (user.status === 'inactive') {
        return res.status(401).json({ message: 'Your account has been deactivated. Please contact admin.' });
    }
    
    const userResponse = {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        token: generateToken(user._id),
    };
    
    // Add partner specific info only if applicable
    if (['pickup_agent', 'delivery_agent', 'laundry_partner'].includes(user.role)) {
        userResponse.todayEarnings = user.todayEarnings;
        userResponse.mainWallet = user.mainWallet;
        userResponse.cashInHand = user.cashInHand;
    }

    res.json(userResponse);
};

const getUserProfile = async (req, res) => {
    const user = await User.findById(req.user._id);
    if (user) {
        // Check if it's a new day to transfer earnings
        const today = new Date();
        const lastUpdate = new Date(user.lastEarningUpdate || Date.now());
        
        if (today.toDateString() !== lastUpdate.toDateString()) {
            user.mainWallet = (user.mainWallet || 0) + (user.todayEarnings || 0);
            user.todayEarnings = 0;
            user.lastEarningUpdate = today;
            await user.save();
        }

        const userResponse = { 
            _id: user._id, 
            name: user.name, 
            email: user.email, 
            phone: user.phone, 
            role: user.role,
            status: user.status,
            isVerified: user.isVerified
        };

        if (['pickup_agent', 'delivery_agent', 'laundry_partner'].includes(user.role)) {
            userResponse.todayEarnings = user.todayEarnings;
            userResponse.mainWallet = user.mainWallet;
        }

        res.json(userResponse);
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

const updateUserProfile = async (req, res) => {
    const user = await User.findById(req.user._id);
    if (user) {
        user.name = req.body.name || user.name;
        user.phone = req.body.phone ? cleanPhone(req.body.phone) : user.phone;
        const updatedUser = await user.save();
        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            phone: updatedUser.phone,
            role: updatedUser.role,
            token: generateToken(updatedUser._id),
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

const resetPassword = async (req, res) => {
    let { email, newPassword } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'Email or phone number is required' });
    }
    if (!newPassword) {
        return res.status(400).json({ message: 'New password is required' });
    }

    email = email.trim().toLowerCase();
    const cleanEmail = cleanPhone(email);

    const user = await User.findOne({
        $or: [
            { email: email },
            { phone: email },
            { phone: cleanEmail }
        ]
    });

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    user.password = newPassword;
    user.resetPasswordOtp = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
};


module.exports = { registerUser, loginUser, getUserProfile, updateUserProfile, resetPassword };
