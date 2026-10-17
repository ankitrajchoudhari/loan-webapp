import { Router } from 'express';
import { HttpError, parseMonthYear } from '../lib/util.js';
import { monthlyDeposits, pendingInstallments, loansOutstanding, memberFullAccount } from '../lib/reports.js';

const router = Router(); // mounted behind requireAdmin

const REPORTS = {
  deposits: monthlyDeposits,
  pending: pendingInstallments,
  loans: loansOutstanding,
  member: memberFullAccount,
};

// PDFs are made in the browser (Print → "Save as PDF"): it renders Hindi perfectly on every device,
// while server-side PDF libraries break Devanagari matras.
router.get('/:type', async (req, res) => {
  const build = REPORTS[req.params.type];
  if (!build) throw new HttpError(404, 'not_found');
  const { month, year } = parseMonthYear(req.query, { required: false });
  const memberId = req.query.memberId ? String(req.query.memberId) : null;
  if (req.params.type === 'member' && !memberId) throw new HttpError(400, 'member_required');
  res.json(await build({ month, year, memberId }));
});

export default router;
