const expect = require('chai').expect;
const db = require('./../db');
const Route = require('./../db/models/route');
const Stop = require('./../db/models/stop');
const routeController = require('./../controllers/route');
const stopController = require('./../controllers/stop');
const mathHelper = require('./../utils/math');

describe('Route tests', function () {
    let testStopId1, testStopId2, testRouteId;
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
    let route1 = {
        name: 'Test Route 1'
    }
    before(function (done) {
        require('dotenv').config({ path: './.env' });
        db.connect().then(() => {
            Stop.create(stop1).then(stop => {
                testStopId1 = stop._id;
                return Stop.create(stop2)
            }).then(async (stop) => {
                testStopId2 = stop._id;
                route1.stops = [testStopId1, testStopId2];
                route1.possibleSpeeds = mathHelper.commonFactors(await stopController.getSequentialDistances([testStopId1, testStopId2]))
                Route.create(route1).then((route) => {
                    testRouteId = route._id;
                    done();
                })
            })
        });
    });

    describe('routeController.create()', function () {
        let routeId;
        it('should create a route', async function () {
            const route = await routeController.create(
                'Test Route 2',
                [testStopId1, testStopId2]
            );
            routeId = route._id;
            expect(route._doc).to.haveOwnProperty('name', 'Test Route 2');
        })

        after(function (done) {
            Route.deleteOne({ _id: routeId }).then(() => done());
        })
    })

    describe('routeController.delete()', function () {
        let routeId;
        before(function (done) {
            routeController.create('Test Route 2', [testStopId1, testStopId2]).then(route => {
                routeId = route._id;
                done();
            });
        })

        it('should delete a route', async function () {
            await routeController.delete(routeId);
            const route = await Route.findById(routeId);
            expect(route).to.be.equal(null);
        })

        after(function (done) {
            Route.deleteOne({ _id: routeId }).then(() => done());
        })
    })

    describe('routeController.getMany()', function () {
        it('should return all routes', async function () {
            const routes = await routeController.getMany([]);
            expect(routes).to.have.length.gt(0);
        })

        it('should return all routes populated', async function () {
            const routes = await routeController.getMany([], {}, { populate: 1 });
            expect(routes).to.have.length.gt(0);
            expect(routes[0].stops[0]._doc).to.haveOwnProperty('name');
        })

        it('should return all the queried routes', async function () {
            const routes = await routeController.getMany([testRouteId]);
            expect(routes).to.have.length.gt(0);
        })
    })

    describe('routeController.getOne(id)', function () {
        it('should return one route', async function () {
            const route = await routeController.getOne(testRouteId);
            expect(route._doc).to.haveOwnProperty('name', route1.name);
        })

        it('should return one route populated', async function () {
            const route = await routeController.getOne(testRouteId, { populate: 1 });
            expect(route._doc).to.haveOwnProperty('name', route1.name);
            expect(route.stops[0]._doc).to.haveOwnProperty('name', stop1.name);
        })
    })

    describe('routeController.getAllStopDistances(routeId)', function () {
        it('should return distances between all consecutive stops of a route', async function () {
            const dists = await routeController.getAllStopDistances(testRouteId);
            expect(dists).to.have.length.gt(0);
            expect(dists[0]).to.be.equal(testDistance);
        })
    })

    describe('routeController.getDistanceToNextStop(routeId, currIndex)', function () {
        it('should return distance between the currentStop and next stop of a route', async function () {
            const dist = await routeController.getDistanceToNextStop(testRouteId, 0);
            expect(dist).to.be.equal(testDistance);
        })

        it('should return distance between the currentStop and next stop of a route, 0 if currStop is last stop', async function () {
            const dist = await routeController.getDistanceToNextStop(testRouteId, 1);
            expect(dist).to.be.equal(0);
        })
    })

    describe('routeController.autogenerateFromStops(config)', function () {
        let routeIds = [];
        it('should generate n routes from the stops', async function () {
            let count = 5;
            const routes = await routeController.autogenerateFromStops({ count });
            routeIds = routes.map(r => r._id);
            expect(routes).to.have.length.lte(count);
        })

        it('should generate n routes from the stops', async function () {
            const routes = await routeController.autogenerateFromStops();
            routeIds = routes.map(r => r._id);
            expect(routes).to.have.length.lte(routes.length);
        })

        afterEach(function (done) {
            Route.deleteMany({ _id: { $in: routeIds } }).then(() => done());
        })
    })

    after(function (done) {
        Route.deleteOne({ _id: testRouteId }).then(() => {
            Stop.deleteMany({ _id: { $in: [testStopId1, testStopId2] } })
        }).then(() => {
            return db.disconnect()
        }).then(() => {
            done();
        });
    });

})