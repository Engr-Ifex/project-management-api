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

  res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
    }),
  });
};

export default errorHandler;
