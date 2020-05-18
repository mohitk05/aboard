const mongoose = require('mongoose');

const Route = mongoose.model('Route', new mongoose.Schema({
    name: String,
    stops: [{
        type: mongoose.Types.ObjectId,
        ref: 'Stop'
    }],
    possibleSpeeds: [Number]
}, { timestamps: true }));

module.exports = Route;