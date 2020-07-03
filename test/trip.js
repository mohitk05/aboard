const expect = require('chai').expect;
const db = require('./../db');
const tripController = require('./../controllers/trip');
const Trip = require('./../db/models/trip');

describe('Trip controller tests', function () {
    let testTripId;
    before(function (done) {
        require('dotenv').config({ path: './.env' });
        db.connect().then(() => {
            Trip.create({
                vehicle: "5ebc7020510f9d38ca6e3ef4",
                route: "5ebc41d108dca42f52721f34"
            }).then((trip) => {
                testTripId = trip;
                done();
            })
        });
    });

    describe('tripController.getMany([] | undefined)', function () {
        it('should return all trips when ids is empty array', async function () {
            const trips = await tripController.getMany([]);
            expect(trips).to.have.length.gt(0);
        })

        it('should return all trips when ids is not defined', async function () {
            const trips = await tripController.getMany();
            expect(trips).to.have.length.gt(0);
        })

        it('should return all trips when ids is empty array with route', async function () {
            const trips = await tripController.getMany([], {}, { populate: 1 });
            expect(trips).to.have.length.gt(0);
            expect(trips[0].route._doc).to.haveOwnProperty('stops');
        })
    })

    describe('tripController.getMany([ids] | ids)', function () {
        it('should return more than one trips when ids is array', async function () {
            const trips = await tripController.getMany([testTripId]);
            expect(trips).to.have.length.gt(0);
        })

        it('should return more than one trips when ids is string', async function () {
            const trips = await tripController.getMany(testTripId);
            expect(trips).to.have.length.gt(0);
        })

        it('should return all trips when ids is empty array with route', async function () {
            const trips = await tripController.getMany([testTripId], {}, { populate: 1 });
            expect(trips).to.have.length.gt(0);
            expect(trips[0].route._doc).to.haveOwnProperty('stops');
        })
    })

    describe('tripController.getOne()', function () {
        it('should return one trip', async function () {
            const trip = await tripController.getOne(testTripId);
            expect(trip._doc).to.haveOwnProperty('vehicle');
            expect(trip._doc).to.haveOwnProperty('route');
        })

        it('should return one trip with route', async function () {
            const trip = await tripController.getOne(testTripId, { populate: 1 });
            expect(trip._doc).to.haveOwnProperty('vehicle');
            expect(trip._doc).to.haveOwnProperty('route');
            expect(trip.route._doc).to.haveOwnProperty('stops');
        })
    })

    describe('tripController.create()', function () {
        let id;
        it('should create one trip', async function () {
            const trip = await tripController.create({
                vehicle: "5ebc7020510f9d38ca6e3ef4",
                route: "5ebc41d108dca42f52721f30"
            })
            id = trip._id;
            expect(trip._doc).to.haveOwnProperty('vehicle');
        })

        after(function (done) {
            Trip.deleteOne({ _id: id }).then(() => done());
        });
    })

    // describe('tripController.idleToStationary()', function () {
    //     let id;
    //     before(function (done) {
    //         tripController.create({
    //             name: "The Test Trip",
    //             route: "5ebc41d108dca42f52721f34"
    //         }).then((trip) => {
    //             id = trip._id;
    //             done();
    //         })
    //     })

    //     it('should update trip state to STATIONARY', async function () {
    //         await tripController.idleToStationary(id);
    //         const trip = await tripController.getOne(id);
    //         expect(trip._doc).to.haveOwnProperty('state', VEHICLE_STATES.STATIONARY);
    //     })

    //     after(function (done) {
    //         Trip.deleteOne({ _id: id }).then(() => done());
    //     });
    // })

    after(function (done) {
        Trip.deleteOne({ _id: testTripId }).then(() => {
            return db.disconnect();
        }).then(() => {
            done();
        })
    })
})