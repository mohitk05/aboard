const jwt = require('jsonwebtoken');

module.exports = (roles) => (req, res, next) => {
    let exit = () => {
        res.status(401);
        throw new Error('Unauthorized.');
    };
    try {
        let token = req.header('Authorization');
        if (!token || !token.startsWith('Bearer ')) {
            exit();
        }
        token = token.split(' ')[1];
        jwt.verify(token, process.env.JWT_KEY, (err, decoded) => {
            if (err) return next(err);
            if (!decoded.user || !roles.includes(decoded.user.role)) {
                exit();
            }
            req.locals = {};
            req.locals.user = decoded.user;
            next();
        })
    } catch (e) {
        exit();
    }
}