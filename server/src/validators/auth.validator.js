import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name cannot exceed 100 characters'),

    email: z
      .email('Please provide a valid email address')
      .transform((email) => email.toLowerCase()),

    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),

  params: z.object({}),

  query: z.object({}),
});

export const loginSchema = z.object({
  body: z.object({
    email: z
      .email('Please provide a valid email address')
      .transform((email) => email.toLowerCase()),

    password: z.string().min(1, 'Password is required'),
  }),

  params: z.object({}),

  query: z.object({}),
});

/*
 * ---------------------------------------------------------------------------
 * Account recovery
 * ---------------------------------------------------------------------------
 */

/*
 * The token is only checked for presence here, not for shape.
 *
 * Rejecting a malformed token at the validator would answer "that is not a
 * token" and "that token does not exist" with different responses, which tells a
 * caller whether a string was ever issued. Every invalid token — wrong length,
 * wrong alphabet, never existed, already spent — has to travel the same path to
 * the same message, so shape validation happens implicitly, by failing to match
 * a digest.
 *
 * The upper bound is the exception: an unbounded string is a cheap way to make
 * the server hash a megabyte per request, so it is capped well above any real
 * token (64 hex characters) without being informative about the format.
 */
const tokenField = z.string().min(1, 'A token is required').max(512, 'That token is not valid');

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z
      .email('Please provide a valid email address')
      .transform((email) => email.toLowerCase()),
  }),

  params: z.object({}),

  query: z.object({}),
});

/*
 * Reset password.
 *
 * The password rule is the registration rule — a minimum of 8 — deliberately
 * mirrored rather than imported, because a reset that accepted a weaker password
 * than registration would be a way to downgrade an account's credential.
 *
 * There is no `confirmPassword`. The two-field confirmation is a client-side
 * affordance against typos; the API has never required it for registration
 * either, and adding it here would make the two password-setting endpoints
 * disagree about their own contract.
 */
export const resetPasswordSchema = z.object({
  body: z.object({
    token: tokenField,

    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),

  params: z.object({}),

  query: z.object({}),
});
