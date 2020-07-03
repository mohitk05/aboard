// const expect = require('chai').expect;
// const db = require('./../db');
// const cronController = require('./../controllers/cron');
// const Route = require('./../db/models/route');
// const Vehicle = require('./../db/models/vehicle');
// const User = require('./../db/models/user');
// const Stop = require('./../db/models/stop');
// const vehicleController = require('./../controllers/vehicle');
// const userController = require('./../controllers/user');
// const stopController = require('./../controllers/stop');
// const { TRIP_STATES, USER_STATES } = require('./../utils/constants');
// const mathHelper = require('./../utils/math');

// describe('Cron tests', function () {
//     let testStopId1, testStopId2, testStopId3, testRouteId, testVehicleId, testUserId1, testUserId2;
//     const stop1 = {
//         name: 'Test Stop 1',
//         country: 'Test Country 1',
//         coordinates: {
//             lat: 40,
//             lng: -40
//         }
//     }, stop2 = {
//         name: 'Test Stop 2',
//         country: 'Test Country 2',
//         coordinates: {
//             lat: -40,
//             lng: 100
//         }
//     }, stop3 = {
//         name: 'Test Stop 3',
//         country: 'Test Country 3',
//         coordinates: {
//             lat: 20,
//             lng: 120
//         }
//     };
//     let route1 = {
//         name: 'Test Route 1'
//     }
//     let vehicle1 = {
//         name: 'Test Vehicle 1'
//     }

//     let lngDist = (stop1, stop2) => stop2.coordinates.lng < 0 && stop1.coordinates.lng > 0
//         ? 180 - stop1.coordinates.lng + 180 + stop2.coordinates.lng
//         : stop1.coordinates.lng - stop2.coordinates.lng;
//     const testDistance1 = Math.floor(Math.sqrt(Math.pow(stop1.coordinates.lat - stop2.coordinates.lat, 2) + Math.pow(lngDist(stop1, stop2), 2)));
//     const testDistance2 = Math.floor(Math.sqrt(Math.pow(stop2.coordinates.lat - stop3.coordinates.lat, 2) + Math.pow(lngDist(stop2, stop3), 2)));

//     before(function (done) {
//         require('dotenv').config({ path: './.env' });
//         db.connect().then(() => {
//             Stop.create(stop1).then(stop => {
//                 testStopId1 = stop._id;
//                 return Stop.create(stop2)
//             }).then(async (stop) => {
//                 testStopId2 = stop._id;
//                 return Stop.create(stop2)
//             }).then(async stop => {
//                 testStopId3 = stop._id;
//                 route1.stops = [testStopId1, testStopId2, testStopId3];
//                 route1.possibleSpeeds = mathHelper.commonFactors(await stopController.getSequentialDistances([testStopId1, testStopId2]))
//                 return Route.create(route1)
//             }).then((route) => {
//                 testRouteId = route._id;
//                 vehicle1.route = testRouteId;
//                 return Vehicle.create(vehicle1)
//             }).then(vehicle => {
//                 testVehicleId = vehicle._id;
//                 return User.create(user1)
//             }).then(user => {
//                 testUserId1 = user._id;
//                 done();
//             })
//         });
//     });

//     describe('cronController.updateWorld()', function () {
//         it('should update the world', async function () {
//             await cronController.updateWorld();
//             const vehicle = await vehicleController.getOne(testVehicleId);
//             expect(vehicle._doc.state).to.be.equal(TRIP_STATES.IDLE);
//             const user = await userController.getOne(testUserId1);
//             expect(user._doc.state).to.be.equal(USER_STATES.ATSTATION);
//         })
//     })

// })