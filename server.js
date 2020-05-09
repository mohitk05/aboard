(async () => {
    const express = require('express');
    const bodyParser = require('body-parser');
    const cors = require('cors');
    const cron = require('cron');
    require('dotenv').config();

    const routes = require('./routes');
    const db = require('./db');
    const app = express();

    await db.connect();

    app.use(cors());
    app.use(bodyParser.json());

    app.use(...require('./middleware'));

    app.use('/', routes);

    const PORT = process.env.PORT || 8000;
    app.listen(PORT, () => {
        console.log('Started at port ' + PORT)
    })
})()