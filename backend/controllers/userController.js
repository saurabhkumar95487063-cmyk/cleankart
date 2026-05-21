const Address = require('../models/Address');

const getMyAddress = async (req, res) => {
    try {
        const addresses = await Address.find({ user: req.user._id }).sort({ updatedAt: -1 });
        res.json(addresses);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const saveAddress = async (req, res) => {
    const { fullName, mobile, addressLine, pincode, label } = req.body;
    try {
        // If label exists for this user, update it. Otherwise create new.
        let address = await Address.findOne({ user: req.user._id, label: label || 'Home' });
        
        if (address) {
            address.fullName = fullName;
            address.mobile = mobile;
            address.addressLine = addressLine;
            address.pincode = pincode;
        } else {
            address = new Address({
                user: req.user._id,
                fullName,
                mobile,
                addressLine,
                pincode,
                label: label || 'Home'
            });
        }
        const savedAddress = await address.save();
        res.status(201).json(savedAddress);
    } catch (error) {
        console.error('Address Save Error:', error);
        res.status(400).json({ message: error.message });
    }
};

module.exports = { getMyAddress, saveAddress };
