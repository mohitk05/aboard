const mongoose = require('mongoose');

const Message = mongoose.model('Message', {
    from: mongoose.Types.ObjectId,
    to: mongoose.Types.ObjectId,
    content: {
        title: String,
        body: String
    }
});

module.exports = Message;