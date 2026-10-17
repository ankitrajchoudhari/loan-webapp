// Vercel wants a non-empty output folder after a build. The API has no pages, so this writes one
// robots.txt (search engines should not index the API); every other path goes to api/index.js.
import fs from 'node:fs';

fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/robots.txt', 'User-agent: *\nDisallow: /\n');
