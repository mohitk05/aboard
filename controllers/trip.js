const Trip = require('./../db/models/trip');
const { TRIP_STATES, COST_PER_UNIT_DISTANCE } = require('./../utils/constants');

const tripController = {
    create: async (trip) => {
        return await routeController.getOne(trip.route).then(async route => {
            return await Trip.create({
                vehicle: trip.vehicle,
                route: route._id,
                active: !!trip.active,
                speed: route.possibleSpeeds[route.possibleSpeeds.length - 1],
                currentStopIndex: 0,
                currentStateProgress: 0,
                currentStopTimestamp: null
            });
        });
    },
    delete: async (id) => {
        return await Trip.deleteOne({ _id: id });
    },
    getOne: async (id, options = { populate: 0 }) => {
        if (!options.populate)
            return await Trip.findById(id);
        else
            return await Trip.findById(id).populate('route').populate('vehicle');
    },
    getMany: async (ids, query = {}, options = { populate: 0 }) => {
        let trips = [];
        if (!ids) ids = [];
        if (typeof ids === 'string') {
            ids = ids.split(',');
        }
        if (ids.length === 0) {
            trips = Trip.find(query);
        } else {
            trips = Trip.find({
                ...query,
                _id: { $in: ids }
            });
        }

        if (!options.populate) {
            return await trips;
        } else {
            return await trips.populate('route').populate('vehicle');
        }
    },
    startTrip: async (id) => {
        return await Trip.findById(id).then(async trip => {
            if (trip) {
                trip.active = true;
                trip.state = TRIP_STATES.STATIONARY;
                trip.currentStopTimestamp = new Date();
                return await trip.save();
            } else {
                return Promise.reject('No such trip.')
            }
        });
    },
    getPriceBetweenStops: async (tripId, from, to) => {
        return await tripController.getOne(tripId, { populate: 1 }).then(async trip => {
            const route = trip.route;
            const fromId = route.stops.indexOf(from);
            const toId = route.stops.indexOf(to);
            if (toId <= fromId) return Promise.reject('Incorrect order of stops.');
            const dists = await stopController.getSequentialDistances(route.stops.slice(fromId, toId + 1))
            return dists.reduce((acc, val) => acc + val, 0) * COST_PER_UNIT_DISTANCE;
        })
    }
}

module.exports = tripController;

const routeController = require('./route');
const stopController = require('./stop');