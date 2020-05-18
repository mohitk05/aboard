const constants = {
    WORLD_INTERVAL: 5, // in minutes
    VEHICLE_STATES: {
        MOVING: 'MOVING',
        STATIONARY: 'STATIONARY',
        IDLE: 'IDLE'
    },
    USER_STATES: {
        ATSTATION: 'ATSTATION',
        READYTOGO: 'READYTOGO',
        ONBOARD: 'ONBOARD'
    },
    USER_ROLES: {
        ADMIN: 1,
        PLAYER: 2
    }
}

module.exports = { ...constants, ALL_USER_ROLES: Object.values(constants.USER_ROLES) };