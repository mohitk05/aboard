const mongoose = require('mongoose');

module.exports = {
    toObjectID: (id) => {
        return mongoose.Types.ObjectId(id);
    }
}