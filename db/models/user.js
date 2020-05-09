const mongoose = require('mongoose');
const { USER_STATES } = require('./../../utils/constants');

const User = mongoose.model('User', {
    id: String,
    username: String,
    email: String,
    password: String,
    vehicle: String,
    state: {
        type: String,
        enum: Object.keys(USER_STATES)
    },
    currentStop: String,
    destinationStop: String
});

module.exports = User;