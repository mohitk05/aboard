const mongoose = require('mongoose');

const Vehicle = mongoose.model('Vehicle', new mongoose.Schema({
    name: String,
    trip: {
        type: mongoose.Types.ObjectId, // trip id
        ref: 'Trip'
    }
}, { timestamps: true }));

module.exports = Vehicle;