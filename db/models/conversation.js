const mongoose = require('mongoose');

const Conversation = mongoose.model('Conversation', new mongoose.Schema({
    members: {
        type: [mongoose.Types.ObjectId],
        ref: 'User'
    }
}, { timestamps: true }));

module.exports = Conversation;