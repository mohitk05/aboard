const Vehicle = require('./../db/models/vehicle');
const { VEHICLE_STATES } = require('./../utils/constants');

const vehicleController = {
    create: async (vehicle) => {
        return await routeController.getOne(vehicle.route).then(async route => {
            return await Vehicle.create({
                name: vehicle.name,
                state: VEHICLE_STATES.IDLE,
                route: route._id,
                speed: route.possibleSpeeds[route.possibleSpeeds.length - 1],
                currentStopIndex: 0,
                currentStateProgress: 0,
                currentStopTimestamp: null
            });
        });
    },
    delete: async (id) => {
        return await Vehicle.deleteOne({ _id: id });
    },
    getOne: async (id, options = { populate: 0 }) => {
        if (!options.populate)
            return await Vehicle.findById(id);
        else
            return await Vehicle.findById(id).populate('route');
    },
    getMany: async (ids, query = {}, options = { populate: 0 }) => {
        let vehicles = [];
        if (!ids) ids = [];
        if (typeof ids === 'string') {
            ids = ids.split(',');
        }
        if (ids.length === 0) {
            vehicles = Vehicle.find(query);
        } else {
            vehicles = Vehicle.find({
                ...query,
                _id: { $in: ids }
            });
        }

        if (!options.populate) {
            return await vehicles;
        } else {
            return await vehicles.populate('route')
        }
    },
    updateState: async (id, state) => {
        if (!VEHICLE_STATES[state]) return Promise.reject('Invalid vehicle state.');
        return await vehicleController.getOne(id).then(async vehicle => {
            vehicle.state = state;
            return await vehicle.save();
        });
    },
    idleToStationary: async (id) => {
        return await Vehicle.findOne({ _id: id, state: VEHICLE_STATES.IDLE }).then(async vehicle => {
            if (vehicle) {
                vehicle.state = VEHICLE_STATES.STATIONARY;
                vehicle.currentStopTimestamp = new Date();
                return await vehicle.save();
            } else {
                return Promise.reject('No such vehicle.')
            }
        });
    }
}

module.exports = vehicleController;

const routeController = require('./route');