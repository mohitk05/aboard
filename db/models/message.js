const mongoose = require('mongoose');

const Message = mongoose.model('Message', {
    id: String,
    from: String,
    to: String,
    content: {
        title: String,
        body: String
    }
});

module.exports = Message;