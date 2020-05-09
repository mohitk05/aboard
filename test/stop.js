const expect = require('chai').expect;
const stopController = require('./../controllers/stop');

describe('stopController.get()', function () {
    it('should return all stops', async function () {
        this.timeout(5000);
        const stops = await stopController.get([]);

        expect(stops.data).to.have.length.gt(0);
    })
})

describe('stopController.get([id])', function () {
    it('should return one stop', async function () {
        this.timeout(5000);
        const stop = await stopController.get(['25166f04-fee4-409b-9ce3-adaae52b961a']);

        expect(stop.data).to.have.length.equal(1);
    })
})

describe('stopController.get([id1, id2])', function () {
    it('should return one stop', async function () {
        this.timeout(5000);
        const stop = await stopController.get(['25166f04-fee4-409b-9ce3-adaae52b961a', '9af6084f-dd2b-42e9-9956-8b496d88ebde']);

        expect(stop.data).to.have.length.equal(2);
    })
})