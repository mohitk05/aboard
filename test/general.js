const expect = require('chai').expect;
const generalController = require('./../controllers/general');

describe('ping()', () => {
    it('should return hello', async function () {
        const expected = 'hello';

        const result = await generalController.ping();

        expect(result).to.be.equal(expected);
    })
})