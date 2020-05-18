const mongoose = require('mongoose');
const { VEHICLE_STATES } = require('./../../utils/constants');

const Vehicle = mongoose.model('Vehicle', new mongoose.Schema({
    name: String,
    route: {
        type: mongoose.Types.ObjectId, // route id
        ref: 'Route'
    },
    speed: Number, // units per world_interval
    state: {
        type: String,
        enum: Object.keys(VEHICLE_STATES)
    },
    currentStopIndex: Number, // current stop index (denotes the last visited stop if considered for every world cycle)
    currentStateProgress: Number, // denotes intermediate units travelled in case of MOVING, and intervals waited in case of STATIONARY
    currentStopTimestamp: Date // timestamp of the time when the vehicle was last recorded at the currentStop
}, { timestamps: true }));

module.exports = Vehicle;