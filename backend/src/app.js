import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import memberRoutes from './routes/members.js';
import installmentRoutes from './routes/installments.js';
import { loans, repayments } from './routes/loans.js';
import statementRoutes from './routes/statements.js';
import reportRoutes from './routes/reports.js';
import historyRoutes from './routes/history.js';
import { dashboard, settings, auditLog, backup, practice } from './routes/admin.js';
import { session, requireLogin, requireAdmin, requirePerm, requireManager } from './middleware/auth.js';
import staffRoutes from './routes/staff.js';
import { support, notifications } from './routes/support.js';
import { memberPay, payments, upiSettings, receipts } from './routes/pay.js';
import { notFound, errorHandler } from './middleware/error.js';
import { razorpayWebhook } from './routes/webhooks.js';
import loanApply from './routes/loanApply.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  // Razorpay webhook needs the exact raw body to check its signature — before the JSON parser
  app.post('/api/v1/webhooks/razorpay', express.raw({ type: '*/*', limit: '1mb' }), (req, res, next) => razorpayWebhook(req, res).catch(next));
  // loan applications carry three document photos (compressed in the browser)
  app.use('/api/v1/loan-apply', express.json({ limit: '20mb' }));
  app.use(express.json({ limit: '4mb' }));

  // Cookie sessions + SameSite=strict: refuse cross-site writes outright as a second guard.
  app.use((req, _res, next) => {
    const origin = req.headers.origin;
    if (origin && req.method !== 'GET') {
      const allowed = (process.env.APP_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim());
      if (!allowed.includes(origin)) return next(Object.assign(new Error('bad origin'), { status: 403 }));
    }
    next();
  });

  app.get('/health', (_req, res) => res.json({ ok: true }));

  const api = express.Router();
  api.use(session);
  // counted per address + mobile number: behind a proxy (website → API on Vercel) many people can share one address
  api.use('/auth', rateLimit({
    windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}|${String(req.body?.mobile ?? '')}`,
    message: { error: { code: 'too_many_requests' } },
  }), authRoutes);

  api.use(requireLogin);
  api.use('/statements', statementRoutes); // members (own account only) and admins
  api.use('/pay', memberPay); // members: their own dues and payments
  api.use('/receipts', receipts); // members (own) and staff
  api.use('/loan-apply', loanApply); // members apply; staff with the loans work area decide

  api.use(requireAdmin);
  // every staff member can look members up; changing them is a work area
  api.use('/members', requirePerm('members', { readOpen: true }), memberRoutes);
  api.use('/installments', requirePerm('installments'), installmentRoutes);
  api.use('/loans', requirePerm('loans'), loans);
  api.use('/repayments', requirePerm('loans'), repayments);
  api.use('/reports', requirePerm('reports'), reportRoutes);
  api.use('/history', requirePerm('history'), historyRoutes);
  api.use('/dashboard', dashboard);
  api.use('/payments', requirePerm('payments'), payments);
  api.use('/upi-settings', upiSettings);
  api.use('/support', support);
  api.use('/notifications', notifications);
  api.use('/staff', requireManager, staffRoutes);
  api.use('/settings', (req, res, next) => (req.method === 'GET' ? next() : requireManager(req, res, next)), settings);
  api.use('/audit-log', requireManager, auditLog);
  api.use('/backup', requireManager, backup);
  api.use('/practice', requireManager, practice);

  app.use('/api/v1', api);
  app.use(notFound);
  app.use((err, req, res, next) => (err?.status === 403 && err.message === 'bad origin' ? res.status(403).json({ error: { code: 'forbidden' } }) : errorHandler(err, req, res, next)));
  return app;
}
