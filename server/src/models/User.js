import env from '../config/env.js';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { EMAIL_REGEX } from '../constants/regex.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters long'],
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    avatar: {
      type: String,
      default: null,
    },
    settings: {
      emailNotifications: {
        type: Boolean,
        default: true,
      },

      marketingEmails: {
        type: Boolean,
        default: false,
      },
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    /*
     * When the password last changed. Used to reject access tokens that were
     * issued before a password change, since stateless JWTs cannot otherwise
     * be revoked. Null for accounts that have never changed their password.
     */
    passwordChangedAt: {
      type: Date,
      default: null,
    },

    /* ------------------------------------------------------------- email */

    /*
     * Outstanding password-reset token.
     *
     * Only the SHA-256 digest is stored — never the token that was emailed — so
     * a leak of this collection cannot be turned into working links. See
     * `src/utils/emailTokens.js` for why a fast digest is the right choice here
     * and bcrypt is not.
     *
     * `select: false` matches the treatment of `password`: the field exists on
     * the document but is not returned by a query unless asked for. Nothing in
     * the application ever needs to read it back — the lookup is by hash and
     * consumption clears it — so the flag costs nothing and removes the field
     * from every accidental projection.
     *
     * `expiresAt` is deliberately *not* hidden: it is not sensitive, and the
     * reset flow reads it to distinguish "expired" from "never issued", which
     * are different messages to the user.
     */
    passwordResetToken: {
      hash: {
        type: String,
        default: null,
        select: false,
      },

      expiresAt: {
        type: Date,
        default: null,
      },

      requestedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,

    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;

        /*
         * Defence in depth. `password` is `select: false`, but a query that
         * explicitly asks for it (login, change-password) returns a document
         * whose hash would otherwise be serialised if it were ever sent
         * directly instead of through `sanitizeUser`.
         */
        delete ret.password;

        /*
         * Same reasoning for the reset token digest. It is `select: false` and
         * `sanitizeUser` does not name it, so this should never have anything to
         * remove — which is exactly why it belongs here: a
         * `select('+passwordResetToken.hash')` added later would otherwise be
         * one careless `res.json(user)` away from shipping a reset digest to a
         * client.
         */
        delete ret.passwordResetToken?.hash;

        return ret;
      },
    },
  }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, Number(env.bcryptSaltRounds));

  /*
   * Stamp the change time so tokens issued earlier stop being accepted.
   * Skipped on creation: a brand-new account should not invalidate the token
   * it is about to receive.
   */
  if (!this.isNew) {
    this.passwordChangedAt = new Date();
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      userId: this._id,
      role: this.role,
    },
    env.jwtAccessSecret,
    {
      expiresIn: env.jwtAccessExpiresIn,
    }
  );
};

// ====================
// Static Methods
// ====================

// Find an active user by ID
userSchema.statics.findActiveById = function (id) {
  return this.findOne({
    _id: id,
    isDeleted: false,
  });
};

// Find an active user by email
userSchema.statics.findActiveByEmail = function (email) {
  return this.findOne({
    email,
    isDeleted: false,
  });
};

const User = mongoose.model('User', userSchema);
export default User;
