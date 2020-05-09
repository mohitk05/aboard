const expect = require('chai').expect;
const vehicleController = require('./../controllers/vehicle');

describe('vehicleController.get()', function () {
    it('should return all vehicles', async function () {
        this.timeout(5000);
        const vehicles = await vehicleController.get([]);
        expect(vehicles).to.have.length.gt(0);
    })
})