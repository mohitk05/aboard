const express = require('express');
const router = express.Router();
const { createResponse } = require('./../utils/response');
const generalController = require('./../controllers/general');
const vehicleController = require('./../controllers/vehicle');
const routeController = require('./../controllers/route');
const stopController = require('./../controllers/stop');

// General
router.get('/', async (req, res) => await createResponse(req, res, generalController.ping()));

// Vehicle
router.get('/vehicle/:id', async (req, res) => await createResponse(req, res, vehicleController.get(req.params.id || [])));
router.post('/vehicle', async (req, res) => await createResponse(req, res, await vehicleController.create(req.body.vehicle)));

// Stop
router.get('/stop/:id', async (req, res) => await createResponse(req, res, stopController.get(req.params.id || [])));
router.post('/stop', async (req, res) => await createResponse(req, res, stopController.create(req.body.stop)));

// Route
router.get('/route/:id', async (req, res) => await createResponse(req, res, routeController.get(req.params.id || [], { stops: 1 })));
router.post('/route', async (req, res) => await createResponse(req, res, routeController.create(req.body.route)));
router.post('/route/autogenerate', async (req, res) => await createResponse(req, res, await routeController.autogenerateFromStops(req.body.config)));
// User
router.get('/user/:id', async (req, res) => await createResponse(req, res, userController.get(req.params.id || [])));
router.post('/user', async (req, res) => await createResponse(req, res, userController.create(req.body.user)));

module.exports = router;