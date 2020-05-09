const chalk = require('chalk');
const log = console.log;

module.exports = (req, res, next) => {
    if (process.env.NODE_ENV === 'PRODUCTION') return next();
    log(chalk.bold.green(req.method) + ' ' + chalk.white(req.path));
    next();
}