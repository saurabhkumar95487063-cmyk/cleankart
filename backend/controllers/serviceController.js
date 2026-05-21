const Service = require('../models/Service');

const getServices = async (req, res) => {
    try {
        const services = await Service.find({});
        res.json(services);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createService = async (req, res) => {
    try {
        const { category, name, price, icon } = req.body;
        let iconPath = icon;
        
        if (req.file) {
            iconPath = `/uploads/icons/${req.file.filename}`;
        }

        const service = new Service({ 
            category, 
            name, 
            price: Number(price), 
            icon: iconPath 
        });
        const createdService = await service.save();
        res.status(201).json(createdService);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateService = async (req, res) => {
    try {
        const { category, name, price, icon } = req.body;
        const service = await Service.findById(req.params.id);
        if (service) {
            service.category = category || service.category;
            service.name = name || service.name;
            service.price = price ? Number(price) : service.price;
            
            if (req.file) {
                service.icon = `/uploads/icons/${req.file.filename}`;
            } else if (icon) {
                service.icon = icon;
            }

            const updatedService = await service.save();
            res.json(updatedService);
        } else {
            res.status(404).json({ message: 'Service not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteService = async (req, res) => {
    try {
        const service = await Service.findById(req.params.id);
        if (service) {
            await service.deleteOne();
            res.json({ message: 'Service removed' });
        } else {
            res.status(404).json({ message: 'Service not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getServices, createService, updateService, deleteService };
