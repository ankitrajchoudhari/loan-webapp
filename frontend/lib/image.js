'use client';
// Phone photos are often 4–8 MB. Before uploading, shrink them to at most 1400 px on the long side
// (≈150–400 KB) as a JPEG — still sharp enough to read every letter on an Aadhaar or PAN card.

export async function compressPhoto(file, { maxSide = 1400, quality = 0.8 } = {}) {
  if (!file || !file.type.startsWith('image/')) throw Object.assign(new Error('photo_invalid'), { code: 'photo_invalid' });
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(Object.assign(new Error('photo_invalid'), { code: 'photo_invalid' }));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
