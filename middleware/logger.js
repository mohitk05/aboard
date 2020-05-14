const { logRequest } = require('./../utils/logger');
module.exports = (req, res, next) => {
    if (process.env.NODE_ENV === 'PRODUCTION') return next();
    logRequest(req.method, req.path);
    next();
}