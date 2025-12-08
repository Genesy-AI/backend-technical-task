import { NativeConnection, Worker } from '@temporalio/worker'
import * as activities from './workflows/activities'

export async function runTemporalWorker() {
  const connection = await NativeConnection.connect({
    address: 'localhost:7233',
  })
  try {
    const worker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'myQueue',
      workflowsPath: require.resolve('./workflows'),
      activities,
      maxConcurrentActivityTaskExecutions: 10,
      maxConcurrentWorkflowTaskExecutions: 100,
      // not the best option?
      // maxActivitiesPerSecond: 1
    })

    await worker.run()
  } finally {
    await connection.close()
  }
}
