const mongoose = require('mongoose');

const Stop = mongoose.model('Stop', new mongoose.Schema({
    name: String,
    country: String,
    coordinates: {
        lat: Number,
        lng: Number
    }
}, { timestamps: true }));

module.exports = Stop;