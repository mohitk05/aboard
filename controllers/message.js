const Message = require('./../db/models/message');

const messageController = {
    create: async (message) => {
        return await Message.create({
            from: message.from,
            conversation: message.conversation,
            content: message.content
        });
    },
    getOne: async (id) => {
        return await Message.findById(id);
    },
    getMany: async (ids, query) => {
        if (!ids.length)
            return await Message.find();
        else
            return await Message.find({
                ...query,
                _id: { $in: ids }
            });
    }
}

module.exports = messageController;