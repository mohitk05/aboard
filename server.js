(async () => {
    const express = require('express');
    const bodyParser = require('body-parser');
    const cors = require('cors');
    require('dotenv').config();

    const routes = require('./routes');
    const db = require('./db');
    const app = express();
    require('./cron')();

    await db.connect();

    app.use(cors());
    app.use(bodyParser.json());

    app.use(...require('./middleware'));
    app.use('/', routes);

    app.use((err, req, res, next) => {
        res.status(res.statusCode || 500).send({
            success: false,
            error: err.message
        })
    });

    const PORT = process.env.PORT || 8000;
    app.listen(PORT, () => {
        console.log('Started at port ' + PORT)
    })
})()