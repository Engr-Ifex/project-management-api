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
