import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { useDatabaseName } from '../adapters/storage/db';

let n = 0;
beforeEach(() => {
  // Her test temiz bir veritabanıyla başlar.
  useDatabaseName(`nexlearn-test-${Date.now()}-${n++}`);
});
