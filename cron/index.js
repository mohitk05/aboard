const CronJob = require('cron').CronJob;
const cronController = require('./../controllers/cron');
const { WORLD_INTERVAL } = require('./../utils/constants');

const cronJobs = [
    {
        pattern: `*/${WORLD_INTERVAL} * * * *`,
        handler: () => {
            cronController.updateWorld().catch(console.error);
        }
    }
]

module.exports = () => {
    cronJobs.forEach(cj => {
        const job = new CronJob(cj.pattern, cj.handler);
        job.start();
    })
}