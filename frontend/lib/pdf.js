'use client';
// Turns a rendered part of the page into a real PDF file (A4, split across pages when long).
// The page is drawn as an image, so Hindi text looks exactly as it does on screen.
// Both libraries are loaded only when someone presses "download".

export async function downloadPdf(el, filename) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 10;
  const width = 210 - margin * 2;
  const pagePx = Math.floor(((297 - margin * 2) * canvas.width) / width);
  for (let y = 0, page = 0; y < canvas.height; y += pagePx, page++) {
    const h = Math.min(pagePx, canvas.height - y);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = h;
    slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (page) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, width, (h * width) / canvas.width);
  }
  pdf.save(`${safeName(filename)}.pdf`);
}

/** Prints only the given element (everything else on the page is hidden while printing). */
export function printOnly(el, title) {
  const oldTitle = document.title;
  el.id = 'print-one';
  document.body.classList.add('printing-one');
  if (title) document.title = safeName(title); // becomes the file name in "Save as PDF"
  const done = () => {
    document.body.classList.remove('printing-one');
    document.title = oldTitle;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

const safeName = (s) => String(s).replace(/[\/:*?"<>|]+/g, ' ').trim() || 'samiti';
