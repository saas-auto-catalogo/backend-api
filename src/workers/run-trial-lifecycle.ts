import 'dotenv/config';
import { validateEnv } from '../config/env.js';
import { trialLifecycleService } from '../modules/billing/trial-lifecycle.service.js';

validateEnv();

async function main() {
  const result = await trialLifecycleService.runTrialLifecycle();
  console.log('[TrialLifecycle] Concluído:', result);
  process.exit(0);
}

main().catch((err) => {
  console.error('[TrialLifecycle] Falhou:', err);
  process.exit(1);
});
