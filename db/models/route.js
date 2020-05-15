const mongoose = require('mongoose');

const Route = mongoose.model('Route', new mongoose.Schema({
    name: String,
    stops: [mongoose.Types.ObjectId],
    possibleSpeeds: [Number]
}, { timestamps: true }));

module.exports = Route;