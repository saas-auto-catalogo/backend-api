import 'dotenv/config';
import { validateEnv } from '../config/env.js';
import { legalSyncService } from '../modules/legal/legal-sync.service.js';

validateEnv();

async function main() {
  const result = await legalSyncService.syncFromUrl();
  console.log('[LegalSync] Concluído:', result);
  process.exit(0);
}

main().catch((err) => {
  console.error('[LegalSync] Falhou:', err);
  process.exit(1);
});
