const Stop = require('./../db/models/stop');
const { v4: uuidv4 } = require('uuid');
const mathHelper = require('./../utils/math');

const stopController = {
    create: async (stop) => {
        return await Stop.create({
            id: uuidv4(),
            name: stop.name,
            country: stop.country,
            coordinates: {
                lat: mathHelper.makeEven(stop.coordinates.lat),
                lng: mathHelper.makeEven(stop.coordinates.lng)
            }
        });
    },
    get: async (ids) => {
        if (ids.length === 1) {
            return await Stop.find({ id: ids[0] });
        } else if (ids.length === 0) {
            return await Stop.find();
        } else {
            return await Stop.find({
                id: { $in: ids }
            });
        }
    },
    getDistanceBetweenStops: async (fromId, toId) => {
        const [from, to] = await stopController.get([fromId, toId]);
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
    }
}

module.exports = stopController;