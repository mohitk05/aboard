const Vehicle = require('./../db/models/vehicle');

const vehicleController = {
    create: async (vehicle) => {
        return await Vehicle.create({
            name: vehicle.name
        });
    },
    delete: async (id) => {
        return await Vehicle.deleteOne({ _id: id });
    },
    getOne: async (id) => {
        return await Vehicle.findById(id);
    },
    getMany: async (ids, query = {}) => {
        if (!ids) ids = [];
        if (typeof ids === 'string') {
            ids = ids.split(',');
        }
        if (ids.length === 0) {
            return await Vehicle.find(query);
        } else {
            return await Vehicle.find({
                ...query,
                _id: { $in: ids }
            });
        }
    }
}

module.exports = vehicleController;