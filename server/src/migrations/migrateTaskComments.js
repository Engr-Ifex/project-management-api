import mongoose from 'mongoose';
import dotenv from 'dotenv';
import TaskComment from '../models/TaskComment.js';
import Task from '../models/Task.js';

dotenv.config();

/*
 * Backfill migration for the Phase 10 comment model change.
 *
 * The first (partial) comment implementation stored:
 *   { task, user, content, timestamps }
 *
 * The final model stores:
 *   { task, project, author, content, editedAt, isDeleted, deletedAt, deletedBy, timestamps }
 *
 * This migration, for every existing comment:
 *   1. Moves the legacy `user` reference to `author` and removes `user`.
 *   2. Derives `project` from the owning task.
 *   3. Sets the soft-delete / editedAt defaults.
 *
 * Step 3 is essential: reads filter on `isDeleted: false`, and a missing
 * `isDeleted` field does NOT match that filter, so legacy comments would
 * silently disappear from the API without it.
 *
 * Raw collection access is used so Mongoose defaults do not hide the legacy
 * `user` field or the missing fields we need to detect.
 */
const migrateTaskComments = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('Connected to MongoDB');

    const comments = await TaskComment.collection.find({}).toArray();

    console.log(`Found ${comments.length} task comments`);

    let updatedComments = 0;
    let skippedComments = 0;

    for (const comment of comments) {
      const set = {};
      const unset = {};

      // 1. author <- legacy `user` field
      const author = comment.author ?? comment.user;

      if (!author) {
        console.warn(`Skipping comment ${comment._id}: no author/user reference`);
        skippedComments++;
        continue;
      }

      if (!comment.author) {
        set.author = author;
      }

      if (comment.user !== undefined) {
        unset.user = '';
      }

      // 2. project <- owning task's project
      if (!comment.project) {
        const task = await Task.collection.findOne(
          { _id: comment.task },
          { projection: { project: 1 } }
        );

        if (!task?.project) {
          console.warn(
            `Skipping comment ${comment._id}: owning task ${comment.task} has no project`
          );
          skippedComments++;
          continue;
        }

        set.project = task.project;
      }

      // 3. soft-delete + editedAt defaults
      if (comment.isDeleted === undefined) {
        set.isDeleted = false;
      }

      if (comment.editedAt === undefined) {
        set.editedAt = null;
      }

      if (comment.deletedAt === undefined) {
        set.deletedAt = null;
      }

      if (comment.deletedBy === undefined) {
        set.deletedBy = null;
      }

      const update = {};

      if (Object.keys(set).length > 0) {
        update.$set = set;
      }

      if (Object.keys(unset).length > 0) {
        update.$unset = unset;
      }

      if (Object.keys(update).length === 0) {
        console.log(`Comment ${comment._id} already up to date`);
        continue;
      }

      await TaskComment.collection.updateOne({ _id: comment._id }, update);

      updatedComments++;

      console.log(`Updated comment: ${comment._id}`);
    }

    console.log(`Migration complete. Updated ${updatedComments}, skipped ${skippedComments}.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

migrateTaskComments();
