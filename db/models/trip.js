const mongoose = require('mongoose');
const { TRIP_STATES } = require('./../../utils/constants');

const Trip = mongoose.model('Trip', new mongoose.Schema({
    vehicle: {
        type: mongoose.Types.ObjectId,
        ref: 'Vehicle'
    },
    route: {
        type: mongoose.Types.ObjectId,
        ref: 'Route'
    },
    state: {
        type: String,
        enum: Object.keys(TRIP_STATES)
    },
    active: Boolean,
    speed: Number, // units per world_interval
    currentStopIndex: Number, // current stop index (denotes the last visited stop if considered for every world cycle)
    currentStateProgress: Number, // denotes intermediate units travelled in case of MOVING, and intervals waited in case of STATIONARY
    currentStopTimestamp: Date // timestamp of the time when the vehicle was last recorded at the currentStop
}, { timestamps: true }));

module.exports = Trip;