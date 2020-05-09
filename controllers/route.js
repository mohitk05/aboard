const Route = require('./../db/models/route');
const stopController = require('./stop');
const { v4: uuidv4 } = require('uuid');
const mathHelper = require('./../utils/math');

const routeController = {
    create: async (name, stopIds) => {
        const possibleSpeeds = mathHelper.commonFactors(await stopController.getSequentialDistances(stopIds));
        return await Route.create({
            id: uuidv4(),
            name,
            stops: stopIds,
            possibleSpeeds
        });
    },
    get: async (ids, options = { stops: 0 }) => {
        let routes;
        if (ids.length === 1) {
            routes = await Route.find({ id: ids[0] });
        } else if (ids.length === 0) {
            routes = await Route.find();
        } else {
            routes = await Route.find({
                id: { $in: ids }
            });
        }

        if (!options.stops) {
            return routes;
        } else {
            for (let i = 0; i < routes.length; i++) {
                let route = routes[i]._doc;
                route.stops = await stopController.get(route.stops);
            }
            return routes;
        }
    },
    getAllStopDistances: async (routeId) => {
        return await routeController.get([routeId]).then(async route => {
            return await stopController.getSequentialDistances(route.stops);
        });
    },
    getDistanceToNextStop: async (routeId, currentIndex) => {
        return await Route.findById(routeId).then(async route => {
            let stop = route.stops[currentIndex],
                nextStop = route.stops[currentIndex + 1];
            return await stopController.getDistanceBetweenStops(stop, nextStop);
        })
    },
    autogenerateFromStops: async (config = {}) => {
        return await stopController.get([]).then(async stops => {
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
                stopRouteCount[s.id] = 0;
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
                    if (!route.find(stop => stop.id === probableSlice[tempIdx].id) && stopRouteCount[probableSlice[tempIdx].id] < 5) {
                        route.push(
                            probableSlice[tempIdx]
                        )
                        idx = sortedStops.findIndex(s => s.id === probableSlice[tempIdx].id);
                        stopRouteCount[probableSlice[tempIdx].id] += 1;
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
                    routeController.create(`Route ${i}`, r.map(stop => stop.id))
                )
            });

            return await Promise.all(promises);
        })
    }
}

module.exports = routeController;