const Ticket = require('./../db/models/ticket');
const { USER_STATES } = require('./../utils/constants');

const ticketController = {
    create: async (ticket) => {
        return await Ticket.create({
            from: ticket.from,
            to: ticket.to,
            user: ticket.user,
            trip: ticket.trip
        });
    },
    getOne: async (id, options = { populate: 0 }) => {
        if (!options.populate) {
            return await Ticket.findById(id);
        } else {
            return await Ticket.findById(id).populate('from').populate('to').populate('user').populate('trip');
        }
    },
    getMany: async (ids, query = {}, options = { populate: 0 }) => {
        let tickets;
        if (ids.length === 0) {
            tickets = Ticket.find(query);
        } else {
            tickets = Ticket.find({
                ...query,
                _id: { $in: ids }
            });
        }

        if (!options.populate) {
            return await tickets;
        } else {
            return await tickets.populate('from').populate('to').populate('user').populate('trip');
        }
    },
    buy: async (user, ticket) => {
        const userId = user._id;
        const price = await tripController.getPriceBetweenStops(ticket.trip, ticket.from, ticket.to);
        return await Ticket.create({
            from: ticket.from,
            to: ticket.to,
            user: userId,
            trip: ticket.trip,
            price
        }).then(async (newTicket) => {
            await userController.assignTicket(userId, newTicket._id);
            return newTicket;
        })
    },
    updateDestination: async (user, id, newTo) => {
        return await Ticket.findOne({ _id: id, user }).populate('trip').populate('user').then(async ticket => {
            const stops = (await routeController.getOne(ticket.trip.route)).stops;
            if (stops.indexOf(newTo) === -1 || stops.indexOf(newTo) <= stops.indexOf(ticket.user.currentStop)) return Promise.reject('Not allowed');

            const newToIndex = stops.indexOf(newTo), oldToIndex = stops.indexOf(ticket.to);
            if (newToIndex < oldToIndex) {
                ticket.desiredTo = newTo;
            } else if (newToIndex > oldToIndex) {
                ticket.desiredTo = null;
                ticket.to = newTo;
                const newPrice = await tripController.getPriceBetweenStops(ticket.trip._id, ticket.from, ticket.to);
                ticket.price = newPrice;
                // Deduct diff amount from user's balance
            }

            return await ticket.save();
        });
    }
}

module.exports = ticketController;

const tripController = require('./trip');
const routeController = require('./route');
const userController = require('./user');