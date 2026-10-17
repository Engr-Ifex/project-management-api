import mongoose from 'mongoose';
import dotenv from 'dotenv';

import User from '../models/User.js';

dotenv.config();

/*
 * Remove the email-verification fields left behind by the previous version.
 *
 * ## This migration is OPTIONAL
 *
 * The application works correctly without it, and **running it is a tidy-up, not
 * a fix.** Mongoose ignores document paths its schema no longer declares, so a
 * leftover `isVerified` or `verificationToken` is inert: it is not read, not
 * written, and not serialised. `tests/auth-email.test.js` writes exactly that
 * shape into a real document and proves login, workspace creation and the API
 * response are all unaffected.
 *
 * So there is no compatibility reason to run this, and no reason to hurry. Run
 * it when you want the stored documents to match the schema.
 *
 * ## What it does, and what it does not
 *
 * It removes two fields and nothing else:
 *
 *   isVerified         — a boolean the schema no longer declares
 *   verificationToken  — a subdocument the schema no longer declares
 *
 * It does **not** touch users, passwords, sessions, workspaces, memberships, or
 * the `passwordResetToken` subdocument. Nothing needs to be re-registered and
 * nobody is logged out: the fields being removed are not consulted by any code
 * path, so deleting them cannot change any behaviour.
 *
 * ## Reversibility
 *
 * `$unset` cannot be undone. The data being removed is the state of a feature
 * that no longer exists, so there is nothing to restore *to* — but if you want
 * the option, take a backup first:
 *
 *   mongodump --uri="$MONGODB_URI" --collection=users --out=./backup-before-cleanup
 *
 * ## Running it
 *
 *   npm run migrate:remove-verification-fields
 *
 * Idempotent: the filter matches only documents that still have the fields, so a
 * second run reports nothing to do.
 */

const migrateRemoveVerificationFields = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error(
        'MONGODB_URI is not set. Migrations connect directly and do not use the application config.'
      );
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log('Connected to MongoDB');

    const users = User.collection;

    /*
     * The raw collection, not `User.find({})`.
     *
     * Hydrating through the schema would drop these paths on load, so the filter
     * below would match nothing and the migration would report "nothing to do"
     * against a database full of leftover fields.
     */
    const filter = {
      $or: [{ isVerified: { $exists: true } }, { verificationToken: { $exists: true } }],
    };

    const total = await users.countDocuments({});
    const affected = await users.countDocuments(filter);

    console.log(`Found ${total} users, ${affected} still carrying email-verification fields`);

    if (affected === 0) {
      console.log('Nothing to do: no document carries the removed fields.');

      return;
    }

    const result = await users.updateMany(filter, {
      $unset: { isVerified: '', verificationToken: '' },
    });

    console.log(
      `Migration complete. Cleaned ${result.modifiedCount} document(s). ` +
        'No user, credential or membership was touched.'
    );
  } catch (error) {
    console.error('Migration failed:', error);

    /*
     * A migration that fails MUST exit non-zero, so a deploy script or CI sees
     * the failure instead of carrying on against a half-migrated database.
     */
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

migrateRemoveVerificationFields();
