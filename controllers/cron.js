const routeController = require('./route');
const vehicleController = require('./vehicle');
const userController = require('./user');

const { VEHICLE_STATES: { MOVING, STATIONARY, IDLE }, USER_STATES: { ATSTATION, READYTOGO, ONBOARD } } = require('./../utils/constants');

const cronController = {
    updateWorld: async () => {
        /*
            ** Runs every 1 WORLD_INTERVAL (default = 30 mins) **
            1. Update vehicle positions
            2. Onboard/alight users
            3. Exchange messages
        */
        return await vehicleController.get([]).then(async vehicles => {
            // Vehicle updation
            let vehiclePromises = [];
            for (let i = 0; i < vehicles.length; i++) {
                let vehicle = vehicles[i];
                const vehicleRoute = await routeController.get([vehicle.route]);
                if (vehicle.state === MOVING) {
                    const dist = await routeController.getDistanceToNextStop(vehicle.route, vehicle.currentStopIndex);
                    if (vehicle.currentStateProgress + vehicle.speed >= dist) {
                        vehicle.state = STATIONARY;
                        vehicle.currentStateProgress = 0;
                        vehicle.currentStopIndex += 1;
                    } else {
                        vehicle.currentStateProgress += vehicle.speed;
                    }
                } else if (vehicle.state === STATIONARY) {
                    const wait = 1 // intervals to wait at stop
                    if (vehicle.currentStateProgress + 1 >= wait) {
                        if (vehicle.currentStopIndex < vehicleRoute.stops.length) {
                            vehicle.state = MOVING;
                            vehicle.currentStateProgress = 0;
                        } else {
                            vehicle.state = IDLE;
                            vehicle.currentStateProgress = 0;
                            vehicle.currentStopIndex = 0;
                        }
                    }
                } else if (vehicle.state === IDLE) {
                    // Do nothing, write another cron that moves vehicles from IDLE -> STATIONARY when specified.
                }
                vehiclePromises.push(vehicle.save());
            }

            return Promise.all(vehiclePromises);
        })
            .then(async () => {
                // User updation
                const users = await userController.get([]);
                let userPromises = [];
                for (let i = 0; i < users.length; i++) {
                    let user = users[i];
                    const userVehicle = user.vehicle && await vehicleController.get([user.vehicle]);

                    let vehicleRoute;
                    const getRoute = async () => {
                        if (vehicleRoute) return Promise.resolve(vehicleRoute);
                        return await routeController.get([userVehicle.route]);
                    }

                    if (user.state === READYTOGO) {
                        if (userVehicle && userVehicle.state === STATIONARY) {
                            const vehicleRoute = await getRoute();
                            const currentStop = vehicleRoute.stops[userVehicle.currentStopIndex];
                            if (currentStop === user.currentStop) {
                                user.state = ONBOARD;
                            }
                        }
                    } else if (user.state === ONBOARD) {
                        const vehicleRoute = await getRoute();
                        const currentStop = vehicleRoute.stops[userVehicle.currentStopIndex];
                        if (userVehicle.state === STATIONARY && currentStop === user.destinationStop) {
                            user.state = ATSTATION;
                            user.destinationStop = null;
                        } else if (userVehicle.state === IDLE) {
                            user.state = ATSTATION;
                            user.destinationStop = null;
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