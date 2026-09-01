import { buildServer } from '../../server.js';

async function runCheckoutTests() {
  console.log('🧪 Iniciando testes de Checkout Transparente Stripe (Pix e Cartão)...');
  const server = await buildServer();

  try {
    // 1. Teste de Criação de Pix no Stripe
    const pixResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/checkout/stripe/pix',
      payload: {
        plan: 'PRO',
        billingInterval: 'MONTHLY',
        customer: {
          dealershipName: 'Saga Prime Seminovos',
          document: '12.345.678/0001-90',
          email: 'financeiro@sagaprime.com.br',
          phone: '(11) 98765-4321',
        },
      },
    });

    if (pixResponse.statusCode !== 201) {
      throw new Error(`Falha no Pix: ${pixResponse.statusCode} - ${pixResponse.body}`);
    }

    const pixData = JSON.parse(pixResponse.body);
    console.log(`✅ [POST /checkout/stripe/pix] 201 Created`);
    console.log(`   - PaymentIntent: ${pixData.paymentIntentId}`);
    console.log(`   - Valor: R$ ${(pixData.amount / 100).toFixed(2)}`);
    console.log(`   - QR Code gerado: ${pixData.qrCodeUrl.substring(0, 40)}...`);

    // 2. Teste de Assinatura de Cartão de Crédito no Stripe
    const cardResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/checkout/stripe/card',
      payload: {
        plan: 'PRO',
        billingInterval: 'YEARLY',
        customer: {
          dealershipName: 'Saga Prime Seminovos',
          document: '12.345.678/0001-90',
          email: 'financeiro@sagaprime.com.br',
          phone: '(11) 98765-4321',
        },
        cardToken: 'tok_visa',
      },
    });

    if (cardResponse.statusCode !== 201) {
      throw new Error(`Falha no Cartão: ${cardResponse.statusCode} - ${cardResponse.body}`);
    }

    const cardData = JSON.parse(cardResponse.body);
    console.log(`✅ [POST /checkout/stripe/card] 201 Created`);
    console.log(`   - Subscription: ${cardData.subscriptionId}`);
    console.log(`   - Customer: ${cardData.customerId}`);
    console.log(`   - Status: ${cardData.status}`);

    // 3. Teste de Webhook Stripe
    const webhookResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/webhooks/stripe',
      payload: {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: pixData.paymentIntentId,
            status: 'succeeded',
          },
        },
      },
    });

    if (webhookResponse.statusCode !== 200) {
      throw new Error(`Falha no Webhook: ${webhookResponse.statusCode} - ${webhookResponse.body}`);
    }

    console.log(`✅ [POST /webhooks/stripe] 200 OK | Processado.`);
    console.log(`\n🎉 Todos os testes de Checkout Stripe foram concluídos com 100% de sucesso!\n`);
  } finally {
    await server.close();
  }
}

runCheckoutTests().catch((err) => {
  console.error('❌ Erro no teste de checkout:', err);
  process.exit(1);
});
