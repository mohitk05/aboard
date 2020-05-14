const Vehicle = require('./../db/models/vehicle');
const routeController = require('./route');
const { VEHICLE_STATES: { MOVING, STATIONARY, IDLE } } = require('./../utils/constants');

const vehicleController = {
    create: async (vehicle) => {
        return await routeController.getOne(vehicle.route).then(async route => {
            return await Vehicle.create({
                name: vehicle.name,
                state: IDLE,
                route: route._id,
                speed: route.possibleSpeeds[route.possibleSpeeds.length - 1],
                currentStopIndex: 0,
                currentStateProgress: 0
            });
        });
    },
    getOne: async (id, options = { populate: 0 }) => {
        return await Vehicle.findById(id).then(async vehicle => {
            if (!options.populate) return vehicle;
            return await routeController.getOne(vehicle.route, options).then(route => {
                vehicle.route = route._doc;
                return vehicle;
            })
        })
    },
    getMany: async (ids, options = { populate: 0 }) => {
        let vehicles = [];
        if (!ids) ids = [];
        if (typeof ids === 'string') {
            ids = ids.split(',');
        }
        if (ids.length === 0) {
            vehicles = await Vehicle.find();
        } else {
            vehicles = await Vehicle.find({
                _id: { $in: ids }
            });
        }

        if (!options.populate) {
            return vehicles;
        } else {
            for (let i = 0; i < vehicles.length; i++) {
                let vehicle = vehicles[i]._doc;
                vehicle.route = await routeController.getOne(vehicle.route);
            }
            return vehicles;
        }
    },
    updateState: async (id, state) => {
        if (!VEHICLE_STATES[state]) return Promise.reject('Invalid vehicle state.');
        return await vehicleController.getOne(id).then(async vehicle => {
            vehicle.state = state;
            return await vehicle.save();
        });
    }
}

module.exports = vehicleController;