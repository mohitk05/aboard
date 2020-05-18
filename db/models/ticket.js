const mongoose = require('mongoose');

const Ticket = mongoose.model('Ticket', new mongoose.Schema({
    from: {
        type: mongoose.Types.ObjectId,
        ref: 'Stop'
    },
    to: {
        type: mongoose.Types.ObjectId,
        ref: 'Stop'
    },
    user: {
        type: mongoose.Types.ObjectId,
        ref: 'User'
    },
    price: Number
}, { timestamps: true }));

module.exports = Ticket;