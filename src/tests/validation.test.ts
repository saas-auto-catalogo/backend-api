import { buildServer } from '../server.js';

let totalTests = 0;
let passedTests = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${testName}`);
  } else {
    failures.push(detail ? `${testName}: ${detail}` : testName);
    console.error(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🧪 ${title}`);
  console.log('─'.repeat(60));
}

async function runValidationTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 Validation & RFC7807 Problem Details Tests              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const app = await buildServer();

  try {
    section('1. POST /api/v1/checkout/stripe/pix — missing body should return 422 Problem Details');
    const resPix = await app.inject({ method: 'POST', url: '/api/v1/checkout/stripe/pix', payload: {} });
    assert(resPix.statusCode === 422, 'Status 422 for invalid pix payload', `got ${resPix.statusCode}`);
    const bodyPix = JSON.parse(resPix.payload || '{}');
    assert(bodyPix.type && bodyPix.type.includes('validation-error'), 'Problem type indicates validation error');
    assert(bodyPix.status === 422, 'Problem status is 422');
    assert(Array.isArray(bodyPix.errors) && bodyPix.errors.length > 0, 'Errors array present in Problem Details');

    section('2. GET /api/v1/feeds/:token/meta-vehicles.xml — short token should return 422');
    const resFeed = await app.inject({ method: 'GET', url: '/api/v1/feeds/abc/meta-vehicles.xml' });
    assert(resFeed.statusCode === 422, 'Status 422 for invalid feed token', `got ${resFeed.statusCode}`);
    const bodyFeed = JSON.parse(resFeed.payload || '{}');
    assert(bodyFeed.type && bodyFeed.type.includes('validation-error'), 'Feed error type is validation-error');

    section('3. POST /api/v1/checkout/stripe/card — invalid email in customer returns 422 and points to customer.email');
    const resCard = await app.inject({ method: 'POST', url: '/api/v1/checkout/stripe/card', payload: {
      plan: 'PRO',
      billingInterval: 'MONTHLY',
      customer: { dealershipName: 'X', document: '123456', email: 'not-an-email', phone: '1234567' }
    }});
    assert(resCard.statusCode === 422, 'Status 422 for invalid email in card payload', `got ${resCard.statusCode}`);
    const bodyCard = JSON.parse(resCard.payload || '{}');
    const emailError = (bodyCard.errors || []).find((e: any) => e.path === 'customer.email');
    assert(!!emailError, 'Validation errors include customer.email');

    // Summary
    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 RESULT');
    console.log('═'.repeat(60));
    console.log(`  Total tests: ${totalTests}`);
    console.log(`  ✅ Passed:    ${passedTests}`);
    console.log(`  ❌ Failed:    ${failures.length}`);

    if (failures.length > 0) {
      console.log('\n🔴 Failures:');
      failures.forEach(f => console.log(`  - ${f}`));
      process.exit(1);
    }

  } finally {
    await app.close();
  }
}

runValidationTests().catch((err) => {
  console.error('\n💥 Error running validation tests:', err);
  process.exit(1);
});
