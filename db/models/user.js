const mongoose = require('mongoose');
const { USER_STATES } = require('./../../utils/constants');

const User = mongoose.model('User', new mongoose.Schema({
    username: String,
    email: String,
    age: Number,
    password: String,
    role: Number,
    vehicle: {
        type: mongoose.Types.ObjectId,
        ref: 'Vehicle'
    },
    state: {
        type: String,
        enum: Object.keys(USER_STATES)
    },
    currentStop: {
        type: mongoose.Types.ObjectId,
        ref: 'Stop'
    },
    activeTicket: {
        type: mongoose.Types.ObjectId, // ticket id
        ref: 'Ticket'
    },
    interests: [
        {
            type: mongoose.Types.ObjectId, // interest id
            ref: 'Interest'
        }
    ]
}, { timestamps: true }));

module.exports = User;