const expect = require('chai').expect;
const db = require('./../db');
const vehicleController = require('./../controllers/vehicle');
const Vehicle = require('./../db/models/vehicle');
const { VEHICLE_STATES } = require('./../utils/constants');

describe('Vehicle controller tests', function () {

    before(function (done) {
        require('dotenv').config({ path: './.env' });
        db.connect().then(() => {
            done();
        });
    });

    describe('vehicleController.getMany([] | undefined)', function () {
        it('should return all vehicles when ids is empty array', async function () {
            const vehicles = await vehicleController.getMany([]);
            expect(vehicles).to.have.length.gt(0);
        })

        it('should return all vehicles when ids is not defined', async function () {
            const vehicles = await vehicleController.getMany();
            expect(vehicles).to.have.length.gt(0);
        })

        it('should return all vehicles when ids is empty array with route', async function () {
            const vehicles = await vehicleController.getMany([], {}, { populate: 1 });
            expect(vehicles).to.have.length.gt(0);
            expect(vehicles[0].route._doc).to.haveOwnProperty('stops');
        })
    })

    describe('vehicleController.getMany([ids] | ids)', function () {
        it('should return more than one vehicles when ids is array', async function () {
            const vehicles = await vehicleController.getMany(['5ebc7020510f9d38ca6e3ef4']);
            expect(vehicles).to.have.length.gt(0);
        })

        it('should return more than one vehicles when ids is string', async function () {
            const vehicles = await vehicleController.getMany('5ebc7020510f9d38ca6e3ef4');
            expect(vehicles).to.have.length.gt(0);
        })

        it('should return all vehicles when ids is empty array with route', async function () {
            const vehicles = await vehicleController.getMany(['5ebc7020510f9d38ca6e3ef4'], {}, { populate: 1 });
            expect(vehicles).to.have.length.gt(0);
            expect(vehicles[0].route._doc).to.haveOwnProperty('stops');
        })
    })

    describe('vehicleController.getOne()', function () {
        it('should return one vehicle', async function () {
            const vehicle = await vehicleController.getOne('5ebc7020510f9d38ca6e3ef4');
            expect(vehicle._doc).to.haveOwnProperty('name', 'The First Vehicle');
        })

        it('should return one vehicle with route', async function () {
            const vehicle = await vehicleController.getOne('5ebc7020510f9d38ca6e3ef4', { populate: 1 });
            expect(vehicle._doc).to.haveOwnProperty('name', 'The First Vehicle');
            expect(vehicle.route._doc).to.haveOwnProperty('stops');
        })
    })

    describe('vehicleController.create()', function () {
        let id;
        it('should create one vehicle', async function () {
            const vehicle = await vehicleController.create({
                name: "The Test Vehicle",
                route: "5ebc41d108dca42f52721f34"
            })
            id = vehicle._id;
            expect(vehicle._doc).to.haveOwnProperty('name', 'The Test Vehicle');
        })

        after(function (done) {
            Vehicle.deleteOne({ _id: id }).then(() => done());
        });
    })

    describe('vehicleController.updateState()', function () {
        let id;
        before(function (done) {
            vehicleController.create({
                name: "The Test Vehicle",
                route: "5ebc41d108dca42f52721f34"
            }).then((vehicle) => {
                id = vehicle._id;
                done();
            })
        })

        it('should update vehicle state', async function () {
            await vehicleController.updateState(id, VEHICLE_STATES.STATIONARY);
            let vehicle = await vehicleController.getOne(id);
            expect(vehicle._doc).to.haveOwnProperty('state', VEHICLE_STATES.STATIONARY);

            await vehicleController.updateState(id, VEHICLE_STATES.MOVING);
            vehicle = await vehicleController.getOne(id);
            expect(vehicle._doc).to.haveOwnProperty('state', VEHICLE_STATES.MOVING);
        })

        after(function (done) {
            Vehicle.deleteOne({ _id: id }).then(() => done());
        });
    })

    describe('vehicleController.idleToStationary()', function () {
        let id;
        before(function (done) {
            vehicleController.create({
                name: "The Test Vehicle",
                route: "5ebc41d108dca42f52721f34"
            }).then((vehicle) => {
                id = vehicle._id;
                done();
            })
        })

        it('should update vehicle state to STATIONARY', async function () {
            await vehicleController.idleToStationary(id);
            const vehicle = await vehicleController.getOne(id);
            expect(vehicle._doc).to.haveOwnProperty('state', VEHICLE_STATES.STATIONARY);
        })

        after(function (done) {
            Vehicle.deleteOne({ _id: id }).then(() => done());
        });
    })

})