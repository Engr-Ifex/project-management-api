import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

/*
 * Serves the generated OpenAPI document.
 *
 * The document is a build artefact (`npm run docs:generate`) committed to the
 * repository, so it is read once and cached. Serving it costs nothing at
 * runtime and lets consumers discover the contract programmatically:
 *
 *   curl http://localhost:5000/api/v1/openapi.json
 *
 * If the artefact is missing the route reports that clearly rather than
 * failing at startup, so a deployment that skips the docs step still runs.
 */
const router = express.Router();

const SPEC_PATH = path.join(process.cwd(), 'docs', 'openapi.json');

let document = null;

router.get('/openapi.json', (req, res) => {
  if (!document) {
    try {
      document = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
    } catch {
      return res.status(503).json({
        success: false,
        statusCode: 503,
        message: 'OpenAPI document is unavailable. Run `npm run docs:generate`.',
        errors: [],
      });
    }
  }

  return res.status(200).json(document);
});

export default router;
