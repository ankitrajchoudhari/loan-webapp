import { Router } from 'express';
import { parseMonthYear, HttpError } from '../lib/util.js';
import { loadMember, memberHome, monthStatement, memberHistory } from '../lib/ledger.js';
import { duesOf } from '../lib/payments.js';
import { memberFeePaise } from '../lib/platform.js';
import { assertSelfOrAdmin } from '../middleware/auth.js';

const router = Router();

/** "me" means the logged-in member. Anyone else's id is refused unless the caller is admin. */
function memberIdFor(req) {
  const id = req.params.id === 'me' ? (req.user.role === 'member' ? req.user.id : null) : req.params.id;
  if (!id) throw new HttpError(400, 'member_required');
  assertSelfOrAdmin(req, id);
  return id;
}

router.get('/:id/home', async (req, res) => {
  const member = await loadMember(memberIdFor(req));
  const dues = duesOf(member);
  res.json({ ...memberHome(member), pay: { payablePaise: dues.payablePaise, creditPaise: dues.creditPaise, feePaise: await memberFeePaise() } });
});

router.get('/:id/month', async (req, res) => {
  const id = memberIdFor(req);
  const { month, year } = parseMonthYear(req.query, { required: false });
  res.json(monthStatement(await loadMember(id), month, year));
});

router.get('/:id/history', async (req, res) => {
  res.json(memberHistory(await loadMember(memberIdFor(req))));
});

export default router;
