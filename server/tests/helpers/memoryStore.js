import mongoose from 'mongoose';

/*
 * In-memory data layer for the test suite.
 *
 * WHY THIS EXISTS
 * ---------------
 * The suite is designed to run against a throwaway MongoDB
 * (`mongodb-memory-server`, or a real instance via `MONGODB_URI_TEST`). The
 * environment this was authored in had a completely full disk, so the mongod
 * binary could not be downloaded and no local server was reachable.
 *
 * Rather than ship an unrunnable suite, the data layer is swappable:
 *
 *   - `MONGODB_URI_TEST` set  -> real Mongoose against a real database
 *   - otherwise               -> this module
 *
 * WHAT IS REAL vs FAKED
 * ---------------------
 * Real:  schemas, defaults, casting, `validate()`, `toObject()`, document
 *        methods, and the pre-save hooks (invoked through the schema's own hook
 *        runner, so password hashing is genuinely exercised).
 * Faked: the query transport only — `find` / `findOne` / `create` / `save` /
 *        `countDocuments` / `updateMany` / `deleteMany` / `exists` /
 *        `aggregate`, evaluated in process.
 *
 * The trade-off is that index behaviour, real query-planning and driver-level
 * casting are not covered. Running the same suite with `MONGODB_URI_TEST` set
 * closes that gap.
 */

const registry = new Map();

/* ------------------------------------------------------------------ *
 * Value helpers
 * ------------------------------------------------------------------ */

const isNullish = (value) => value === null || value === undefined;

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') return false;

  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
};

/** Class instances (Date, ObjectId, RegExp) are values, not operator objects. */
const isOperatorObject = (value) =>
  isPlainObject(value) && Object.keys(value).some((key) => key.startsWith('$'));

const looseEq = (a, b) => {
  if (isNullish(a) && isNullish(b)) return true;
  if (isNullish(a) || isNullish(b)) return false;
  if (a instanceof Date || b instanceof Date)
    return new Date(a).getTime() === new Date(b).getTime();

  if (a instanceof mongoose.Types.ObjectId || b instanceof mongoose.Types.ObjectId) {
    return String(a) === String(b);
  }

  return a === b;
};

const toComparable = (value) => (value instanceof Date ? value.getTime() : value);

const compareValues = (a, b) => {
  const av = toComparable(a);
  const bv = toComparable(b);

  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  if (av instanceof Date || bv instanceof Date) return new Date(av) - new Date(bv);
  if (av < bv) return -1;
  if (av > bv) return 1;

  return 0;
};

/**
 * Every value reachable at a (possibly dotted) path, expanding arrays the way
 * MongoDB does for `{'members.user': id}`.
 */
const getPathValues = (doc, path) => {
  let current = [doc];

  for (const part of path.split('.')) {
    const next = [];

    for (const item of current) {
      if (isNullish(item)) continue;

      if (Array.isArray(item)) {
        for (const element of item) {
          if (!isNullish(element) && element[part] !== undefined) next.push(element[part]);
        }
      } else if (item[part] !== undefined) {
        next.push(item[part]);
      }
    }

    current = next;
  }

  return current;
};

/* ------------------------------------------------------------------ *
 * Filter evaluation
 * ------------------------------------------------------------------ */

const matchesCondition = (value, condition) => {
  if (condition instanceof RegExp) {
    return typeof value === 'string' && condition.test(value);
  }

  if (isOperatorObject(condition)) {
    return Object.entries(condition).every(([operator, operand]) => {
      switch (operator) {
        case '$in': {
          const list = Array.isArray(operand) ? operand : [];
          const values = Array.isArray(value) ? value : [value];

          return values.some((item) => list.some((candidate) => looseEq(candidate, item)));
        }
        case '$nin': {
          const list = Array.isArray(operand) ? operand : [];
          const values = Array.isArray(value) ? value : [value];

          return !values.some((item) => list.some((candidate) => looseEq(candidate, item)));
        }
        case '$all': {
          const required = Array.isArray(operand) ? operand : [];
          const values = Array.isArray(value) ? value : [];

          return required.every((candidate) => values.some((item) => looseEq(candidate, item)));
        }
        case '$ne':
          return !looseEq(value, operand);
        case '$eq':
          return looseEq(value, operand);
        case '$gt':
          return !isNullish(value) && compareValues(value, operand) > 0;
        case '$gte':
          return !isNullish(value) && compareValues(value, operand) >= 0;
        case '$lt':
          return !isNullish(value) && compareValues(value, operand) < 0;
        case '$lte':
          return !isNullish(value) && compareValues(value, operand) <= 0;
        case '$exists':
          return operand ? !isNullish(value) : isNullish(value);
        default:
          throw new Error(`MemoryStore: unsupported operator ${operator}`);
      }
    });
  }

  return looseEq(value, condition);
};

const matchesFilter = (doc, filter) =>
  Object.entries(filter ?? {}).every(([key, condition]) => {
    if (key === '$or') return condition.some((sub) => matchesFilter(doc, sub));
    if (key === '$and') return condition.every((sub) => matchesFilter(doc, sub));

    const values = getPathValues(doc, key);

    // A missing field behaves as null in MongoDB, which matters for
    // `{ assignee: null }` style filters.
    if (values.length === 0) values.push(undefined);

    return values.some((value) => matchesCondition(value, condition));
  });

/* ------------------------------------------------------------------ *
 * Sorting
 * ------------------------------------------------------------------ */

const compareBySort = (sort) => (a, b) => {
  for (const [field, direction] of Object.entries(sort)) {
    const av = getPathValues(a, field)[0];
    const bv = getPathValues(b, field)[0];

    // Missing values sort last regardless of direction.
    if (isNullish(av) && isNullish(bv)) continue;
    if (isNullish(av)) return 1;
    if (isNullish(bv)) return -1;

    const result = compareValues(av, bv);

    if (result !== 0) return result * direction;
  }

  return 0;
};

/* ------------------------------------------------------------------ *
 * Populate
 * ------------------------------------------------------------------ */

const applySelect = (doc, select, Model) => {
  /*
   * Mongoose applies the schema's own projection first: a path declared
   * `select: false` (the password hash) is absent unless explicitly requested
   * with `+field`.
   */
  const projected = { ...doc };

  if (Model) {
    for (const [path, schemaType] of Object.entries(Model.schema.paths)) {
      if (schemaType.options?.select === false) delete projected[path];
    }
  }

  if (!select) return projected;

  const tokens = String(select)
    .split(/\s+/)
    .map((field) => field.trim())
    .filter(Boolean);

  if (tokens.length === 0) return projected;

  const additions = tokens.filter((field) => field.startsWith('+')).map((field) => field.slice(1));
  const inclusive = tokens.filter((field) => !field.startsWith('+') && !field.startsWith('-'));

  /*
   * A selection made up only of `+field` additions is ADDITIVE: the document
   * keeps every default field and simply regains the requested ones.
   *
   * Treating it as an inclusive projection (as this helper originally did)
   * dropped every other field, so a later `save()` persisted a user that had
   * lost its email and name.
   */
  if (inclusive.length === 0) {
    for (const field of additions) projected[field] = doc[field];

    return projected;
  }

  const picked = { _id: doc._id };

  for (const field of [...inclusive, ...additions]) picked[field] = doc[field];

  return picked;
};

const findRefModel = (Model, path) => {
  const schemaPath = Model.schema.path(path);
  const ref = schemaPath?.options?.ref;

  return ref ? mongoose.models[ref] : null;
};

const populateOne = (rawDoc, path, select) => {
  const RefModel = findRefModel(registry.get(rawDoc.__modelName)?.Model, path);

  if (!RefModel) return;

  const id = rawDoc[path];
  const target = registry.get(RefModel.modelName);
  const referenced = target?.docs.find((candidate) => looseEq(candidate._id, id));

  rawDoc[path] = referenced ? applySelect({ ...referenced }, select) : null;
};

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

const deepCopy = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(deepCopy);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepCopy(v)]));
  }

  return value;
};

/**
 * Run the schema's real pre-save hooks.
 *
 * This is what makes password hashing genuine rather than re-implemented: the
 * hook registered on the User schema does the work, so if the schema hook is
 * removed or broken the auth tests fail.
 *
 * Mongoose's `execPre` helper does not invoke its callback for these hooks, so
 * the registered functions are invoked directly and their returned promises
 * awaited. Only the document's own schema hooks run, in registration order.
 */
const runPreSaveHooks = async (doc) => {
  const pres = doc.$__schema?.s?.hooks?._pres;

  if (!pres?.get) {
    throw new Error(
      'MemoryStore: cannot reach the schema pre-save hooks, so document hooks ' +
        '(password hashing) would be silently skipped. Run the suite against a ' +
        'real database by setting MONGODB_URI_TEST.'
    );
  }

  for (const hook of pres.get('save') ?? []) {
    const result = hook.fn.call(doc, () => {});

    if (result && typeof result.then === 'function') await result;
  }
};

/**
 * Wrap a stored row in a real Mongoose document.
 *
 * `hydrated` documents represent rows already in the store. Documents being
 * *created* must use `new Model(...)` instead: `hydrate()` marks a document as
 * already persisted, so `isModified()` reports nothing and the pre-save hooks
 * (password hashing) would skip their work.
 */
const makeDocument = (Model, raw, { hydrated = true } = {}) => {
  const entry = registry.get(Model.modelName);

  const doc = hydrated ? Model.hydrate({ ...raw }) : new Model({ ...raw });

  doc.__modelName = Model.modelName;

  const persist = async () => {
    await runPreSaveHooks(doc);

    const plain = { ...doc.toObject({ depopulate: true, getters: false, virtuals: false }) };
    plain.__modelName = Model.modelName;

    const index = entry.docs.findIndex((candidate) => looseEq(candidate._id, plain._id));

    if (index >= 0) {
      /*
       * Merge rather than replace. Mongoose issues an update for the changed
       * paths only, so a field that was never loaded (because a projection
       * excluded it) survives the write. Replacing the row outright would
       * silently drop those fields.
       */
      entry.docs[index] = { ...entry.docs[index], ...plain };
    } else {
      entry.docs.push(plain);
    }

    Object.assign(raw, plain);

    /*
     * A persisted document is no longer new and has no pending modifications.
     * Real Mongoose resets both on save, and hooks depend on it: the User model
     * only stamps `passwordChangedAt` when `isNew` is false, and leaving
     * `isModified('password')` true would re-hash an already-hashed password on
     * the next save.
     */
    if (typeof doc.$__reset === 'function') {
      doc.$__reset();
    }

    doc.isNew = false;
    doc.$isNew = false;

    return doc;
  };

  doc.save = persist;

  doc.deleteOne = async () => {
    const index = entry.docs.findIndex((candidate) => looseEq(candidate._id, doc._id));

    if (index >= 0) entry.docs.splice(index, 1);

    return { deletedCount: 1 };
  };

  doc.populate = async (spec) => {
    const specs = Array.isArray(spec) ? spec : [spec];

    for (const item of specs) {
      const path = typeof item === 'string' ? item : item.path;
      const select = typeof item === 'string' ? undefined : item.select;

      const target = registry.get(Model.modelName).docs.find((c) => looseEq(c._id, doc._id));

      if (!target) continue;

      populateOne(target, path, select);

      if (path.includes('.')) {
        // Nested array populate (e.g. members.user) is not required by the
        // suite; the plain reference is left in place.
        continue;
      }

      doc[path] = target[path];
    }

    return doc;
  };

  return doc;
};

/* ------------------------------------------------------------------ *
 * Query
 * ------------------------------------------------------------------ */

const makeQuery = (Model, filter) => {
  let sortSpec = null;
  let skipCount = 0;
  let limitCount = Infinity;
  const populateSpecs = [];
  let selectSpec = null;

  const execute = async () => {
    const entry = registry.get(Model.modelName);

    let rows = entry.docs.filter((doc) => matchesFilter(doc, filter)).map((doc) => deepCopy(doc));

    if (sortSpec) rows = rows.sort(compareBySort(sortSpec));

    rows = rows.slice(skipCount, limitCount === Infinity ? undefined : skipCount + limitCount);

    for (const spec of populateSpecs) {
      const path = typeof spec === 'string' ? spec : spec.path;
      const select = typeof spec === 'string' ? undefined : spec.select;

      for (const row of rows) populateOne(row, path, select);
    }

    return rows.map((row) => makeDocument(Model, row));
  };

  const query = {
    sort(spec) {
      sortSpec = spec;

      return query;
    },
    skip(count) {
      skipCount = count;

      return query;
    },
    limit(count) {
      limitCount = count;

      return query;
    },
    select(spec) {
      selectSpec = spec;

      return query;
    },
    populate(spec) {
      populateSpecs.push(...(Array.isArray(spec) ? spec : [spec]));

      return query;
    },
    then(resolve, reject) {
      return execute().then((docs) => {
        if (selectSpec) {
          return resolve(
            docs.map((doc) => makeDocument(Model, applySelect(doc.toObject(), selectSpec, Model)))
          );
        }

        return resolve(docs);
      }, reject);
    },
    catch(reject) {
      return execute().then(undefined, reject);
    },
    async exec() {
      return execute();
    },
  };

  return query;
};

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

const evalExpr = (expr, doc) => {
  if (typeof expr === 'string') {
    return expr.startsWith('$') ? getPathValues(doc, expr.slice(1))[0] : expr;
  }
  if (isNullish(expr) || typeof expr !== 'object') return expr;
  if (Array.isArray(expr)) return expr.map((item) => evalExpr(item, doc));
  if (!isPlainObject(expr)) return expr;

  const operator = Object.keys(expr)[0];
  const arg = expr[operator];

  switch (operator) {
    case '$cond': {
      const [condition, thenValue, elseValue] = arg;

      return evalExpr(condition, doc) ? evalExpr(thenValue, doc) : evalExpr(elseValue, doc);
    }
    case '$eq': {
      const [a, b] = arg.map((item) => evalExpr(item, doc));

      return looseEq(a, b);
    }
    case '$ne': {
      const [a, b] = arg.map((item) => evalExpr(item, doc));

      return !looseEq(a, b);
    }
    case '$lt': {
      const [a, b] = arg.map((item) => evalExpr(item, doc));

      return !isNullish(a) && compareValues(a, b) < 0;
    }
    case '$lte': {
      const [a, b] = arg.map((item) => evalExpr(item, doc));

      return !isNullish(a) && compareValues(a, b) <= 0;
    }
    case '$gte': {
      const [a, b] = arg.map((item) => evalExpr(item, doc));

      return !isNullish(a) && compareValues(a, b) >= 0;
    }
    case '$gt': {
      const [a, b] = arg.map((item) => evalExpr(item, doc));

      return !isNullish(a) && compareValues(a, b) > 0;
    }
    case '$and':
      return arg.every((item) => Boolean(evalExpr(item, doc)));
    case '$or':
      return arg.some((item) => Boolean(evalExpr(item, doc)));
    case '$not': {
      const inner = Array.isArray(arg) ? arg[0] : arg;

      return !evalExpr(inner, doc);
    }
    case '$in': {
      const [needle, haystack] = arg.map((item) => evalExpr(item, doc));

      return Array.isArray(haystack) && haystack.some((candidate) => looseEq(candidate, needle));
    }
    default:
      throw new Error(`MemoryStore: unsupported aggregation operator ${operator}`);
  }
};

const runAggregation = (docs, pipeline) => {
  let current = docs;

  for (const stage of pipeline) {
    const operator = Object.keys(stage)[0];

    if (operator === '$match') {
      current = current.filter((doc) => matchesFilter(doc, stage.$match));
    } else if (operator === '$group') {
      const { _id, ...accumulators } = stage.$group;
      const groups = new Map();

      for (const doc of current) {
        const key = evalExpr(_id, doc);
        const keyString = JSON.stringify(key instanceof Date ? key.getTime() : key);

        if (!groups.has(keyString)) {
          const bucket = { _id: key };

          for (const name of Object.keys(accumulators)) bucket[name] = 0;

          groups.set(keyString, bucket);
        }

        const bucket = groups.get(keyString);

        for (const [name, accumulator] of Object.entries(accumulators)) {
          const value = evalExpr(accumulator.$sum, doc);

          bucket[name] += typeof value === 'number' ? value : 0;
        }
      }

      current = [...groups.values()];
    } else if (operator === '$facet') {
      const facets = {};

      for (const [name, subPipeline] of Object.entries(stage.$facet)) {
        facets[name] = runAggregation(current, subPipeline);
      }

      current = [facets];
    } else if (operator === '$lookup') {
      const { from, localField, foreignField, as } = stage.$lookup;
      const foreign = [...registry.values()].find((entry) => entry.Model.collection.name === from);

      current = current.map((doc) => {
        const local = getPathValues(doc, localField)[0];
        const matches = (foreign?.docs ?? []).filter((candidate) =>
          looseEq(getPathValues(candidate, foreignField)[0], local)
        );

        return { ...doc, [as]: matches.map((match) => deepCopy(match)) };
      });
    } else if (operator === '$unwind') {
      const path = typeof stage.$unwind === 'string' ? stage.$unwind : stage.$unwind.path;
      const field = path.startsWith('$') ? path.slice(1) : path;
      const out = [];

      for (const doc of current) {
        const value = getPathValues(doc, field)[0];

        if (Array.isArray(value)) {
          for (const item of value) out.push({ ...doc, [field]: item });
        }
      }

      current = out;
    } else {
      throw new Error(`MemoryStore: unsupported aggregation stage ${operator}`);
    }
  }

  return current;
};

/* ------------------------------------------------------------------ *
 * Installation
 * ------------------------------------------------------------------ */

/**
 * Reproduce Mongoose's casting failure for ObjectId-typed filter paths.
 *
 * With a real driver, filtering on a path declared as ObjectId with a
 * malformed string throws a CastError, which the error middleware maps to
 * HTTP 400. Without this the in-memory store would simply find nothing and
 * return 404 — the suite would then assert behaviour that only holds here.
 */
const assertCastable = (Model, filter) => {
  if (!filter || typeof filter !== 'object') return;

  const assertValue = (path, candidate) => {
    if (candidate === null || candidate === undefined) return;
    if (candidate instanceof mongoose.Types.ObjectId) return;
    if (typeof candidate === 'string' && mongoose.Types.ObjectId.isValid(candidate)) return;

    /*
     * An operator object such as `{ $ne: someId }` is valid: it is the
     * operands that have to be castable, not the wrapper.
     */
    if (isPlainObject(candidate)) {
      for (const [operator, operand] of Object.entries(candidate)) {
        if (!operator.startsWith('$')) continue;

        for (const item of Array.isArray(operand) ? operand : [operand]) {
          assertValue(path, item);
        }
      }

      return;
    }

    const error = new Error(
      `Cast to ObjectId failed for value "${candidate}" (type ${typeof candidate}) at path "${path}"`
    );

    error.name = 'CastError';
    error.path = path;
    error.value = candidate;

    throw error;
  };

  for (const [path, value] of Object.entries(filter)) {
    if (path.startsWith('$')) continue;

    const schemaType = Model.schema.path(path);

    if (schemaType?.instance !== 'ObjectId') continue;

    assertValue(path, value);
  }
};

/**
 * Replace a model's persistence methods with in-memory equivalents.
 */
export const installModel = (Model) => {
  const entry = { Model, docs: [] };

  registry.set(Model.modelName, entry);

  Model.create = async (data) => {
    const doc = makeDocument(Model, { ...data }, { hydrated: false });

    await doc.save();

    return doc;
  };

  Model.find = (filter = {}) => {
    assertCastable(Model, filter);

    return makeQuery(Model, filter);
  };

  /*
   * `findOne` / `findById` must stay chainable *and* resolve to a single
   * document. Each chained call returns the same wrapper, so `then` is the only
   * place the array is collapsed to one result.
   */
  Model.findOne = (filter = {}) => {
    assertCastable(Model, filter);

    const query = makeQuery(Model, filter);

    const wrapper = {
      sort: () => wrapper,
      skip: () => wrapper,
      limit: () => wrapper,
      select: (spec) => {
        query.select(spec);

        return wrapper;
      },
      populate: (spec) => {
        query.populate(spec);

        return wrapper;
      },
      then: (resolve, reject) => query.limit(1).then((docs) => resolve(docs[0] ?? null), reject),
      catch: (reject) => query.limit(1).then((docs) => docs[0] ?? null, reject),
    };

    return wrapper;
  };

  Model.findById = (id) => {
    assertCastable(Model, { _id: id });

    const query = makeQuery(Model, { _id: id });

    const wrapper = {
      select: (spec) => {
        query.select(spec);

        return wrapper;
      },
      populate: (spec) => {
        query.populate(spec);

        return wrapper;
      },
      then: (resolve, reject) => query.limit(1).then((docs) => resolve(docs[0] ?? null), reject),
      catch: (reject) => query.limit(1).then((docs) => docs[0] ?? null, reject),
    };

    return wrapper;
  };

  Model.countDocuments = async (filter = {}) => {
    assertCastable(Model, filter);

    return entry.docs.filter((doc) => matchesFilter(doc, filter)).length;
  };

  Model.exists = async (filter = {}) => {
    assertCastable(Model, filter);

    const found = entry.docs.find((doc) => matchesFilter(doc, filter));

    return found ? { _id: found._id } : null;
  };

  Model.updateMany = async (filter, update) => {
    assertCastable(Model, filter);

    let modified = 0;

    for (const doc of entry.docs) {
      if (!matchesFilter(doc, filter)) continue;

      if (update.$set) Object.assign(doc, update.$set);

      if (update.$pull) {
        for (const [field, value] of Object.entries(update.$pull)) {
          if (Array.isArray(doc[field])) {
            doc[field] = doc[field].filter((item) => !looseEq(item, value));
          }
        }
      }

      modified += 1;
    }

    return { modifiedCount: modified, matchedCount: modified };
  };

  Model.deleteMany = async (filter = {}) => {
    assertCastable(Model, filter);

    const before = entry.docs.length;

    entry.docs = entry.docs.filter((doc) => !matchesFilter(doc, filter));

    return { deletedCount: before - entry.docs.length };
  };

  Model.aggregate = async (pipeline) =>
    runAggregation(
      entry.docs.map((doc) => deepCopy(doc)),
      pipeline
    );

  /*
   * Apply a plain update document. Supports the shapes the codebase actually
   * uses: a bare field map, `$set`, and `$pull`.
   */
  const applyUpdate = (target, update) => {
    const next = { ...target };

    if (update.$set) Object.assign(next, update.$set);

    if (update.$pull) {
      for (const [field, value] of Object.entries(update.$pull)) {
        if (Array.isArray(next[field])) {
          next[field] = next[field].filter((item) => !looseEq(item, value));
        }
      }
    }

    for (const [field, value] of Object.entries(update)) {
      if (field.startsWith('$')) continue;

      next[field] = value;
    }

    return next;
  };

  /*
   * `findOneAndUpdate(filter, update, options)`.
   *
   * Used by the codebase for project updates and task archive/restore, always
   * with `{ new: true, runValidators: true }` and chained `.populate(...)`. The
   * returned object is therefore both chainable and awaitable, mirroring a
   * Mongoose query.
   */
  Model.findOneAndUpdate = (filter = {}, update = {}, options = {}) => {
    assertCastable(Model, filter);

    const populateSpecs = [];

    const execute = async () => {
      const index = entry.docs.findIndex((doc) => matchesFilter(doc, filter));

      if (index < 0) return null;

      const before = deepCopy(entry.docs[index]);
      const after = applyUpdate(before, update);

      if (options.runValidators) {
        const candidate = makeDocument(Model, deepCopy(after));
        const validationError = candidate.validateSync ? candidate.validateSync() : null;

        if (validationError) throw validationError;
      }

      entry.docs[index] = after;

      // `new: true` yields the updated document; `new: false` the original.
      const doc = makeDocument(Model, deepCopy(options.new === false ? before : after));

      if (populateSpecs.length > 0) {
        await doc.populate(populateSpecs);
      }

      return doc;
    };

    const query = {
      populate: (pathOrSpec, select) => {
        const path = typeof pathOrSpec === 'string' ? pathOrSpec : pathOrSpec.path;
        const fieldSelect = typeof pathOrSpec === 'string' ? select : pathOrSpec.select;

        populateSpecs.push({ path, select: fieldSelect });

        return query;
      },
      then: (resolve, reject) => execute().then(resolve, reject),
      catch: (reject) => execute().catch(reject),
    };

    return query;
  };

  return entry;
};

/** Install the store over every model the app registers. */
export const installAll = (models) => {
  for (const Model of models) installModel(Model);

  return registry;
};

export const resetStore = () => {
  for (const entry of registry.values()) entry.docs = [];
};

export const getStore = () => registry;

/** Seed rows directly, bypassing hooks (for fixtures that need exact state). */
export const seedRaw = (Model, rows) => {
  const entry = registry.get(Model.modelName);

  for (const row of rows) {
    entry.docs.push({ ...row, __modelName: Model.modelName });
  }
};
