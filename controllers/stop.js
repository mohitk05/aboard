const Stop = require('./../db/models/stop');
const mathHelper = require('./../utils/math');
const { VEHICLE_STATES: { MOVING, STATIONARY }, WORLD_INTERVAL } = require('./../utils/constants');

const stopController = {
    create: async (stop) => {
        return await Stop.create({
            name: stop.name,
            country: stop.country,
            coordinates: {
                lat: mathHelper.makeEven(stop.coordinates.lat),
                lng: mathHelper.makeEven(stop.coordinates.lng)
            }
        });
    },
    getOne: async (id) => {
        return await Stop.findById(id);
    },
    getMany: async (ids, query = {}) => {
        if (!ids.length) {
            return await Stop.find(query);
        } else {
            return await Stop.find({
                ...query,
                _id: { $in: ids }
            });
        }
    },
    getDistanceBetweenStops: async (fromId, toId) => {
        if (fromId === toId) return 0;
        const from = await stopController.getOne(fromId);
        const to = await stopController.getOne(toId);
        let lngDist = to.coordinates.lng < 0 && from.coordinates.lng > 0
            ? 180 - from.coordinates.lng + 180 + to.coordinates.lng
            : from.coordinates.lng - to.coordinates.lng;
        return Math.floor(Math.sqrt(Math.pow(from.coordinates.lat - to.coordinates.lat, 2) + Math.pow(lngDist, 2)));
    },
    getSequentialDistances: async (stops) => {
        let distances = [];
        for (let i = 0; i < stops.length - 1; i++) {
            distances.push(
                await stopController.getDistanceBetweenStops(stops[i], stops[i + 1])
            )
        }
        return distances;
    },
    getIncomingVehicles: async (stop, limit = 5) => {
        return await vehicleController.getMany([], {
            state: { $in: [MOVING, STATIONARY] },
        }, { populate: 1 }).then(async vehicles => {
            let vehicleWithStops = vehicles.filter(v => {
                return v.route.stops.includes(stop)
                    && (v.currentStopIndex < v.route.stops.indexOf(stop)
                        || (v.currentStopIndex === v.route.stops.indexOf(stop) && v.state === STATIONARY));
            });
            for (let i = 0; i < vehicleWithStops.length; i++) {
                let v = vehicleWithStops[i];
                let indexOfStop = v.route.stops.indexOf(stop);
                let seqDist = await stopController.getSequentialDistances(v.route.stops.slice(0, indexOfStop + 1));
                let dist = seqDist.reduce((acc, curr) => acc + curr, 0);
                let lastTimeStamp = v.currentStopTimestamp.getTime();
                vehicleWithStops[i] = {
                    vehicle: v,
                    distance: dist - v.currentStateProgress,
                    arrivalTime: lastTimeStamp + (dist / v.speed) * WORLD_INTERVAL * (1000 * 60)
                }
            }
            return vehicleWithStops;
        })
    }
}

module.exports = stopController;

const vehicleController = require('./vehicle');
