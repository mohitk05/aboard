const express = require('express');
const router = express.Router();
const { createResponse } = require('./../utils/response');
const generalController = require('./../controllers/general');
const vehicleController = require('./../controllers/vehicle');
const routeController = require('./../controllers/route');
const stopController = require('./../controllers/stop');
const userController = require('./../controllers/user');
const auth = require('./../middleware/auth');
const { USER_ROLES: { ADMIN, PLAYER }, ALL_USER_ROLES } = require('./../utils/constants');

// General
router.get('/', async (req, res) => await createResponse(req, res, generalController.ping()));

// Vehicle
router.get('/vehicle/:id', auth(ALL_USER_ROLES), async (req, res) => await createResponse(req, res, vehicleController.get(req.params.id || [])));
router.post('/vehicle', auth([ADMIN]), async (req, res) => await createResponse(req, res, await vehicleController.create(req.body.vehicle)));
router.put('/vehicle/:id/update-state', auth([ADMIN]), async (req, res) => await createResponse(req, res, await vehicleController.updateState(req.params.id, req.body.state)));

// Stop
router.get('/stop/:id', auth(ALL_USER_ROLES), async (req, res) => await createResponse(req, res, stopController.get(req.params.id || [])));
router.post('/stop', auth([ADMIN]), async (req, res) => await createResponse(req, res, stopController.create(req.body.stop)));

// Route
router.get('/route/:id', auth(ALL_USER_ROLES), async (req, res) => await createResponse(req, res, routeController.getOne(req.params.id, { populate: 1 })));
router.post('/route', auth([ADMIN]), async (req, res) => await createResponse(req, res, routeController.create(req.body.route)));
router.post('/route/autogenerate', auth([ADMIN]), async (req, res) => await createResponse(req, res, await routeController.autogenerateFromStops(req.body.config)));

// User
router.get('/user/:id', auth(ALL_USER_ROLES), async (req, res) => await createResponse(req, res, await userController.getOne(req.params.id)));
router.post('/user', auth([ADMIN]), async (req, res) => await createResponse(req, res, await userController.create(req.body.user)));
router.post('/user/login', async (req, res) => await createResponse(req, res, await userController.login(req.body.user)));
router.post('/user/signup', async (req, res) => await createResponse(req, res, await userController.signup(req.body.user)));

module.exports = router;