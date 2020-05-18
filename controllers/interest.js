const Interest = require('./../db/models/interest');

const interestController = {
    create: async (interest) => {
        return await Interest.create({
            name: interest.name,
            description: interest.description,
            image: interest.image
        });
    },
    getOne: async (id) => {
        return await Interest.findById(id);
    },
    getMany: async (ids, query) => {
        if (!ids.length)
            return await Interest.find();
        else
            return await Interest.find({
                ...query,
                _id: { $in: ids }
            });
    }
}

module.exports = interestController;