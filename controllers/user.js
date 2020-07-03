const User = require('./../db/models/user');
const jwt = require('jsonwebtoken');
const { USER_STATES: { ATSTATION, READYTOGO, ONBOARD }, USER_ROLES: { PLAYER } } = require('./../utils/constants');

const userController = {
    create: async (user) => {
        return await User.create({
            username: user.username,
            email: user.email,
            profile: {
                age: user.profile.age
            },
            password: user.password,
            state: ATSTATION,
            currentStop: user.currentStop,
            role: PLAYER,
            interests: user.interests
        });
    },
    getOne: async (id, options = { populate: 0 }) => {
        return await User.findById(id).then(async user => {
            if (!options.populate) return user;
            user.currentStop = await stopController.getOne(user.currentStop);
            return user;
        })
    },
    getMany: async (ids, query = {}, options = { populate: 0 }) => {
        let users = [];
        if (!ids) ids = [];
        if (typeof ids === 'string') {
            ids = ids.split(',');
        }
        if (ids.length === 0) {
            users = User.find(...query);
        } else {
            users = User.find({
                ...query,
                _id: { $in: ids }
            });
        }

        if (!options.populate) {
            return await users;
        } else {
            return await users.populate('ticket').populate('currentStop').populate('interests');
        }
    },
    assignTicket: async (user, ticket) => {
        return await User.updateOne({ _id: user }, {
            ticket,
            state: READYTOGO
        });
    },
    login: async (user) => {
        return await User.findOne({ email: user.email, password: user.password }).then(async user => {
            const authToken = jwt.sign({
                user: {
                    _id: user._id,
                    username: user.name,
                    email: user.email,
                    role: user.role
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
    },
    getFellowUsers: async (userId) => {
        return await User.findById(userId).populate('interests').then(async user => {
            let fellowUsers;
            if (user.state === ONBOARD) {
                fellowUsers = await User.find({
                    state: ONBOARD,
                    vehicle: user.vehicle,
                    _id: { $ne: userId }
                }).populate('interests');
            } else if (user.state === READYTOGO) {
                fellowUsers = await User.find({
                    state: { $in: [READYTOGO, ATSTATION] },
                    currentStop: user.currentStop,
                    _id: { $ne: userId }
                }).populate('interests');
            } else if (user.state === ATSTATION) {
                fellowUsers = await User.find({
                    state: { $in: [READYTOGO, ATSTATION] },
                    currentStop: user.currentStop,
                    _id: { $ne: userId }
                }).populate('interests');
            }

            const interestFilter = (testUser) => {
                // logic to fuzzy filter users according to interest
                // very simple logic, refine later
                return new Set([...testUser.interests.map(i => i._id.toString()), ...user.interests.map(i => i._id.toString())]).size !== (testUser.interests.length + user.interests.length);
            }

            const ageFilter = (testUser) => {
                // 18 and above to only other 18 and above. 18 below to only 18 below.
                if (user.profile.age < 18) {
                    return testUser.profile.age < 18;
                } else return testUser.profile.age >= 18;
            }

            const score = (testUser) => {
                let score = (((testUser.interests.length + user.interests.length) - new Set([...testUser.interests.map(i => i._id.toString()), ...user.interests.map(i => i._id.toString())]).size) * 200) / (testUser.interests.length + user.interests.length);
                let o = {
                    user: testUser,
                    score
                }
                return o;
            }

            fellowUsers = fellowUsers.filter(ageFilter).filter(interestFilter).map(score);

            return fellowUsers;
        })
    },
    userStateTransitionPermitted: () => {
        return true;
    }
}

module.exports = userController;

const stopController = require('./stop');