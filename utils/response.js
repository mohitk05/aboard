const createResponse = async (req, res, response) => {
    try {
        const resp = await response;
        res.send({
            success: true,
            data: resp || {}
        });
    } catch (e) {
        console.error(e.message);
        res.status(500).send({
            success: false,
            error: 'Something went wrong 😟'
        });
    }
}

module.exports = {
    createResponse
}