// Razorpay: online payments that confirm themselves.
//
//  1. createOrder()  — the server asks Razorpay for an order of the exact total (dues + platform fee).
//  2. The browser opens Razorpay Checkout with that order; the member pays (UPI / QR / card).
//  3. Checkout returns { razorpay_order_id, razorpay_payment_id, razorpay_signature }.
//     checkoutSignatureOk() recomputes HMAC-SHA256(order_id|payment_id, KEY_SECRET) — only Razorpay
//     (and this server) know the secret, so a valid signature proves the money was paid.
//  4. Razorpay also calls our webhook (signed with WEBHOOK_SECRET) — it confirms the payment even if
//     the member's phone closed before step 3 finished.
import crypto from 'node:crypto';
import { HttpError } from './util.js';

export const razorpayEnabled = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
export const razorpayKeyId = () => process.env.RAZORPAY_KEY_ID || null;

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

/** Creates a Razorpay order for `totalPaise`. `notes` travel back to us in webhooks. */
export async function createOrder({ totalPaise, receipt, notes }) {
  if (!razorpayEnabled()) throw new HttpError(400, 'online_not_set');
  // automated tests only: no network, predictable ids
  if (process.env.NODE_ENV === 'test' && process.env.RAZORPAY_FAKE_ORDERS === '1') {
    return { id: `order_test_${crypto.randomBytes(6).toString('hex')}`, amount: totalPaise, currency: 'INR' };
  }
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    // payment_capture: 1 — capture automatically, so the money settles even if the dashboard setting is changed
    body: JSON.stringify({ amount: totalPaise, currency: 'INR', receipt, notes, payment_capture: 1 }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id) {
    console.error('[razorpay] order failed', res.status, body?.error?.description ?? '');
    throw new HttpError(502, 'online_failed_to_start');
  }
  return body;
}

export function checkoutSignatureOk({ orderId, paymentId, signature }) {
  return safeEqual(hmac(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
}

export function webhookSignatureOk(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  return safeEqual(hmac(secret, rawBody), signature);
}
