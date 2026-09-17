import ApiError from '../utils/ApiError.js';

/*
 * Request validation.
 *
 * A failure is raised as an `ApiError` rather than being written to the
 * response here. Previously this middleware built its own 400 body, which
 * meant two different pieces of code decided what an error looks like — and
 * they had already drifted: this one omitted `statusCode` while the central
 * handler included it. Passing the error on keeps a single formatter (and
 * means validation failures are logged with every other rejection).
 */
const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return next(new ApiError(400, 'Validation failed', errors));
    }

    if (result.data.body) {
      req.body = result.data.body;
    }

    if (result.data.params) {
      Object.assign(req.params, result.data.params);
    }

    /*
     * Express 5 exposes `req.query` through a getter that re-parses the URL
     * on every access, so mutating it has no effect. The parsed and coerced
     * query is therefore exposed on `req.validatedQuery` instead, and
     * controllers read from there.
     */
    if (result.data.query) {
      req.validatedQuery = result.data.query;
    }

    next();
  };
};

export default validate;
