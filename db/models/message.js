const mongoose = require('mongoose');

const Message = mongoose.model('Message', new mongoose.Schema({
    from: {
        type: mongoose.Types.ObjectId,
        ref: 'User'
    },
    conversation: {
        type: mongoose.Types.ObjectId,
        ref: 'Conversation'
    },
    content: {
        title: String,
        body: String
    }
}, { timestamps: true }));

module.exports = Message;