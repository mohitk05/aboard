const Ticket = require('./../db/models/ticket');

const ticketController = {
    create: async (ticket) => {
        return await Ticket.create({

        });
    }
}

module.exports = ticketController;