import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/*
 * Drop the single-field indexes that duplicate the prefix of a compound index.
 *
 * Removing the declaration from a schema does NOT remove the index from an
 * existing database — Mongoose only creates. So the twelve indexes below are
 * still present in any database that has been running, costing a write on every
 * insert and update while serving no query the compound index cannot.
 *
 * Each one is a prefix of a compound index on the same collection, which is
 * what makes it redundant rather than merely unused: if `{a: 1, b: 1}` exists,
 * `{a: 1}` can never be the better choice for any query, because the compound
 * index has the same leading key and can serve everything the single-field one
 * can.
 *
 *   collection        dropped                 still served by
 *   workspaces        { owner: 1 }            { owner: 1, isArchived: 1 }
 *   projects          { workspace: 1 }        { workspace: 1, isArchived: 1 }
 *   tasks             { project: 1 }          { project: 1, isArchived: 1, position: 1 }
 *   taskcomments      { task: 1 }             { task: 1, isDeleted: 1, createdAt: 1 }
 *   taskcomments      { project: 1 }          { project: 1, isDeleted: 1 }
 *   taskcomments      { author: 1 }           { author: 1, isDeleted: 1 }
 *   attachments       { project: 1 }          { project: 1, createdAt: -1 }
 *   attachments       { task: 1 }             { task: 1, createdAt: -1 }
 *   attachments       { comment: 1 }          { comment: 1, createdAt: -1 }
 *   notifications     { recipient: 1 }        { recipient: 1, isRead: 1, createdAt: -1 }
 *   labels            { project: 1 }          { project: 1, name: 1 }
 *   projectactivities { project: 1 }          { project: 1, createdAt: -1 }
 *
 * Deliberately NOT dropped: `{ isArchived: 1 }` on workspaces, projects and
 * tasks, `{ isDeleted: 1 }` on taskcomments, `{ isRead: 1 }` on notifications,
 * `{ uploader: 1 }` on attachments, and `{ workspace: 1 }` on projectactivities.
 * None of them is a prefix of a compound index, so redundancy cannot be proved
 * from the index definitions alone — deciding they are unused would require
 * query-plan analysis against a real database, which has not been done.
 *
 * Idempotent: a missing index is reported and skipped, so re-running is safe.
 */

const REDUNDANT_INDEXES = [
  { collection: 'workspaces', index: 'owner_1' },
  { collection: 'projects', index: 'workspace_1' },
  { collection: 'tasks', index: 'project_1' },
  { collection: 'taskcomments', index: 'task_1' },
  { collection: 'taskcomments', index: 'project_1' },
  { collection: 'taskcomments', index: 'author_1' },
  { collection: 'attachments', index: 'project_1' },
  { collection: 'attachments', index: 'task_1' },
  { collection: 'attachments', index: 'comment_1' },
  { collection: 'notifications', index: 'recipient_1' },
  { collection: 'labels', index: 'project_1' },
  { collection: 'projectactivities', index: 'project_1' },
];

const dropRedundantIndexes = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error(
        'MONGODB_URI is not set. Migrations connect directly and do not use the application config.'
      );
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log('Connected to MongoDB');

    let dropped = 0;
    let missing = 0;

    for (const { collection, index } of REDUNDANT_INDEXES) {
      try {
        await mongoose.connection.db.collection(collection).dropIndex(index);

        console.log(`Dropped ${collection}.${index}`);

        dropped++;
      } catch (error) {
        /*
         * IndexNotFound (27) means it is already gone — the desired end state,
         * so a re-run is a no-op rather than a failure.
         */
        if (error.code === 27 || error.codeName === 'IndexNotFound') {
          console.log(`Skipped ${collection}.${index} (not present)`);

          missing++;

          continue;
        }

        throw error;
      }
    }

    console.log(`Migration complete. Dropped ${dropped}, skipped ${missing}.`);
  } catch (error) {
    console.error('Migration failed:', error);

    // A failed migration must exit non-zero so a deploy script notices.
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

dropRedundantIndexes();
