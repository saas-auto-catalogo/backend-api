export { registerLegalRoutes } from './legal.routes.js';
export {
  legalService,
  assertMatchesCurrentDocument,
  LegalAcceptanceMismatchError,
  LegalWorkspaceForbiddenError,
} from './legal.service.js';
export { legalSyncService, applyManifest, syncFromUrl } from './legal-sync.service.js';
