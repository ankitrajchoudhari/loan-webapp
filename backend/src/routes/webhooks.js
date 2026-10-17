// Razorpay webhook: Razorpay's server tells us a payment succeeded or failed, even if the member's
// phone closed before the checkout finished. The body is checked with RAZORPAY_WEBHOOK_SECRET first.
// Set it up in Razorpay Dashboard → Webhooks → URL https://<your-site>/api/v1/webhooks/razorpay,
// events: payment.captured, payment.failed, order.paid.
import { runInEnv, prisma, testEnvAvailable } from '../lib/db.js';
import { webhookSignatureOk } from '../lib/razorpay.js';
import { settleOnline } from './pay.js';

export async function razorpayWebhook(req, res) {
  const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
  if (!webhookSignatureOk(raw, req.headers['x-razorpay-signature'])) return res.status(400).json({ error: { code: 'bad_signature' } });
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: { code: 'bad_request' } });
  }
  const payment = event.payload?.payment?.entity;
  const orderId = payment?.order_id ?? event.payload?.order?.entity?.id;
  const env = payment?.notes?.env === 'test' || event.payload?.order?.entity?.notes?.env === 'test' ? 'test' : 'live';
  if (!orderId || (env === 'test' && !testEnvAvailable())) return res.json({ ok: true, ignored: true });

  await runInEnv(env, async () => {
    const p = await prisma.payment.findUnique({ where: { gatewayOrderId: orderId } });
    if (!p) return;
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      if (p.status !== 'confirmed') await settleOnline(p, payment?.id ?? p.gatewayPaymentId);
    } else if (event.event === 'payment.failed' && p.status === 'initiated') {
      await prisma.payment.update({ where: { id: p.id }, data: { status: 'rejected', rejectReason: payment?.error_description?.slice(0, 300) || 'ऑनलाइन भुगतान असफल' } });
    }
  });
  res.json({ ok: true }); // always 200 once verified, so Razorpay does not keep retrying
}
