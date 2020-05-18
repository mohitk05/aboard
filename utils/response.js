const chalk = require('chalk');

const createResponse = async (req, res, response) => {
    const errorHandler = (e) => {
        console.log(chalk.bgRed.white('Something broke here ->'));
        console.log(e);
        res.status(500).send({
            success: false,
            error: 'Something went wrong 😟'
        });
    }
    response.then(resp => {
        res.send({
            success: true,
            data: resp || {}
        });
    }).catch(errorHandler);
}

module.exports = {
    createResponse
}