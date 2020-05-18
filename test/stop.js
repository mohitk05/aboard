const expect = require('chai').expect;
const stopController = require('./../controllers/stop');
const Stop = require('./../db/models/stop');
const db = require('./../db');
const vehicleController = require('./../controllers/vehicle');
const routeController = require('./../controllers/route');

describe('Stop tests', function () {
    let testStopId1, testStopId2;
    const stop1 = {
        name: 'Test Stop 1',
        country: 'Test Country 1',
        coordinates: {
            lat: 40,
            lng: 90
        }
    }, stop2 = {
        name: 'Test Stop 2',
        country: 'Test Country 2',
        coordinates: {
            lat: -40,
            lng: 100
        }
    };
    let lngDist = stop2.coordinates.lng < 0 && stop1.coordinates.lng > 0
        ? 180 - stop1.coordinates.lng + 180 + stop2.coordinates.lng
        : stop1.coordinates.lng - stop2.coordinates.lng;
    const testDistance = Math.floor(Math.sqrt(Math.pow(stop1.coordinates.lat - stop2.coordinates.lat, 2) + Math.pow(lngDist, 2)));

    before(function (done) {
        require('dotenv').config({ path: './.env' });
        db.connect().then(() => {
            Stop.create(stop1).then(stop => {
                testStopId1 = stop._id;
                return Stop.create(stop2)
            }).then((stop) => {
                testStopId2 = stop._id;
                done();
            })
        });
    });

    describe('stopController.create()', function () {
        let stopId;
        it('should create a stop', async function () {
            const stop = await stopController.create({
                name: 'Test Stop 3',
                country: 'Test Country 3',
                coordinates: {
                    lat: -40,
                    lng: 100
                }
            });
            stopId = stop._id;
            expect(stop._doc).to.haveOwnProperty('name', 'Test Stop 3');
        })

        after(function (done) {
            Stop.deleteOne({ _id: stopId }).then(() => done());
        })
    })

    describe('stopController.getMany()', function () {
        it('should return all stops', async function () {
            const stops = await stopController.getMany([]);
            expect(stops).to.have.length.gt(0);
        })

        it('should return all the queried stops', async function () {
            const stops = await stopController.getMany([testStopId1, testStopId2]);
            expect(stops).to.have.length.gt(0);
        })
    })

    describe('stopController.getOne(id)', function () {
        it('should return one stop', async function () {
            const stop = await stopController.getOne(testStopId1);
            expect(stop._doc).to.haveOwnProperty('name', stop1.name);
        })
    })

    describe('stopController.getDistanceBetweenStops(fromId, toId)', function () {
        it('should return distance between from and to', async function () {
            const dist = await stopController.getDistanceBetweenStops(testStopId1, testStopId2);
            expect(dist).to.be.equal(testDistance);
        })
    })

    describe('stopController.getSequentialDistances(stops)', function () {
        it('should return sequential distances', async function () {
            let stops = [testStopId1, testStopId2];
            const dists = await stopController.getSequentialDistances(stops);
            expect(dists).to.have.length(stops.length - 1);
            expect(dists[0]).to.be.equal(testDistance);
        })
    })

    describe('stopController.getIncomingVehicles(stop)', function () {
        let routeId, vehicleId;
        before(function (done) {
            routeController.create('Test Route', [testStopId1, testStopId2]).then(route => {
                routeId = route._id;
                return vehicleController.create({
                    name: "The Test Vehicle",
                    route: route._id
                })
            }).then(vehicle => {
                vehicleId = vehicle._id;
                vehicleController.idleToStationary(vehicleId).then(() => {
                    done();
                });
            })
        })

        it('should return incoming vehicles at a stop', async function () {
            const incoming = await stopController.getIncomingVehicles(testStopId1);
            expect(incoming).to.have.length(1);
            let vId = incoming[0].vehicle._id.toString();
            expect(vId).to.be.equal(vehicleId.toString());
        })

        after(function (done) {
            vehicleController.delete(vehicleId).then(() => {
                routeController.delete(routeId);
            }).then(() => done());
        })
    })

    after(function (done) {
        Stop.deleteMany({ _id: { $in: [testStopId1, testStopId2] } }).then(() => done());
    });

})