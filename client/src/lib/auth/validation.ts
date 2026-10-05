/*
 * Client-side validation for the two credential forms.
 *
 * These rules are a **mirror** of `server/src/validators/auth.validator.js`, not
 * a second opinion. The messages are the server's own strings, so a field reads
 * identically whether it was rejected here or by the API. A form that says one
 * thing and then says something different once the server answers has taught the
 * user that its messages cannot be trusted.
 *
 * The server remains the authority. This exists to answer instantly and without
 * a round trip — not to decide. Anything the API rejects that is not modelled
 * here still surfaces through the server's own `errors[]` array.
 */

/**
 * Mirrors zod's `.email()` closely enough to catch what people actually type.
 *
 * Deliberately not a full RFC 5322 matcher: those are unreadable, still wrong,
 * and the server validates the real thing anyway. This rejects the shapes a
 * person reaches by accident — no `@`, no domain, a trailing space.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
 * The server runs `.trim()` on `name` *before* checking its length, so the
 * client has to trim too. Without it, "  a  " passes here and is rejected there.
 */
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;

/** Mirrors `MIN_PASSWORD_LENGTH` in `server/src/constants/security.js`. */
const PASSWORD_MIN_LENGTH = 8;

export type FieldErrors = Record<string, string>;

/** Registration only. The API's sole password rule is a minimum of 8. */
export const nameError = (value: string): string | undefined => {
  const trimmed = value.trim();

  if (!trimmed) return 'Name is required';
  if (trimmed.length < NAME_MIN_LENGTH) {
    return `Name must be at least ${NAME_MIN_LENGTH} characters`;
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return `Name cannot exceed ${NAME_MAX_LENGTH} characters`;
  }

  return undefined;
};

export const emailError = (value: string): string | undefined => {
  const trimmed = value.trim();

  if (!trimmed) return 'Email is required';
  if (!EMAIL_PATTERN.test(trimmed)) return 'Please provide a valid email address';

  return undefined;
};

/** Registration. Length is the rule the API enforces, and the only one stated. */
export const newPasswordError = (value: string): string | undefined => {
  if (!value) return 'Password is required';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }

  return undefined;
};

/**
 * Login. Deliberately **not** the registration rule.
 *
 * The API asks only that the field is non-empty (`z.string().min(1)`), so
 * applying the 8-character minimum here would refuse a request the server would
 * have accepted. It would also answer a question about the stored password that
 * the login endpoint is careful not to answer.
 */
export const existingPasswordError = (value: string): string | undefined =>
  value ? undefined : 'Password is required';

export const validateLogin = (values: { email: string; password: string }): FieldErrors => {
  const errors: FieldErrors = {};

  const email = emailError(values.email);
  const password = existingPasswordError(values.password);

  if (email) errors.email = email;
  if (password) errors.password = password;

  return errors;
};

export const validateRegister = (values: {
  name: string;
  email: string;
  password: string;
}): FieldErrors => {
  const errors: FieldErrors = {};

  const name = nameError(values.name);
  const email = emailError(values.email);
  const password = newPasswordError(values.password);

  if (name) errors.name = name;
  if (email) errors.email = email;
  if (password) errors.password = password;

  return errors;
};

export const hasErrors = (errors: FieldErrors): boolean => Object.keys(errors).length > 0;
