const mongoose = require('mongoose');

const Route = mongoose.model('Route', {
    id: String,
    name: String,
    stops: [String],
    possibleSpeeds: [Number]
});

module.exports = Route;