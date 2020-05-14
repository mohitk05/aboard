const mongoose = require('mongoose');
const { USER_STATES } = require('./../../utils/constants');

const User = mongoose.model('User', {
    username: String,
    email: String,
    password: String,
    role: Number,
    vehicle: mongoose.Types.ObjectId,
    state: {
        type: String,
        enum: Object.keys(USER_STATES)
    },
    currentStop: mongoose.Types.ObjectId,
    activeTicket: mongoose.Types.ObjectId // ticket id
});

module.exports = User;