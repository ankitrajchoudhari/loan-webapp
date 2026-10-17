// Empties the practice database and fills it with fresh sample data. Never touches live records.
import { wipeTestData, seedTestData } from '../src/lib/sample.js';
import { disconnectAll, testEnvAvailable } from '../src/lib/db.js';

if (!testEnvAvailable()) {
  console.error('TEST_DATABASE_URL is not set (or points at the live database).');
  process.exit(1);
}
await wipeTestData();
console.log('Practice data reset:', await seedTestData());
await disconnectAll();
