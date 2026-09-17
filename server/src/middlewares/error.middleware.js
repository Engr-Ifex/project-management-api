import logger from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || [];

  /*
   * Mongoose CastError.
   *
   * Thrown when a route/query value cannot be cast to the expected type,
   * most commonly a malformed ObjectId. Without this mapping it would
   * surface as an unhelpful 500 Internal Server Error.
   */
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for "${err.path}"`;
    errors = [{ field: err.path, message }];
  }

  /*
   * Mongoose ValidationError.
   *
   * Thrown by `save()` / `create()` when a document breaks a schema rule
   * (required, minlength, maxlength, enum, match, custom validators). The
   * request payload is at fault, not the server, so this belongs at 400
   * instead of surfacing as an opaque 500.
   *
   * `err.errors` is an object keyed by path rather than the array shape the
   * API returns, so it is normalised here. The generic message mirrors the
   * Zod path in validate.middleware.js, with the per-field detail carried in
   * `errors` so both validation sources look identical to clients.
   *
   * The object key is used rather than `issue.path` because for a nested
   * subdocument the key is the fully-qualified path (`storage.key`) while
   * `issue.path` only holds the leaf (`key`).
   */
  if (err.name === 'ValidationError') {
    const fieldErrors = Object.entries(err.errors ?? {}).map(([field, issue]) => ({
      field: field || issue.path,
      message: issue.message,
    }));

    statusCode = 400;
    message = 'Validation failed';
    errors = fieldErrors;
  }

  /*
   * JSON Web Token errors.
   *
   * `jwt.verify` throws for a malformed token, a bad signature, an expired
   * token and a not-yet-valid token. None of those carry a statusCode, so
   * before this mapping they surfaced as HTTP 500 — an unauthenticated client
   * could not distinguish "your session expired, please log in again" from a
   * server fault, and every expired token produced a 5xx in the logs.
   *
   * All of them are authentication failures: 401. The library's own message is
   * replaced so the response never describes why verification failed.
   */
  if (
    err.name === 'JsonWebTokenError' ||
    err.name === 'TokenExpiredError' ||
    err.name === 'NotBeforeError'
  ) {
    statusCode = 401;
    message =
      err.name === 'TokenExpiredError' ? 'Access token has expired' : 'Invalid access token';
    errors = [];
  }

  /*
   * MongoDB duplicate key error (unique index violation).
   *
   * The unique indexes on the models are the real guarantee; service-level
   * pre-checks only narrow the window. This maps a raced insert/update onto
   * a meaningful 409 instead of a 500.
   */
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0];

    statusCode = 409;
    message = field
      ? `A record with this ${field} already exists`
      : 'A record with these values already exists';
    errors = field ? [{ field, message }] : [];
  }

  /*
   * Multer upload errors.
   *
   * Multer signals size/count/field violations through `MulterError`. Without
   * this mapping an oversized upload would surface as an opaque 500; it is a
   * client input problem and belongs at 400. Rejections thrown by the file
   * filters are already ApiErrors and are handled by the statusCode branch
   * above, so only genuine MulterError instances are translated here.
   */
  if (err.name === 'MulterError') {
    const messages = {
      LIMIT_FILE_SIZE: 'Uploaded file exceeds the maximum allowed size',
      LIMIT_FILE_COUNT: 'Too many files uploaded',
      LIMIT_UNEXPECTED_FILE: `Unexpected file field "${err.field}"`,
      LIMIT_PART_COUNT: 'Too many parts in the upload',
      LIMIT_FIELD_KEY: 'Upload field name is too long',
      LIMIT_FIELD_VALUE: 'Upload field value is too long',
      LIMIT_FIELD_COUNT: 'Too many upload fields',
    };

    statusCode = 400;
    message = messages[err.code] || 'File upload failed';
    errors = [{ field: err.field || 'file', message }];
  }

  /*
   * Log the failure.
   *
   * 5xx means something is wrong with us, so it is logged at `error` with the
   * stack. 4xx is the client's problem and is expected traffic, so it is
   * logged at `warn` without a stack — otherwise ordinary validation failures
   * would drown out real faults.
   *
   * The request body is deliberately not logged: it routinely contains
   * passwords on the auth routes.
   */
  const requestContext = {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    ...(req.user?._id && { userId: req.user._id.toString() }),
  };

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} failed`, {
      ...requestContext,
      error: err,
    });
  } else {
    logger.warn(`${req.method} ${req.originalUrl} rejected`, requestContext);
  }

  res.status(statusCode).json({
    success: false,
    /*
     * `statusCode` mirrors the success envelope. It was previously omitted, so
     * a client reading `body.statusCode` got a value on success and
     * `undefined` on every error — an asymmetry with no upside.
     */
    statusCode,
    message,
    errors,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
    }),
  });
};

export default errorHandler;
