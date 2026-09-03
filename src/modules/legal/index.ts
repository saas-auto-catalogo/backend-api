export { registerLegalRoutes } from './legal.routes.js';
export {
  legalService,
  assertMatchesCurrentDocument,
  assertRequiredAcceptances,
  persistAcceptances,
  LegalAcceptanceMismatchError,
  LegalWorkspaceForbiddenError,
  REGISTER_REQUIRED_SLUGS,
  CHECKOUT_REQUIRED_SLUGS,
} from './legal.service.js';
export { legalSyncService, applyManifest, syncFromUrl } from './legal-sync.service.js';
