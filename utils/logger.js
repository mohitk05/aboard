const chalk = require('chalk');

const logger = {
    log: console.log,
    logRequest: (method, path) => {
        console.log(chalk.bold.green(method) + ' ' + chalk.white(path));
    }
}

module.exports = logger;