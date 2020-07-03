const Route = require('./../db/models/route');
const mathHelper = require('./../utils/math');

const routeController = {
    create: async (name, stopIds) => {
        const possibleSpeeds = mathHelper.commonFactors(await stopController.getSequentialDistances(stopIds));
        return await Route.create({
            name,
            stops: stopIds,
            possibleSpeeds
        });
    },
    delete: async (id) => {
        return await Route.deleteOne({ _id: id });
    },
    getOne: async (id, options = { populate: 0 }) => {
        if (!options.populate)
            return await Route.findById(id);
        else
            return await Route.findById(id).populate('stops');
    },
    getMany: async (ids, query = {}, options = { populate: 0 }) => {
        let routes;
        if (ids.length === 0) {
            routes = Route.find(query);
        } else {
            routes = Route.find({
                ...query,
                _id: { $in: ids }
            });
        }

        if (!options.populate) {
            return await routes;
        } else {
            return await routes.populate('stops');
        }
    },
    getAllStopDistances: async (routeId) => {
        return await routeController.getOne(routeId).then(async route => {
            return await stopController.getSequentialDistances(route.stops);
        });
    },
    getDistanceToNextStop: async (routeId, currentIndex) => {
        return await routeController.getOne(routeId).then(async route => {
            if (currentIndex === route.stops.length - 1) return 0;
            let stop = route.stops[currentIndex],
                nextStop = route.stops[currentIndex + 1];
            return await stopController.getDistanceBetweenStops(stop, nextStop);
        })
    },
    autogenerateFromStops: async (config = {}) => {
        return await stopController.getMany([]).then(async stops => {
            const count = config.count || stops.length,
                maxLength = config.maxLength || 10,
                minLength = config.minLength || 5;
            /* 
                Algorithm:
                - Sort stops according to lng -180 to 180
                - Start with 0 index
                - Get slice of stops within minimum and maximum lng offset
                - Out of these get the closest stop lat wise
                - Push this to route array, set index = the selected stop
                - Repeat
            */
            let sortedStops = stops.slice();
            sortedStops.sort((a, b) => {
                return a.coordinates.lng - b.coordinates.lng;
            })

            let routes = [], stopRouteCount = {};
            sortedStops.forEach(s => {
                stopRouteCount[s._id] = 0;
            })
            const minOffset = 5, maxOffset = 15;
            while (routes.length < count) {
                let idx = Math.floor(Math.random() * sortedStops.length), route = [];
                let tries = 0;
                while (route.length < maxLength && tries < 1000) {
                    if (route.length >= minLength) {
                        if (Math.random() < 0.5) break;
                    }
                    let minNextIdx = (idx + minOffset) % sortedStops.length;

                    let probableSlice = [];
                    for (let i = 0; i < maxOffset - minOffset; i++) {
                        probableSlice.push(sortedStops[(minNextIdx + i) % sortedStops.length]);
                    }

                    probableSlice.sort((a, b) => b.coordinates.lat - a.coordinates.lng);
                    let tempIdx = Math.floor(Math.random() * probableSlice.length);
                    if (!route.find(stop => stop._id === probableSlice[tempIdx]._id) && stopRouteCount[probableSlice[tempIdx]._id] < 5) {
                        route.push(
                            probableSlice[tempIdx]
                        )
                        idx = sortedStops.findIndex(s => s._id === probableSlice[tempIdx]._id);
                        stopRouteCount[probableSlice[tempIdx]._id] += 1;
                    } else {
                        idx = (idx + 1) % sortedStops.length;
                    }

                    tries++;
                }

                routes.push(route);
            }

            routes = routes.filter(r => r.length >= minLength);

            let promises = [];
            routes.forEach((r, i) => {
                promises.push(
                    routeController.create(`Route ${i}`, r.map(stop => stop._id))
                )
            });

            return await Promise.all(promises);
        })
    }
}

module.exports = routeController;

const stopController = require('./stop');