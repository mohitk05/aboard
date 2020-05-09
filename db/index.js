const mongoose = require('mongoose');
const models = [
    'user', 'vehicle', 'message', 'route', 'stop'
]
module.exports = {
    connect: async () => {
        console.log(process.env.DB_URI)
        await mongoose.connect(process.env.DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        for (let m of models) {
            require('./models/' + m + '.js');
        }
    }
}
