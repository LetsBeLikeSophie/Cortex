import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { SHARE_QUEUE_TASK, drainShareQueue } from './shareQueue';

// Must be defined at startup (imported from index.ts), so WorkManager can run
// it with the app closed. Registered by enqueueSharedImages, unregistered
// once the queue is empty.
TaskManager.defineTask(SHARE_QUEUE_TASK, async () => {
  try {
    await drainShareQueue();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
