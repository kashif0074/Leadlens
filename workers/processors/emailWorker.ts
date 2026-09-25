import { Worker } from 'bullmq';
import { connection } from '../connection';

const worker = new Worker(
  'email-sending',
  async (job) => {
    console.log('Processing job:', job.data);
    return { status: 'sent' };
  },
  { connection }
);

worker.on('completed', (job) => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.log(`Job ${job?.id} failed:`, err.message));