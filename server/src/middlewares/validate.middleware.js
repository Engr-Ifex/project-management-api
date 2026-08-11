const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    if (result.data.body) {
      req.body = result.data.body;
    }

    if (result.data.params) {
      Object.assign(req.params, result.data.params);
    }

    if (result.data.query) {
      Object.assign(req.query, result.data.query);
    }

    next();
  };
};

export default validate;