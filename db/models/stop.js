const mongoose = require('mongoose');

const Stop = mongoose.model('Stop', {
    name: String,
    country: String,
    coordinates: {
        lat: Number,
        lng: Number
    }
});

module.exports = Stop;