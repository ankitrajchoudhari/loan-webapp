import { Prisma } from '../lib/db.js';
import { HttpError } from '../lib/util.js';
import { reportStaffError } from '../lib/notify.js';

export function notFound(_req, _res, next) {
  next(new HttpError(404, 'not_found'));
}

// Errors carry a stable `code`; the frontend shows it in Hindi or English. No internals leak out.
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, details: err.details } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: { code: 'duplicate' } });
    if (err.code === 'P2025') return res.status(404).json({ error: { code: 'not_found' } });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'bad_request' } });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { code: 'file_too_large' } });
  console.error(err);
  reportStaffError(req, err); // tells the developer at once (no wait)
  res.status(500).json({ error: { code: 'server_error' } });
}
