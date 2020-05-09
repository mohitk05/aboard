const Vehicle = require('./../db/models/vehicle');
const { get: getRoute } = require('./route');
const { v4: uuidv4 } = require('uuid');
const routeController = require('./route');
const { VEHICLE_STATES: { MOVING, STATIONARY, IDLE } } = require('./../utils/constants');

const vehicleController = {
    create: async (vehicle) => {
        return await routeController.get([vehicle.route]).then(async route => {
            return await Vehicle.create({
                id: uuidv4(),
                name: vehicle.name,
                state: IDLE,
                route: route.id,
                speed: route.possibleSpeeds[route.possibleSpeeds.length - 1],
                currentStopIndex: 0,
                currentStateProgress: 0
            });
        });
    },
    get: async (ids) => {
        if (!ids) ids = [];
        if (typeof ids === 'string') {
            ids = ids.split(',');
        }
        if (ids.length === 1) {
            return await Vehicle.find({ id: ids[0] });
        } else if (ids.length === 0) {
            return await Vehicle.find();
        } else {
            return await Vehicle.find({
                id: { $in: ids }
            });
        }
    },
    updateRoute: async (vehicleId, routeId) => {
        return await Vehicle.findByIdAndUpdate(vehicleId, {
            route: routeId,
            state: STATIONARY,
            currentStopIndex: 0
        });
    },
    startMoving: async (vehicleId) => {
        return await Vehicle.findByIdAndUpdate(vehicleId, {
            state: MOVING
        })
    },
    reachStation: async (vehicleId) => {
        return await Vehicle.findById(vehicleId).then(async vehicle => {
            const route = await getRoute([vehicle.route]);
            if (route.length > vehicle.currentStopIndex + 1) {
                vehicle.state = STATIONARY;
                vehicle.currentStopIndex += 1;
            } else {
                vehicle.state = IDLE;
                vehicle.currentStopIndex = 0;
            }
            return await vehicle.save();
        })
    }
}

module.exports = vehicleController;