const Conversation = require('./../db/models/conversation');

const conversationController = {
    create: async (conversation) => {
        return await Conversation.create({
            members: conversation.members
        });
    },
    getOne: async (id) => {
        return await Conversation.findById(id);
    },
    getMany: async (ids, query = {}, options = { populate: 0 }) => {
        let conversations;
        if (!ids.length)
            conversations = Conversation.find();
        else
            conversations = Conversation.find({
                ...query,
                _id: { $in: ids }
            });

        if (options.populate)
            return await conversations.populate('members');
        else
            return await conversations;
    }
}

module.exports = conversationController;