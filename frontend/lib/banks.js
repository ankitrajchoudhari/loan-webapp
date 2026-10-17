// Banks in India (RBI list of scheduled banks, plus the larger co-operative banks), for the type-to-search box.
// The IFSC lookup fills the exact bank name anyway; this list only helps the member start typing.
// [name, IFSC prefix (first 4 letters) where common, type]

export const BANK_TYPES = {
  psb: ['सरकारी बैंक', 'Public sector bank'],
  pvt: ['प्राइवेट बैंक', 'Private bank'],
  sfb: ['स्मॉल फ़ाइनेंस बैंक', 'Small finance bank'],
  pay: ['पेमेंट्स बैंक', 'Payments bank'],
  rrb: ['ग्रामीण बैंक', 'Regional rural bank'],
  coop: ['सहकारी बैंक', 'Co-operative bank'],
  fgn: ['विदेशी बैंक', 'Foreign bank'],
};

export const BANKS = [
  // Public sector
  ['State Bank of India', 'SBIN', 'psb'],
  ['Punjab National Bank', 'PUNB', 'psb'],
  ['Bank of Baroda', 'BARB', 'psb'],
  ['Canara Bank', 'CNRB', 'psb'],
  ['Union Bank of India', 'UBIN', 'psb'],
  ['Bank of India', 'BKID', 'psb'],
  ['Indian Bank', 'IDIB', 'psb'],
  ['Central Bank of India', 'CBIN', 'psb'],
  ['Indian Overseas Bank', 'IOBA', 'psb'],
  ['UCO Bank', 'UCBA', 'psb'],
  ['Bank of Maharashtra', 'MAHB', 'psb'],
  ['Punjab & Sind Bank', 'PSIB', 'psb'],
  // Private
  ['HDFC Bank', 'HDFC', 'pvt'],
  ['ICICI Bank', 'ICIC', 'pvt'],
  ['Axis Bank', 'UTIB', 'pvt'],
  ['Kotak Mahindra Bank', 'KKBK', 'pvt'],
  ['IndusInd Bank', 'INDB', 'pvt'],
  ['Yes Bank', 'YESB', 'pvt'],
  ['IDFC FIRST Bank', 'IDFB', 'pvt'],
  ['IDBI Bank', 'IBKL', 'pvt'],
  ['Federal Bank', 'FDRL', 'pvt'],
  ['Bandhan Bank', 'BDBL', 'pvt'],
  ['RBL Bank', 'RATN', 'pvt'],
  ['South Indian Bank', 'SIBL', 'pvt'],
  ['Karur Vysya Bank', 'KVBL', 'pvt'],
  ['Karnataka Bank', 'KARB', 'pvt'],
  ['City Union Bank', 'CIUB', 'pvt'],
  ['Tamilnad Mercantile Bank', 'TMBL', 'pvt'],
  ['DCB Bank', 'DCBL', 'pvt'],
  ['CSB Bank', 'CSBK', 'pvt'],
  ['Dhanlaxmi Bank', 'DLXB', 'pvt'],
  ['Jammu & Kashmir Bank', 'JAKA', 'pvt'],
  ['Nainital Bank', 'NTBL', 'pvt'],
  // Small finance banks
  ['AU Small Finance Bank', 'AUBL', 'sfb'],
  ['Equitas Small Finance Bank', 'ESFB', 'sfb'],
  ['Ujjivan Small Finance Bank', 'UJVN', 'sfb'],
  ['Jana Small Finance Bank', 'JSFB', 'sfb'],
  ['Suryoday Small Finance Bank', 'SURY', 'sfb'],
  ['Utkarsh Small Finance Bank', 'UTKS', 'sfb'],
  ['ESAF Small Finance Bank', 'ESMF', 'sfb'],
  ['Capital Small Finance Bank', 'CLBL', 'sfb'],
  ['North East Small Finance Bank', 'NESF', 'sfb'],
  ['Shivalik Small Finance Bank', 'SMCB', 'sfb'],
  ['Unity Small Finance Bank', 'UNBA', 'sfb'],
  ['Slice Small Finance Bank', 'NESF', 'sfb'],
  // Payments banks
  ['India Post Payments Bank', 'IPOS', 'pay'],
  ['Airtel Payments Bank', 'AIRP', 'pay'],
  ['Paytm Payments Bank', 'PYTM', 'pay'],
  ['Fino Payments Bank', 'FINO', 'pay'],
  ['Jio Payments Bank', 'JIOP', 'pay'],
  ['NSDL Payments Bank', 'NSPB', 'pay'],
  // Regional rural banks
  ['Rajasthan Marudhara Gramin Bank', 'RMGB', 'rrb'],
  ['Baroda Rajasthan Kshetriya Gramin Bank', 'BARB', 'rrb'],
  ['Aryavart Bank', 'BKID', 'rrb'],
  ['Baroda UP Bank', 'BARB', 'rrb'],
  ['Prathama UP Gramin Bank', 'PUNB', 'rrb'],
  ['Madhya Pradesh Gramin Bank', 'BKID', 'rrb'],
  ['Madhyanchal Gramin Bank', 'SBIN', 'rrb'],
  ['Chhattisgarh Rajya Gramin Bank', 'SBIN', 'rrb'],
  ['Sarva Haryana Gramin Bank', 'PUNB', 'rrb'],
  ['Punjab Gramin Bank', 'PUNB', 'rrb'],
  ['Himachal Pradesh Gramin Bank', 'PUNB', 'rrb'],
  ['Ellaquai Dehati Bank', 'SBIN', 'rrb'],
  ['J&K Grameen Bank', 'JAKA', 'rrb'],
  ['Uttarakhand Gramin Bank', 'SBIN', 'rrb'],
  ['Dakshin Bihar Gramin Bank', 'PUNB', 'rrb'],
  ['Uttar Bihar Gramin Bank', 'CBIN', 'rrb'],
  ['Jharkhand Rajya Gramin Bank', 'SBIN', 'rrb'],
  ['Bangiya Gramin Vikash Bank', 'PUNB', 'rrb'],
  ['Paschim Banga Gramin Bank', 'UCBA', 'rrb'],
  ['Uttarbanga Kshetriya Gramin Bank', 'CBIN', 'rrb'],
  ['Odisha Gramya Bank', 'IOBA', 'rrb'],
  ['Utkal Grameen Bank', 'SBIN', 'rrb'],
  ['Assam Gramin Vikash Bank', 'PUNB', 'rrb'],
  ['Baroda Gujarat Gramin Bank', 'BARB', 'rrb'],
  ['Saurashtra Gramin Bank', 'SBIN', 'rrb'],
  ['Maharashtra Gramin Bank', 'MAHB', 'rrb'],
  ['Vidharbha Konkan Gramin Bank', 'BKID', 'rrb'],
  ['Karnataka Gramin Bank', 'CNRB', 'rrb'],
  ['Karnataka Vikas Grameena Bank', 'KVGB', 'rrb'],
  ['Kerala Gramin Bank', 'KLGB', 'rrb'],
  ['Tamil Nadu Grama Bank', 'IDIB', 'rrb'],
  ['Andhra Pradesh Grameena Vikas Bank', 'SBIN', 'rrb'],
  ['Chaitanya Godavari Grameena Bank', 'UBIN', 'rrb'],
  ['Saptagiri Grameena Bank', 'IDIB', 'rrb'],
  ['Andhra Pragathi Grameena Bank', 'APGB', 'rrb'],
  ['Telangana Grameena Bank', 'SBIN', 'rrb'],
  ['Puduvai Bharathiar Grama Bank', 'IDIB', 'rrb'],
  ['Tripura Gramin Bank', 'UBIN', 'rrb'],
  ['Manipur Rural Bank', 'UBIN', 'rrb'],
  ['Meghalaya Rural Bank', 'SBIN', 'rrb'],
  ['Mizoram Rural Bank', 'SBIN', 'rrb'],
  ['Nagaland Rural Bank', 'SBIN', 'rrb'],
  ['Arunachal Pradesh Rural Bank', 'SBIN', 'rrb'],
  // Co-operative banks
  ['Saraswat Co-operative Bank', 'SRCB', 'coop'],
  ['Cosmos Co-operative Bank', 'COSB', 'coop'],
  ['SVC Co-operative Bank', 'SVCB', 'coop'],
  ['Abhyudaya Co-operative Bank', 'ABHY', 'coop'],
  ['TJSB Sahakari Bank', 'TJSB', 'coop'],
  ['Janata Sahakari Bank', 'JSBP', 'coop'],
  ['Bharat Co-operative Bank', 'BCBM', 'coop'],
  ['Kalupur Commercial Co-operative Bank', 'KCCB', 'coop'],
  ['NKGSB Co-operative Bank', 'NKGS', 'coop'],
  ['Punjab & Maharashtra Co-operative Bank', 'PMCB', 'coop'],
  ['Rajasthan State Co-operative Bank', 'RSCB', 'coop'],
  ['Jaipur Central Co-operative Bank', 'RSCB', 'coop'],
  ['Mehsana Urban Co-operative Bank', 'MSNU', 'coop'],
  ['Apna Sahakari Bank', 'ASBL', 'coop'],
  ['Kerala Bank', 'KSBK', 'coop'],
  ['Gujarat State Co-operative Bank', 'GSCB', 'coop'],
  ['Maharashtra State Co-operative Bank', 'MSCI', 'coop'],
  ['Tamil Nadu State Apex Co-operative Bank', 'TNSC', 'coop'],
  // Foreign
  ['Standard Chartered Bank', 'SCBL', 'fgn'],
  ['HSBC', 'HSBC', 'fgn'],
  ['Citibank', 'CITI', 'fgn'],
  ['Deutsche Bank', 'DEUT', 'fgn'],
  ['DBS Bank India', 'DBSS', 'fgn'],
  ['Barclays Bank', 'BARC', 'fgn'],
  ['Bank of America', 'BOFA', 'fgn'],
];

/** Best matches for what the member has typed (name or IFSC prefix), at most `limit`. */
export function searchBanks(q, limit = 8) {
  const s = q.trim().toLowerCase();
  if (!s) return BANKS.slice(0, limit);
  const words = s.split(/\s+/);
  const scored = [];
  for (const b of BANKS) {
    const name = b[0].toLowerCase();
    if (b[1].toLowerCase() === s) scored.push([0, b]);
    else if (name.startsWith(s)) scored.push([1, b]);
    else if (words.every((w) => name.includes(w))) scored.push([2, b]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, b]) => b);
}
