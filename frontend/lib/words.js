// Amount in words for receipts, Indian style (thousand, lakh, crore) — Hindi and English.
//   amountInWords(224000, 'en') → "Rupees Two Thousand Two Hundred Forty Only"
//   amountInWords(224000, 'hi') → "दो हज़ार दो सौ चालीस रुपये मात्र"

const HI = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस',
  'बीस', 'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस', 'तीस', 'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस',
  'चालीस', 'इकतालीस', 'बयालीस', 'तैंतालीस', 'चौवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास', 'पचास', 'इक्यावन', 'बावन', 'तिरेपन', 'चौवन', 'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ',
  'साठ', 'इकसठ', 'बासठ', 'तिरेसठ', 'चौंसठ', 'पैंसठ', 'छियासठ', 'सड़सठ', 'अड़सठ', 'उनहत्तर', 'सत्तर', 'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उन्यासी',
  'अस्सी', 'इक्यासी', 'बयासी', 'तिरासी', 'चौरासी', 'पचासी', 'छियासी', 'सत्तासी', 'अट्ठासी', 'नवासी', 'नब्बे', 'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पंचानवे', 'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे'];
const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const en2 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const two = (n, hi) => (hi ? HI[n] : en2(n));

/** Whole number → words, Indian grouping. */
function numberWords(n, hi) {
  if (n === 0) return hi ? HI[0] : ONES[0];
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor(n / 100000) % 100;
  const thousand = Math.floor(n / 1000) % 100;
  const hundred = Math.floor(n / 100) % 10;
  const rest = n % 100;
  if (crore) parts.push(`${numberWords(crore, hi)} ${hi ? 'करोड़' : 'Crore'}`);
  if (lakh) parts.push(`${two(lakh, hi)} ${hi ? 'लाख' : 'Lakh'}`);
  if (thousand) parts.push(`${two(thousand, hi)} ${hi ? 'हज़ार' : 'Thousand'}`);
  if (hundred) parts.push(`${two(hundred, hi)} ${hi ? 'सौ' : 'Hundred'}`);
  if (rest) parts.push(two(rest, hi));
  return parts.join(' ');
}

export function amountInWords(paise, lang = 'hi') {
  const hi = lang !== 'en';
  const p = Math.max(0, Math.round(paise));
  const rupees = Math.floor(p / 100);
  const ps = p % 100;
  if (hi) return `${numberWords(rupees, true)} रुपये${ps ? ` ${numberWords(ps, true)} पैसे` : ''} मात्र`;
  return `Rupees ${numberWords(rupees, false)}${ps ? ` and ${numberWords(ps, false)} Paise` : ''} Only`;
}
