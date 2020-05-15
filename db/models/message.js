const mongoose = require('mongoose');

const Message = mongoose.model('Message', new mongoose.Schema({
    from: mongoose.Types.ObjectId,
    to: mongoose.Types.ObjectId,
    content: {
        title: String,
        body: String
    }
}, { timestamps: true }));

module.exports = Message;