# Test checklist (acceptance)

Automated: `cd backend && npm test` (31 checks, uses throwaway CI databases) and `cd frontend && npm run check:i18n`.
Manual: do the list below **in practice mode** (admin login → "अभ्यास मोड में खोलें"), once on a **phone** and once on a **computer**. Tick each line.

## Login and access
- [ ] Member login page shows "श्री श्याम सेवा समिति" and "अपना खाता देखने के लिए मोबाइल नंबर डालें।"
- [ ] `/?practice=1` → number 9000000001 + date of birth 01/01/1960 → "नमस्ते, रामलाल शर्मा" home opens
- [ ] Wrong date of birth → refused; 5 times → locked message in Hindi; a number the admin never added → refused
- [ ] Member sees only: name, member no., monthly installment, paid this month, status, loan left, interest left + two buttons
- [ ] Member with no loan sees "आपने समिति से कोई कर्ज नहीं लिया है।" (sample member 102)
- [ ] Member "महीने का हिसाब देखें": change month/year with Hindi month names; previous months load
- [ ] Member "पुराना हिसाब देखें": month table + "अब तक जमा किए गए पैसों का हिसाब"
- [ ] Log out; opening `/member` again goes back to login
- [ ] Admin first-time registration by SMS code and by Gmail (needs Firebase Phone + Google enabled)
- [ ] Admin login by mobile + date of birth + secret code; wrong code or date refused
- [ ] Admin login by Gmail + secret code

## Members
- [ ] Add a member — member number is filled automatically; saved message appears
- [ ] Same mobile number again → refused with a Hindi message
- [ ] Search by name, by number, by mobile
- [ ] Edit name → saved; edit monthly installment → reason is asked for
- [ ] Deactivate (with reason) → member shows "निष्क्रिय", old records still visible, member cannot log in

## Monthly installment
- [ ] Record ₹1,000 for a pending member → preview → save → green confirmation
- [ ] Record the same member + month again → "पहले से दर्ज है"
- [ ] Record ₹400 → status "थोड़ी जमा हुई", pending ₹600
- [ ] Correct an entry → reason required → change visible in "बदलाव का रिकॉर्ड" with old and new values
- [ ] Cancel an entry → shown struck through with the reason; the month can be entered again

## Loans
- [ ] New loan with each method (बाकी राशि पर / पूरे कर्ज पर / तय रकम) → preview shows first month's interest
- [ ] Repayment: "अपने-आप बाँटें" fills interest first; principal + interest must equal total
- [ ] Preview shows "अभी" vs "बदलाव के बाद" balances
- [ ] Principal more than owed → refused
- [ ] Correct an old repayment → before/after balances shown, reason required, change log shows it
- [ ] Month-by-month ledger: interest charged, paid, balances add up

## Old records
- [ ] Create a group; add an installment row by hand → "पूरा विवरण देखें" → add as "जाँच बाकी"
- [ ] Sample group: row with member 999 shows "यह सदस्य नहीं मिला" and cannot be marked correct
- [ ] Mark rows correct → "सही रिकॉर्ड पक्के करें" → records appear in the member's account marked "पुराना"
- [ ] Import a CSV/Excel file: columns matched, bad rows shown in red, duplicates detected, nothing saved until "समूह में जोड़ें"

## Reports and dashboard
- [ ] Home figures match the reports (installments this month, pending, loans, interest)
- [ ] Each report filters by month/year and member
- [ ] Print → "Save as PDF" gives a clean Hindi page (no menus, readable tables)

## Language and display
- [ ] हिंदी / English switch works on every screen and is remembered
- [ ] Dates show as DD/MM/YYYY; money as ₹1,000 / ₹1,00,000
- [ ] Phone: no sideways scrolling except inside wide tables; buttons are easy to tap

## Data safety
- [ ] Practice reset leaves live records untouched (log in without practice mode and check)
- [ ] Settings → download backup file opens/saves a `.json` file
- [ ] `npm run backup` writes a file in `backend/backups/`
