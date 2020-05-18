const mongoose = require('mongoose');

const Interest = mongoose.model('Interest', new mongoose.Schema({
    name: String,
    description: String,
    image: String
}, { timestamps: true }));

module.exports = Interest;