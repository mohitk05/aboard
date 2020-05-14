const User = require('./../db/models/user');
const jwt = require('jsonwebtoken');
const { USER_STATES: { ATSTATION, READYTOGO, ONBOARD }, USER_ROLES: { PLAYER } } = require('./../utils/constants');
const stopController = require('./stop');

const userController = {
    create: async (user) => {
        return await User.create({
            username: user.username,
            email: user.email,
            password: user.password,
            state: ATSTATION,
            currentStop: user.currentStop,
            role: PLAYER
        });
    },
    getOne: async (id, options = { populate: 0 }) => {
        return await User.findById(id).then(async user => {
            if (!options.populate) return user;
            user.currentStop = await stopController.getOne(user.currentStop);
            return user;
        })
    },
    getMany: async (ids, options = { populate: 0 }) => {
        let users = [];
        if (!ids) ids = [];
        if (typeof ids === 'string') {
            ids = ids.split(',');
        }
        if (ids.length === 0) {
            users = await User.find();
        } else {
            users = await User.find({
                _id: { $in: ids }
            });
        }

        if (!options.populate) {
            return users;
        } else {
            for (let i = 0; i < users.length; i++) {
                let user = users[i]._doc;
                user.stops = await stopController.get(user.stops);
            }
            return users;
        }
    },
    getByEmail: async (email, options = { populate: 0 }) => {
        return await User.findOne({ email }).then(async user => {
            if (!options.populate) return user;
            return await userController.populate(user);
        })
    },
    populate: async (user) => {
        return await stopController.getOne(user.currentStop).then(stop => {
            user.currentStop = stop;
            return user;
        });
    },
    login: async (user) => {
        return await User.findOne({ email: user.email, password: user.password }).then(async user => {
            const authToken = jwt.sign({
                user: {
                    _id: user._id,
                    username: user.name,
                    email: user.email
                }
            }, process.env.JWT_KEY)
            return {
                authToken,
                user
            }
        })
    },
    signup: async (user) => {
        return await userController.create(user).then(async user => {
            return await userController.login(user);
        })
    }
}

module.exports = userController;