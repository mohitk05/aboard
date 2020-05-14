const mongoose = require('mongoose');

const Route = mongoose.model('Route', {
    name: String,
    stops: [mongoose.Types.ObjectId],
    possibleSpeeds: [Number]
});

module.exports = Route;