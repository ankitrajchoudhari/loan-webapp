import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargedDays, monthTotals } from '../../src/lib/platform.js';

const at = (s) => new Date(s); // ISO with +05:30 = India time

test('platform fee: each India calendar day it was on counts once, split by month', () => {
  const periods = [
    // on at 11 pm on 30 Jan (India), off at 1 am on 2 Feb → 30, 31 Jan + 1, 2 Feb
    { startedAt: at('2026-01-30T23:00:00+05:30'), endedAt: at('2026-02-02T01:00:00+05:30'), ratePaise: 1245 },
    // switched on again later on 2 Feb: same day, not charged twice
    { startedAt: at('2026-02-02T18:00:00+05:30'), endedAt: at('2026-02-03T09:00:00+05:30'), ratePaise: 1245 },
  ];
  const m = monthTotals(chargedDays(periods));
  assert.deepEqual([...m.keys()], ['2026-01', '2026-02']);
  assert.equal(m.get('2026-01').days, 2);
  assert.equal(m.get('2026-01').amountPaise, 2 * 1245);
  assert.equal(m.get('2026-02').days, 3); // 1, 2, 3 Feb
  assert.deepEqual(m.get('2026-02').breakdown, [{ ratePaise: 1245, days: 3, from: '2026-02-01', to: '2026-02-03' }]);
});

test('platform fee: a whole 31-day month on = 31 × ₹12.45; a running period counts up to today', () => {
  const full = monthTotals(chargedDays([{ startedAt: at('2026-03-01T00:00:00+05:30'), endedAt: at('2026-03-31T23:59:00+05:30'), ratePaise: 1245 }]));
  assert.equal(full.get('2026-03').amountPaise, 38595); // ₹385.95
  const running = monthTotals(chargedDays([{ startedAt: at('2026-04-10T12:00:00+05:30'), endedAt: null, ratePaise: 1245 }], at('2026-04-12T08:00:00+05:30')));
  assert.equal(running.get('2026-04').days, 3);
});
