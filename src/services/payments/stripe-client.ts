import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;
let testStripeOverride: Stripe | null | undefined;

export function isStripeMockMode(): boolean {
  if (process.env.STRIPE_MOCK === 'true') {
    return true;
  }
  if (process.env.NODE_ENV === 'test') {
    return true;
  }
  return !process.env.STRIPE_SECRET_KEY;
}

export function getStripeClient(): Stripe {
  if (testStripeOverride !== undefined) {
    if (testStripeOverride === null) {
      throw new Error('Stripe client not configured for tests');
    }
    return testStripeOverride;
  }

  if (isStripeMockMode()) {
    throw new Error('Stripe client unavailable in mock mode');
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-08-26.dahlia',
    });
  }

  return stripeInstance;
}

/** Allows tests to inject a mock Stripe client. Pass `null` to reset to default behavior. */
export function setStripeClientForTests(client: Stripe | null | undefined): void {
  testStripeOverride = client;
  if (client === null) {
    stripeInstance = null;
  }
}

export function resetStripeClientForTests(): void {
  testStripeOverride = undefined;
  stripeInstance = null;
}
