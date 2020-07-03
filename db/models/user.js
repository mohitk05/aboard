const mongoose = require('mongoose');
const { USER_STATES, USER_PROFILE_MODES } = require('./../../utils/constants');

const User = mongoose.model('User', new mongoose.Schema({
    profile: {
        age: Number,
        image: String,
        mode: {
            type: String,
            enum: Object.keys(USER_PROFILE_MODES)
        }
    },
    username: String,
    email: String,
    password: String,
    role: Number,
    state: {
        type: String,
        enum: Object.keys(USER_STATES)
    },
    currentStop: {
        type: mongoose.Types.ObjectId,
        ref: 'Stop'
    },
    ticket: {
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