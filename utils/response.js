const chalk = require('chalk');

const createResponse = async (req, res, response) => {
    try {
        const resp = await response;
        res.send({
            success: true,
            data: resp || {}
        });
    } catch (e) {
        console.log(chalk.bgRed.white(e));
        res.status(500).send({
            success: false,
            error: 'Something went wrong 😟'
        });
    }
}

module.exports = {
    createResponse
}