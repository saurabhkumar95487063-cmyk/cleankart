const User = require('../models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const nodemailer = require('nodemailer');

const cleanPhone = (phone) => {
    if (!phone) return phone;
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
};

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '365d' });
};

const sendSMS = async (phone, otp) => {
    const apiKey = process.env.FAST2SMS_API_KEY;
    
    // Clean phone number: remove any non-digit characters and take last 10 digits
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    if (!apiKey || apiKey.includes('YOUR_FAST2SMS_API_KEY_HERE')) {
        console.log(`\n================================`);
        console.log(`📱 DUMMY SMS SENT TO: ${cleanPhone}`);
        console.log(`🔑 OTP: ${otp}`);
        console.log(`⚠️ (API Key not set in .env)`);
        console.log(`================================\n`);
        return;
    }

    try {
        // Using active Quick Route 'q' with a neutral compliance template to bypass both operator keyword filters and dashboard domain blocks
        const message = `CleanKart: ${otp}`;
        const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=q&message=${encodeURIComponent(message)}&flash=0&numbers=${cleanPhone}`;
        
        console.log(`📡 Sending active SMS via Fast2SMS (Quick Route) to ${cleanPhone}... | Generated OTP: ${otp}`);
        const response = await axios.get(url);
        
        if (response.data.return) {
            console.log(`✅ Fast2SMS Success:`, response.data.message, `| OTP sent: ${otp}`);
        } else {
            console.log(`⚠️ Fast2SMS Warning:`, response.data, `| OTP: ${otp}`);
        }
    } catch (err) {
        console.error('❌ Fast2SMS API Error:', err.response?.data || err.message, `| OTP: ${otp}`);
    }
};

const sendEmail = async (email, otp) => {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass) {
        console.log(`\n================================`);
        console.log(`📧 DUMMY EMAIL SENT TO: ${email}`);
        console.log(`🔑 OTP: ${otp}`);
        console.log(`⚠️ (EMAIL_USER or EMAIL_PASS not set in .env)`);
        console.log(`================================\n`);
        return;
    }

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: user,
                pass: pass
            }
        });

        const mailOptions = {
            from: `"CleanKart" <${user}>`,
            to: email,
            subject: 'CleanKart Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #0d6efd; text-align: center;">CleanKart</h2>
                    <p>Dear Customer,</p>
                    <p>Thank you for choosing CleanKart. Use the following OTP to verify your account registration or reset your password:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333; background: #f4f4f4; padding: 10px 20px; border-radius: 5px; border: 1px solid #ddd;">${otp}</span>
                    </div>
                    <p style="color: #777; font-size: 12px; text-align: center;">This OTP is valid for 15 minutes. Please do not share it with anyone.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Nodemailer Success: OTP email sent to ${email}`);
    } catch (err) {
        console.error('❌ Nodemailer Error sending email:', err.message);
    }
};

const registerUser = async (req, res) => {
    let { name, email, phone, password, role, serviceArea, address, upiId, bankAccountNo, bankIfsc, bankName } = req.body;
    
    if (email) email = email.trim().toLowerCase();
    const cleanedPhone = cleanPhone(phone);
    
    const userExists = await User.findOne({ $or: [{ email }, { phone: cleanedPhone }] });
    
    if (userExists) {
        if (userExists.isVerified) {
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
        } else {
            // User exists but not verified, update OTP and resend
            const otp = Math.floor(1000 + Math.random() * 9000).toString();
            userExists.resetPasswordOtp = otp;
            userExists.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
            await userExists.save();
            await sendSMS(cleanedPhone, otp);
            await sendEmail(userExists.email, otp);
            return res.status(201).json({
                message: 'OTP resent to your phone & email',
                userId: userExists._id,
                email: userExists.email
            });
        }
    }

    const status = (role === 'pickup_agent' || role === 'delivery_agent' || role === 'laundry_partner') ? 'pending' : 'active';
    const kycDocument = req.file ? `/uploads/kyc/${req.file.filename}` : null;
    
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

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
        resetPasswordOtp: otp,
        resetPasswordExpire: Date.now() + 15 * 60 * 1000,
        isVerified: status === 'pending' ? true : false, // Auto-verify partners
        // Initialize partner specific earning/wallet fields conditionally
        todayEarnings: isPartner ? 0 : undefined,
        mainWallet: isPartner ? 0 : undefined,
        completedOrdersCount: isPartner ? 0 : undefined,
        cashInHand: isPartner ? 0 : undefined,
        lastEarningUpdate: isPartner ? Date.now() : undefined
    });

    if (user) {
        await sendSMS(cleanedPhone, otp);
        await sendEmail(email, otp);

        res.status(201).json({
            message: 'OTP sent to your phone & email',
            userId: user._id,
            email: user.email
        });
    } else {
        res.status(400).json({ message: 'Invalid user data' });
    }
};

const verifySignup = async (req, res) => {
    const { userId, otp } = req.body;
    const user = await User.findById(userId);

    if (!user || user.resetPasswordOtp !== otp || user.resetPasswordExpire < Date.now()) {
        return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.isVerified = true;
    user.resetPasswordOtp = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        token: generateToken(user._id),
    });
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

    // If both correct
    if (user.isVerified === false && user.role !== 'admin') {
        return res.status(401).json({ message: 'Please verify your account first', userId: user._id });
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

const forgotPassword = async (req, res) => {
    let { identifier } = req.body;
    if (!identifier) return res.status(400).json({ message: 'Email or phone number is required' });

    identifier = identifier.trim().toLowerCase();

    // Clean identifier if it's a phone number
    const cleanIdentifier = identifier.replace(/\D/g, '').length >= 10 
        ? identifier.replace(/\D/g, '').slice(-10) 
        : identifier;

    const user = await User.findOne({ 
        $or: [{ email: cleanIdentifier }, { phone: cleanIdentifier }] 
    });
    
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    user.resetPasswordOtp = otp;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendSMS(user.phone, otp);
    await sendEmail(user.email, otp);

    const maskedPhone = user.phone.slice(0, 2) + '******' + user.phone.slice(-2);
    res.json({ message: `OTP sent successfully to ${maskedPhone}` });
};

const resetPassword = async (req, res) => {
    let { email, otp, newPassword } = req.body; // 'email' field here contains the identifier
    if (!email) return res.status(400).json({ message: 'Email or phone number is required' });

    email = email.trim().toLowerCase();

    // Clean email/phone if it's a phone number
    const cleanEmail = email.replace(/\D/g, '').length >= 10 
        ? email.replace(/\D/g, '').slice(-10) 
        : email;

    const query = {
        $or: [{ email: cleanEmail }, { phone: cleanEmail }],
        resetPasswordOtp: otp,
        resetPasswordExpire: { $gt: Date.now() }
    };

    const user = await User.findOne(query);

    if (!user) {
        return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.password = newPassword;
    user.resetPasswordOtp = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
};

module.exports = { registerUser, loginUser, getUserProfile, updateUserProfile, forgotPassword, resetPassword, verifySignup };
