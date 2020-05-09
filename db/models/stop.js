const mongoose = require('mongoose');

const Stop = mongoose.model('Stop', {
    id: String,
    name: String,
    country: String,
    coordinates: {
        lat: Number,
        lng: Number
    }
});

module.exports = Stop;