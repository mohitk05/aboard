const { TRIP_STATES: { MOVING, STATIONARY, IDLE }, USER_STATES: { ATSTATION, READYTOGO, ONBOARD } } = require('./../utils/constants');

const cronController = {
    updateWorld: async () => {
        /*
            ** Runs every 1 WORLD_INTERVAL (default = 15 mins) **
            1. Update vehicle positions in all active trips
            2. Onboard/alight users
            3. Exchange messages
        */
        console.log('Updating world.')
        return await tripController.getMany([], { active: true }, { populate: 1 }).then(async trips => {
            // Trip updation
            let tripPromises = [];
            for (let i = 0; i < trips.length; i++) {
                let trip = trips[i];
                const tripRoute = trip.route;
                if (trip.state === MOVING) {
                    const dist = await routeController.getDistanceToNextStop(trip.route._id, trip.currentStopIndex);
                    if (trip.currentStateProgress + trip.speed >= dist) {
                        trip.state = STATIONARY;
                        trip.currentStateProgress = 0;
                        trip.currentStopIndex += 1;
                        trip.currentStopTimestamp = new Date();
                    } else {
                        trip.currentStateProgress += trip.speed;
                    }
                } else if (trip.state === STATIONARY) {
                    const wait = 1 // intervals to wait at stop
                    if (trip.currentStateProgress + 1 >= wait) {
                        if (trip.currentStopIndex < tripRoute.stops.length) {
                            trip.state = MOVING;
                            trip.currentStateProgress = 0;
                            trip.currentStopTimestamp = new Date();
                        } else {
                            trip.state = IDLE;
                            trip.currentStateProgress = 0;
                            trip.currentStopIndex = 0;
                            trip.currentStopTimestamp = null;
                            trip.active = false;
                        }
                    }
                } else if (trip.state === IDLE) {
                    // Do nothing, write another cron that moves trips from IDLE -> STATIONARY when specified.
                }
                tripPromises.push(trip.save());
            }

            return Promise.all(tripPromises);
        })
            .then(async () => {
                // User updation
                const users = await userController.getMany([], { ticket: { $ne: null } }, { populate: 1 });
                let userPromises = [];
                for (let i = 0; i < users.length; i++) {
                    let user = users[i];
                    const userTrip = await tripController.getOne(user.ticket.trip);

                    let tripRoute;
                    const getRoute = async () => {
                        if (tripRoute) return tripRoute;
                        tripRoute = await routeController.getOne(userTrip.route);
                        return tripRoute;
                    }

                    if (user.state === READYTOGO) {
                        if (userTrip && userTrip.state === STATIONARY) {
                            const tripRoute = await getRoute();
                            const currentStop = tripRoute.stops[userTrip.currentStopIndex];
                            if (currentStop === user.currentStop) {
                                user.state = ONBOARD;
                            }
                        }
                    } else if (user.state === ONBOARD) {
                        const tripRoute = await getRoute();
                        const currentStop = tripRoute.stops[userTrip.currentStopIndex];
                        const userDestinationStop = user.ticket.desiredTo || user.ticket.to;
                        if (userTrip.state === STATIONARY && currentStop === userDestinationStop) {
                            user.state = ATSTATION;
                            user.ticket = null;
                        } else if (userTrip.state === IDLE) {
                            user.state = ATSTATION;
                            user.ticket = null;
                        }
                        user.currentStop = currentStop;
                    } else if (user.state === ATSTATION) {
                        // do nothing
                    }
                }

                return await Promise.all(userPromises);
            })
            .catch(e => {
                return e;
            })
    }
}

module.exports = cronController;

const routeController = require('./route');
const userController = require('./user');
const tripController = require('./trip');