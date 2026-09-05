import { PrismaClient, Role, WorkspaceStatus, FeedSourceType, SyncStatus, VehicleStatus, VehicleCondition, FuelType, TransmissionType, BodyStyle } from '@prisma/client';
import crypto from 'crypto';
import { legalSyncService } from '../src/modules/legal/legal-sync.service.js';

const prisma = new PrismaClient();

function generateFeedTokenHash(rawToken: string, salt: string): string {
  return crypto.createHmac('sha256', salt).update(rawToken).digest('hex');
}

async function main() {
  console.log('🌱 Iniciando carga de seeds no banco de dados...');

  // 1. Limpeza de tabelas na ordem correta
  console.log('🧹 Limpando dados anteriores...');
  await prisma.auditLog.deleteMany();
  await prisma.syncHistory.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.metaCatalog.deleteMany();
  await prisma.feedConfig.deleteMany();
  await prisma.dealership.deleteMany();
  await prisma.checkoutProvision.deleteMany();
  await prisma.stripeWebhookEvent.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.legalAcceptance.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.adminSetting.deleteMany();

  // 1b. Documentos jurídicos vigentes (manifesto oficial legal-docs)
  console.log('📜 Sincronizando documentos jurídicos vigentes...');
  const legalSync = await legalSyncService.syncFromUrl();
  console.log(`   → ${legalSync.upserted} documentos: ${legalSync.currentSlugs.join(', ')}`);

  // 2. Criação de Configurações Administrativas Globais
  console.log('⚙️ Criando configurações globais (AdminSettings)...');
  await prisma.adminSetting.createMany({
    data: [
      {
        key: 'META_API_VERSION',
        value: 'v21.0',
        valueType: 'STRING',
        description: 'Versão da Meta Graph API utilizada nas integrações de catálogo',
        isPublic: true
      },
      {
        key: 'DEFAULT_FEED_SYNC_INTERVAL_MINUTES',
        value: '60',
        valueType: 'NUMBER',
        description: 'Intervalo padrão de sincronização de feeds de estoque em minutos',
        isPublic: false
      },
      {
        key: 'MAX_FEED_FILE_SIZE_MB',
        value: '100',
        valueType: 'NUMBER',
        description: 'Tamanho máximo suportado para streaming de arquivos XML de feeds',
        isPublic: false
      },
      {
        key: 'SYSTEM_MAINTENANCE_MODE',
        value: 'false',
        valueType: 'BOOLEAN',
        description: 'Flag global para ativação do modo de manutenção na plataforma',
        isPublic: true
      }
    ]
  });

  // 3. Criação de Usuários Base
  console.log('👤 Criando usuários do sistema...');

  // Super Admin
  const superAdmin = await prisma.user.create({
    data: {
      email: 'admin@drivesync.me',
      name: 'Super Administrador SaaS',
      passwordHash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
      isSuperAdmin: true,
      mfaEnabled: true,
      avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
      onboardingCompleted: true,
      onboardingStep: 4,
    }
  });

  // System user for Stripe webhook audit logs (Issue #50)
  await prisma.user.create({
    data: {
      email: 'stripe-webhook@system.internal',
      name: 'Stripe Webhook System',
      passwordHash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
      isSuperAdmin: true,
      onboardingCompleted: true,
      onboardingStep: 4,
    },
  });

  // Usuários do Workspace 1 (Auto Elite Motors - Plano PRO)
  const owner1 = await prisma.user.create({
    data: {
      email: 'carlos.silva@autoelitemotors.com.br',
      name: 'Carlos Silva',
      passwordHash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
      isSuperAdmin: false,
      mfaEnabled: false,
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      onboardingCompleted: true,
      onboardingStep: 4,
    }
  });

  const manager1 = await prisma.user.create({
    data: {
      email: 'marcos.trafego@autoelitemotors.com.br',
      name: 'Marcos Oliveira',
      passwordHash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
      isSuperAdmin: false,
      mfaEnabled: false,
      avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
      onboardingCompleted: true,
      onboardingStep: 4,
    }
  });

  const viewer1 = await prisma.user.create({
    data: {
      email: 'ana.vendas@autoelitemotors.com.br',
      name: 'Ana Paula Vendas',
      passwordHash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
      isSuperAdmin: false,
      mfaEnabled: false,
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      onboardingCompleted: true,
      onboardingStep: 4,
    }
  });

  // Usuários do Workspace 2 (JR Casa Seminovos - Plano STARTER)
  const owner2 = await prisma.user.create({
    data: {
      email: 'roberto.junior@jrcaseminovos.com.br',
      name: 'Roberto Junior',
      passwordHash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
      isSuperAdmin: false,
      mfaEnabled: false,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      onboardingCompleted: true,
      onboardingStep: 4,
    }
  });

  const manager2 = await prisma.user.create({
    data: {
      email: 'fernanda.marketing@jrcaseminovos.com.br',
      name: 'Fernanda Lima',
      passwordHash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
      isSuperAdmin: false,
      mfaEnabled: false,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      onboardingCompleted: true,
      onboardingStep: 4,
    }
  });

  // ============================================================================
  // 4. WORKSPACE 1: Auto Elite Motors (Plano PRO - 500 Veículos)
  // ============================================================================
  console.log('🏢 Criando Workspace 1 (Auto Elite Motors - PRO)...');
  const workspace1 = await prisma.workspace.create({
    data: {
      name: 'Auto Elite Motors',
      slug: 'auto-elite-motors',
      cnpj: '12.345.678/0001-90',
      phone: '(11) 98888-7777',
      city: 'São Paulo',
      state: 'SP',
      status: WorkspaceStatus.ACTIVE
    }
  });

  await prisma.subscription.create({
    data: {
      workspaceId: workspace1.id,
      planTier: 'PRO',
      maxVehicles: 200,
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      stripeCustomerId: 'cus_seed_auto_elite',
      stripeSubscriptionId: 'sub_seed_auto_elite',
    }
  });

  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: workspace1.id, userId: owner1.id, role: Role.OWNER },
      { workspaceId: workspace1.id, userId: manager1.id, role: Role.MANAGER },
      { workspaceId: workspace1.id, userId: viewer1.id, role: Role.VIEWER }
    ]
  });

  const dealership1 = await prisma.dealership.create({
    data: {
      workspaceId: workspace1.id,
      tradeName: 'Auto Elite Motors - Matriz Jardins',
      legalName: 'Auto Elite Comércio de Veículos Ltda',
      cnpj: '12.345.678/0001-90',
      phone: '(11) 3000-5000',
      email: 'contato@autoelitemotors.com.br',
      address: 'Avenida Europa, 1200 - Jardins',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01449-001',
      websiteUrl: 'https://autoelitemotors.com.br',
      logoUrl: 'https://autoelitemotors.com.br/assets/logo.png',
      metaBusinessId: '987654321012345',
      metaCatalogId: '456789012345678',
      isActive: true
    }
  });

  const feedSalt1 = 'salt_autocerto_sec_99a8b7c6';
  const rawToken1 = 'feed_tok_autoelite_live_9f8a7b6c5d4e3f2a1';
  const tokenHash1 = generateFeedTokenHash(rawToken1, feedSalt1);

  const feedConfig1 = await prisma.feedConfig.create({
    data: {
      workspaceId: workspace1.id,
      dealershipId: dealership1.id,
      sourceType: FeedSourceType.AUTOCERTO,
      feedUrl: 'https://integracao.autocerto.com/feeds/estoque-autoelite-sp.xml',
      syncIntervalMinutes: 30,
      isActive: true,
      activeTokenHash: tokenHash1,
      tokenSalt: feedSalt1,
      lastSyncAt: new Date(),
      lastSyncStatus: SyncStatus.SUCCESS,
      lastSyncMessage: 'Sincronização concluída com sucesso: 10 veículos processados.'
    }
  });

  // 10 Veículos para Workspace 1
  const vehiclesWs1 = [
    {
      workspaceId: workspace1.id,
      feedConfigId: feedConfig1.id,
      dealershipId: dealership1.id,
      externalId: 'AUTO-2024-001',
      vin: '9BRBL48E9N2145892',
      licensePlate: 'ABC1D23',
      stockNumber: 'EST-8812',
      make: 'Toyota',
      model: 'Corolla Cross',
      version: 'XRE 2.0 16V Flex Aut.',
      title: 'Toyota Corolla Cross XRE 2.0 Flex 2024 Branco',
      bodyStyle: BodyStyle.SUV,
      manufactureYear: 2023,
      modelYear: 2024,
      doors: 4,
      exteriorColor: 'Branco Pérola',
      interiorColor: 'Preto Couro',
      mileage: 12500,
      fuelType: FuelType.FLEX,
      transmission: TransmissionType.CVT,
      engineSize: '2.0',
      drivetrain: 'FWD',
      armored: false,
      price: 168900.00,
      promotionalPrice: 164900.00,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia de fábrica até Maio/2028',
      canonicalUrl: 'https://autoelitemotors.com.br/veiculos/toyota-corolla-cross-xre-2024',
      heroImageUrl: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800',
      images: [
        { url: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800', fullUrl: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=1600', order: 0, isPrimary: true },
        { url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800', fullUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=1600', order: 1, isPrimary: false }
      ],
      features: ['AR_CONDICIONADO_DIGITAL', 'DIRECAO_ELETRICA', 'BANCOS_COURO', 'CAMBIO_CVT', 'PILOTO_AUTOMATICO_ADAPTATIVO'],
      description: 'Toyota Corolla Cross XRE 2024 em estado impecável de conservação. Único dono.',
      notes: 'Laudo cautelar 100% aprovado.',
      rawPayloadHash: 'hash_corolla_cross_xre_2024_001',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace1.id,
      feedConfigId: feedConfig1.id,
      dealershipId: dealership1.id,
      externalId: 'AUTO-2024-002',
      vin: '93YFB48D9P8129031',
      licensePlate: 'XYZ9E87',
      stockNumber: 'EST-8813',
      make: 'Jeep',
      model: 'Compass',
      version: 'Longitude 1.3 T270 Turbo Flex Aut.',
      title: 'Jeep Compass Longitude 1.3 Turbo Flex 2023 Cinza',
      bodyStyle: BodyStyle.SUV,
      manufactureYear: 2023,
      modelYear: 2023,
      doors: 4,
      exteriorColor: 'Cinza Sting',
      interiorColor: 'Preto',
      mileage: 28000,
      fuelType: FuelType.FLEX,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '1.3 Turbo T270',
      drivetrain: 'FWD',
      armored: false,
      price: 154500.00,
      promotionalPrice: null,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia de 1 ano mecânica e câmbio',
      canonicalUrl: 'https://autoelitemotors.com.br/veiculos/jeep-compass-longitude-2023',
      heroImageUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800',
      images: [
        { url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800', fullUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=1600', order: 0, isPrimary: true }
      ],
      features: ['AR_CONDICIONADO_DUAL_ZONE', 'CENTRAL_MULTIMIDIA_10POL', 'BANCOS_COURO', 'RODAS_LIGA_18'],
      description: 'Jeep Compass Longitude T270 2023. Motor turbo potente e econômico.',
      notes: null,
      rawPayloadHash: 'hash_jeep_compass_2023_002',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace1.id,
      feedConfigId: feedConfig1.id,
      dealershipId: dealership1.id,
      externalId: 'AUTO-2024-003',
      vin: '9BWDB48E9M1100234',
      licensePlate: 'BRA2E19',
      stockNumber: 'EST-8814',
      make: 'Volkswagen',
      model: 'Nivus',
      version: 'Highline 1.0 200 TSI Flex Aut.',
      title: 'Volkswagen Nivus Highline 1.0 TSI Flex 2024 Azul',
      bodyStyle: BodyStyle.SUV,
      manufactureYear: 2024,
      modelYear: 2024,
      doors: 4,
      exteriorColor: 'Azul Biscay',
      interiorColor: 'Preto / Cinza',
      mileage: 8900,
      fuelType: FuelType.FLEX,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '1.0 TSI',
      drivetrain: 'FWD',
      armored: false,
      price: 138000.00,
      promotionalPrice: 134900.00,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia de fábrica até 2027',
      canonicalUrl: 'https://autoelitemotors.com.br/veiculos/volkswagen-nivus-highline-2024',
      heroImageUrl: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800',
      images: [
        { url: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800', fullUrl: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=1600', order: 0, isPrimary: true }
      ],
      features: ['PAINEL_DIGITAL_ACTIVE_INFO_DISPLAY', 'VW_PLAY', 'FRENAGEM_AUTONOMA'],
      description: 'Nivus Highline 2024 praticamente 0km, cor exclusiva Azul Biscay.',
      notes: null,
      rawPayloadHash: 'hash_vw_nivus_2024_003',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace1.id,
      feedConfigId: feedConfig1.id,
      dealershipId: dealership1.id,
      externalId: 'AUTO-2024-004',
      vin: '8AFAR22EXN6543210',
      licensePlate: 'FOR4D44',
      stockNumber: 'EST-8815',
      make: 'Ford',
      model: 'Ranger',
      version: 'Limited 3.0 V6 4WD Diesel Aut.',
      title: 'Ford Ranger Limited 3.0 V6 Diesel 4x4 2024 Preto',
      bodyStyle: BodyStyle.PICKUP,
      manufactureYear: 2023,
      modelYear: 2024,
      doors: 4,
      exteriorColor: 'Preto Gales',
      interiorColor: 'Couro Premium',
      mileage: 18400,
      fuelType: FuelType.DIESEL,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '3.0 V6',
      drivetrain: '4WD',
      armored: false,
      price: 319990.00,
      promotionalPrice: null,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia total de 5 anos Ford',
      canonicalUrl: 'https://autoelitemotors.com.br/veiculos/ford-ranger-limited-v6-2024',
      heroImageUrl: 'https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=800',
      images: [
        { url: 'https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=800', fullUrl: 'https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=1600', order: 0, isPrimary: true }
      ],
      features: ['TRACAO_4X4_COM_REDUZIDA', 'MOTOR_V6_DIESEL', 'PAINEL_12POL_VERTICAL', 'SYNC_4'],
      description: 'Nova Ford Ranger Limited V6. Força bruta e tecnologia de ponta.',
      notes: null,
      rawPayloadHash: 'hash_ford_ranger_v6_2024_004',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace1.id,
      feedConfigId: feedConfig1.id,
      dealershipId: dealership1.id,
      externalId: 'AUTO-2024-005',
      vin: '93K3A5A3XP7788990',
      licensePlate: 'BMW3I20',
      stockNumber: 'EST-8816',
      make: 'BMW',
      model: '320i',
      version: 'M Sport 2.0 Turbo ActiveFlex Aut.',
      title: 'BMW 320i M Sport 2.0 Turbo Flex 2023 Branco',
      bodyStyle: BodyStyle.SEDAN,
      manufactureYear: 2023,
      modelYear: 2023,
      doors: 4,
      exteriorColor: 'Branco Alpino',
      interiorColor: 'Couro Cognac',
      mileage: 21000,
      fuelType: FuelType.FLEX,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '2.0 TwinPower Turbo',
      drivetrain: 'RWD',
      armored: false,
      price: 289000.00,
      promotionalPrice: 279900.00,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia BMW Premium Selection',
      canonicalUrl: 'https://autoelitemotors.com.br/veiculos/bmw-320i-m-sport-2023',
      heroImageUrl: 'https://images.unsplash.com/photo-1555353540-64580b51c258?w=800',
      images: [
        { url: 'https://images.unsplash.com/photo-1555353540-64580b51c258?w=800', fullUrl: 'https://images.unsplash.com/photo-1555353540-64580b51c258?w=1600', order: 0, isPrimary: true }
      ],
      features: ['KIT_M_SPORT', 'TETO_SOLAR_ELETRICO', 'CURVED_DISPLAY_BMW', 'SOM_HARMAN_KARDON'],
      description: 'BMW 320i M Sport impecável com interior Cognac. Pacote M completo.',
      notes: null,
      rawPayloadHash: 'hash_bmw_320i_m_sport_2023_005',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace1.id,
      feedConfigId: feedConfig1.id,
      dealershipId: dealership1.id,
      externalId: 'AUTO-2024-006',
      vin: '8AJBA3CD4P1298450',
      licensePlate: 'TOY9H88',
      stockNumber: 'EST-8817',
      make: 'Toyota',
      model: 'Hilux',
      version: 'SRX Plus 2.8 4x4 Diesel Aut.',
      title: 'Toyota Hilux SRX Plus 2.8 Diesel 4x4 2024 Prata',
      bodyStyle: BodyStyle.PICKUP,
      manufactureYear: 2024,
      modelYear: 2024,
      doors: 4,
      exteriorColor: 'Prata Névoa',
      interiorColor: 'Preto Couro',
      mileage: 6200,
      fuelType: FuelType.DIESEL,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '2.8 Turbo Diesel',
      drivetrain: '4WD',
      armored: false,
      price: 334990.00,
      promotionalPrice: null,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia total Toyota 5 anos',
      canonicalUrl: 'https://autoelitemotors.com.br/veiculos/toyota-hilux-srx-plus-2024',
      heroImageUrl: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800', fullUrl: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=1600', order: 0, isPrimary: true }],
      features: ['TRACAO_4X4', 'SISTEMA_JBL', 'TOYOTA_SAFETY_SENSE'],
      description: 'Hilux SRX Plus com bitolas alargadas e suspensão esportiva.',
      notes: null,
      rawPayloadHash: 'hash_toyota_hilux_2024_006',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace1.id,
      feedConfigId: feedConfig1.id,
      dealershipId: dealership1.id,
      externalId: 'AUTO-2024-007',
      vin: 'WP0AB2A99NS228811',
      licensePlate: 'POR9I11',
      stockNumber: 'EST-8818',
      make: 'Porsche',
      model: '911',
      version: 'Carrera S 3.0 Biturbo PDK',
      title: 'Porsche 911 Carrera S 3.0 Biturbo 2023 Amarelo Racing',
      bodyStyle: BodyStyle.COUPE,
      manufactureYear: 2023,
      modelYear: 2023,
      doors: 2,
      exteriorColor: 'Amarelo Racing',
      interiorColor: 'Couro Preto e Costuras Amarelas',
      mileage: 4100,
      fuelType: FuelType.GASOLINA,
      transmission: TransmissionType.DUPLA_EMBREAGEM,
      engineSize: '3.0 Boxer Biturbo',
      drivetrain: 'RWD',
      armored: false,
      price: 1180000.00,
      promotionalPrice: null,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Porsche Approved até 2025',
      canonicalUrl: 'https://autoelitemotors.com.br/veiculos/porsche-911-carrera-s-2023',
      heroImageUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800', fullUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1600', order: 0, isPrimary: true }],
      features: ['ESCAPAMENTO_ESPORTIVO', 'SPORT_CHRONO', 'RODAS_RS_SPYDER'],
      description: 'Ícone esportivo com pacote Sport Chrono e escape esportivo.',
      notes: 'Veículo de colecionador.',
      rawPayloadHash: 'hash_porsche_911_2023_007',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace1.id,
      feedConfigId: feedConfig1.id,
      dealershipId: dealership1.id,
      externalId: 'AUTO-2024-008',
      vin: 'WAUZZZFY8R2019283',
      licensePlate: 'AUD5Q50',
      stockNumber: 'EST-8819',
      make: 'Audi',
      model: 'Q5',
      version: 'Performance 2.0 TFSIe S-Tronic Quattro Híbrido',
      title: 'Audi Q5 Performance 2.0 TFSIe Quattro 2024 Cinza',
      bodyStyle: BodyStyle.SUV,
      manufactureYear: 2024,
      modelYear: 2024,
      doors: 4,
      exteriorColor: 'Cinza Daytona',
      interiorColor: 'Preto',
      mileage: 11200,
      fuelType: FuelType.HIBRIDO_PLUG_IN,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '2.0 TFSIe',
      drivetrain: 'AWD',
      armored: false,
      price: 389900.00,
      promotionalPrice: 379900.00,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia Audi Brasil',
      canonicalUrl: 'https://autoelitemotors.com.br/veiculos/audi-q5-performance-2024',
      heroImageUrl: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800', fullUrl: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1600', order: 0, isPrimary: true }],
      features: ['TRACAO_QUATTRO', 'TETO_PANORAMICO', 'FAROIS_MATRIX_LED'],
      description: 'Híbrido plug-in com autonomia elétrica urbana excelente.',
      notes: null,
      rawPayloadHash: 'hash_audi_q5_2024_008',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace1.id,
      feedConfigId: feedConfig1.id,
      dealershipId: dealership1.id,
      externalId: 'AUTO-2024-009',
      vin: '9BGC19N08PG119022',
      licensePlate: 'CHE1T20',
      stockNumber: 'EST-8820',
      make: 'Chevrolet',
      model: 'Tracker',
      version: 'Premier 1.2 Turbo Flex Aut.',
      title: 'Chevrolet Tracker Premier 1.2 Turbo 2023 Vermelho',
      bodyStyle: BodyStyle.SUV,
      manufactureYear: 2023,
      modelYear: 2023,
      doors: 4,
      exteriorColor: 'Vermelho Chili',
      interiorColor: 'Preto / Azul',
      mileage: 31000,
      fuelType: FuelType.FLEX,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '1.2 Turbo',
      drivetrain: 'FWD',
      armored: false,
      price: 119900.00,
      promotionalPrice: 116900.00,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia de 1 ano',
      canonicalUrl: 'https://autoelitemotors.com.br/veiculos/chevrolet-tracker-premier-2023',
      heroImageUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800', fullUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1600', order: 0, isPrimary: true }],
      features: ['TETO_PANORAMICO_ELETRICO', 'ALERTA_COLISAO_FRONTAL', 'ESTACIONAMENTO_AUTOMATICO'],
      description: 'Versão topo de linha Premier com teto panorâmico.',
      notes: null,
      rawPayloadHash: 'hash_chevy_tracker_2023_009',
      eligibleForMetaAds: false,
      validationWarnings: ['Preço inválido, ausente ou sob consulta (inelegível para Meta DAA).']
    },
    {
      workspaceId: workspace1.id,
      feedConfigId: feedConfig1.id,
      dealershipId: dealership1.id,
      externalId: 'AUTO-2024-010',
      vin: '9BHBH81CBPP449911',
      licensePlate: 'HYU2C30',
      stockNumber: 'EST-8821',
      make: 'Hyundai',
      model: 'Creta',
      version: 'Ultimate 2.0 Flex Aut.',
      title: 'Hyundai Creta Ultimate 2.0 Flex 2024 Prata',
      bodyStyle: BodyStyle.SUV,
      manufactureYear: 2024,
      modelYear: 2024,
      doors: 4,
      exteriorColor: 'Prata Sand',
      interiorColor: 'Marrom / Bege',
      mileage: 14500,
      fuelType: FuelType.FLEX,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '2.0 Smartstream',
      drivetrain: 'FWD',
      armored: false,
      price: 159900.00,
      promotionalPrice: null,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia Hyundai 5 anos',
      canonicalUrl: 'https://autoelitemotors.com.br/veiculos/hyundai-creta-ultimate-2024',
      heroImageUrl: '',
      images: [],
      features: ['CAMERAS_360', 'VENTILACAO_BANCO_MOTORISTA', 'SMARTSENSE_PILOTO_ADAPTATIVO'],
      description: 'Creta Ultimate com acabamento refinado e motor 2.0 aspirado.',
      notes: 'Sem foto principal no DMS',
      rawPayloadHash: 'hash_hyundai_creta_2024_010',
      eligibleForMetaAds: false,
      validationWarnings: ['Veículo sem foto principal cadastrada no XML do integrador.']
    }
  ];

  for (const v of vehiclesWs1) {
    await prisma.vehicle.create({ data: v });
  }

  await prisma.metaCatalog.create({
    data: {
      workspaceId: workspace1.id,
      dealershipId: dealership1.id,
      catalogName: 'Catálogo Meta Ads DAA - Auto Elite Motors',
      metaCatalogId: '456789012345678',
      feedFormat: 'XML_DAA',
      publicFeedUrl: `http://localhost:3000/api/v1/feeds/${rawToken1}/meta-vehicles.xml`,
      filterRules: { onlyAvailable: true, minImagesCount: 1 },
      totalVehiclesCount: 10,
      eligibleVehiclesCount: 8,
      lastExportAt: new Date(),
      lastExportStatus: SyncStatus.SUCCESS
    }
  });

  await prisma.syncHistory.create({
    data: {
      workspaceId: workspace1.id,
      feedConfigId: feedConfig1.id,
      status: SyncStatus.SUCCESS,
      totalIngested: 10,
      totalCreated: 10,
      totalUpdated: 0,
      totalUnchanged: 0,
      totalRemoved: 0,
      totalErrors: 0,
      durationMs: 1650,
      details: { sourceUrl: feedConfig1.feedUrl, ingestedCount: 10 }
    }
  });

  // ============================================================================
  // 5. WORKSPACE 2: JR Casa Seminovos (Plano STARTER - 100 Veículos)
  // ============================================================================
  console.log('🏢 Criando Workspace 2 (JR Casa Seminovos - STARTER)...');
  const workspace2 = await prisma.workspace.create({
    data: {
      name: 'JR Casa Seminovos',
      slug: 'jr-casa-seminovos',
      cnpj: '98.765.432/0001-10',
      phone: '(19) 3888-9900',
      city: 'Campinas',
      state: 'SP',
      status: WorkspaceStatus.ACTIVE
    }
  });

  await prisma.subscription.create({
    data: {
      workspaceId: workspace2.id,
      planTier: 'STARTER',
      maxVehicles: 50,
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: workspace2.id, userId: owner2.id, role: Role.OWNER },
      { workspaceId: workspace2.id, userId: manager2.id, role: Role.MANAGER }
    ]
  });

  const dealership2 = await prisma.dealership.create({
    data: {
      workspaceId: workspace2.id,
      tradeName: 'JR Casa Seminovos - Loja Principal',
      legalName: 'JR Casa Multimarcas Ltda',
      cnpj: '98.765.432/0001-10',
      phone: '(19) 3888-9900',
      email: 'contato@jrcaseminovos.com.br',
      address: 'Avenida José de Souza Campos, 850 - Nova Campinas',
      city: 'Campinas',
      state: 'SP',
      postalCode: '13025-320',
      websiteUrl: 'https://jrcaseminovos.com.br',
      logoUrl: 'https://jrcaseminovos.com.br/assets/logo.png',
      metaBusinessId: '123456789098765',
      metaCatalogId: '987654321098765',
      isActive: true
    }
  });

  const feedSalt2 = 'salt_spice_digital_99bc88a1';
  const rawToken2 = 'feed_tok_jrcasa_live_8a7b6c5d4e3f2a1b';
  const tokenHash2 = generateFeedTokenHash(rawToken2, feedSalt2);

  const feedConfig2 = await prisma.feedConfig.create({
    data: {
      workspaceId: workspace2.id,
      dealershipId: dealership2.id,
      sourceType: FeedSourceType.SPICE_DIGITAL,
      feedUrl: 'https://www.jrcaseminovos.com.br/api/vehicles',
      syncIntervalMinutes: 60,
      isActive: true,
      activeTokenHash: tokenHash2,
      tokenSalt: feedSalt2,
      lastSyncAt: new Date(),
      lastSyncStatus: SyncStatus.SUCCESS,
      lastSyncMessage: 'Sincronização Spice Digital concluída: 10 veículos processados.'
    }
  });

  // 10 Veículos para Workspace 2
  const vehiclesWs2 = [
    {
      workspaceId: workspace2.id,
      feedConfigId: feedConfig2.id,
      dealershipId: dealership2.id,
      externalId: 'JR-104692',
      vin: 'LGXCE4C89P0192837',
      licensePlate: 'BYD1D01',
      stockNumber: 'JR-501',
      make: 'BYD',
      model: 'Dolphin',
      version: 'GS EV 100% Elétrico',
      title: 'BYD Dolphin GS Elétrico 2024 Branco',
      bodyStyle: BodyStyle.HATCHBACK,
      manufactureYear: 2024,
      modelYear: 2024,
      doors: 4,
      exteriorColor: 'Branco Dolphin',
      interiorColor: 'Cinza / Azul',
      mileage: 5200,
      fuelType: FuelType.ELETRICO,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '95cv Elétrico',
      drivetrain: 'FWD',
      armored: false,
      price: 139900.00,
      promotionalPrice: 134900.00,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia de bateria BYD 8 anos',
      canonicalUrl: 'https://jrcaseminovos.com.br/veiculos/byd-dolphin-ev-2024',
      heroImageUrl: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800', fullUrl: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=1600', order: 0, isPrimary: true }],
      features: ['100_POR_CENTO_ELETRICO', 'TELA_GIRATORIA_12POL', 'PILOTO_AUTOMATICO'],
      description: 'BYD Dolphin seminovo, economia máxima e garantia de bateria ativa.',
      notes: null,
      rawPayloadHash: 'hash_byd_dolphin_2024_001',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace2.id,
      feedConfigId: feedConfig2.id,
      dealershipId: dealership2.id,
      externalId: 'JR-105846',
      vin: 'LGXCF4C80P0283746',
      licensePlate: 'BYD2K02',
      stockNumber: 'JR-502',
      make: 'BYD',
      model: 'King',
      version: 'GS 1.5 16V DM-i Híbrido Plug-in Aut.',
      title: 'BYD King GS 1.5 DM-i Híbrido 2025 Preto',
      bodyStyle: BodyStyle.SEDAN,
      manufactureYear: 2024,
      modelYear: 2025,
      doors: 4,
      exteriorColor: 'Preto Obsidian',
      interiorColor: 'Caramelo',
      mileage: 3800,
      fuelType: FuelType.HIBRIDO_PLUG_IN,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '1.5 DM-i',
      drivetrain: 'FWD',
      armored: false,
      price: 169990.00,
      promotionalPrice: null,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia total BYD',
      canonicalUrl: 'https://jrcaseminovos.com.br/veiculos/byd-king-gs-2025',
      heroImageUrl: 'https://images.unsplash.com/photo-1550355291-bbee04a92027?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1550355291-bbee04a92027?w=800', fullUrl: 'https://images.unsplash.com/photo-1550355291-bbee04a92027?w=1600', order: 0, isPrimary: true }],
      features: ['HIBRIDO_PLUG_IN_1200KM_AUTONOMIA', 'PAINEL_DIGITAL', 'BANCOS_ELETRICOS'],
      description: 'Sedan híbrido plug-in com autonomia total de até 1.200 km.',
      notes: null,
      rawPayloadHash: 'hash_byd_king_2025_002',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace2.id,
      feedConfigId: feedConfig2.id,
      dealershipId: dealership2.id,
      externalId: 'JR-103577',
      vin: 'LGXCH4C81P0394857',
      licensePlate: 'BYD3S03',
      stockNumber: 'JR-503',
      make: 'BYD',
      model: 'Song Plus',
      version: '1.5 DM-i Híbrido Plug-in Aut.',
      title: 'BYD Song Plus DM-i 1.5 Híbrido 2024 Prata',
      bodyStyle: BodyStyle.SUV,
      manufactureYear: 2023,
      modelYear: 2024,
      doors: 4,
      exteriorColor: 'Prata Time',
      interiorColor: 'Cinza / Laranja',
      mileage: 16200,
      fuelType: FuelType.HIBRIDO_PLUG_IN,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '1.5 DM-i Híbrido',
      drivetrain: 'FWD',
      armored: false,
      price: 209900.00,
      promotionalPrice: 204900.00,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia total BYD',
      canonicalUrl: 'https://jrcaseminovos.com.br/veiculos/byd-song-plus-2024',
      heroImageUrl: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=800', fullUrl: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=1600', order: 0, isPrimary: true }],
      features: ['TETO_SOLAR_PANORAMICO', 'SISTEMA_SOM_INFINITY', 'ADAS_COMPLETO'],
      description: 'SUV híbrido plug-in espaçoso, econômico e potente.',
      notes: null,
      rawPayloadHash: 'hash_byd_song_plus_2024_003',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace2.id,
      feedConfigId: feedConfig2.id,
      dealershipId: dealership2.id,
      externalId: 'JR-104380',
      vin: '9BGKS69H0PG120934',
      licensePlate: 'ONX4P04',
      stockNumber: 'JR-504',
      make: 'Chevrolet',
      model: 'Onix Plus',
      version: 'Premier 1.0 Turbo Flex Aut.',
      title: 'Chevrolet Onix Plus Premier 1.0 Turbo 2023 Prata',
      bodyStyle: BodyStyle.SEDAN,
      manufactureYear: 2023,
      modelYear: 2023,
      doors: 4,
      exteriorColor: 'Prata Switchblade',
      interiorColor: 'Preto / Caramelo',
      mileage: 34500,
      fuelType: FuelType.FLEX,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '1.0 Turbo',
      drivetrain: 'FWD',
      armored: false,
      price: 93900.00,
      promotionalPrice: 89900.00,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia de 1 ano JR Casa',
      canonicalUrl: 'https://jrcaseminovos.com.br/veiculos/chevrolet-onix-plus-premier-2023',
      heroImageUrl: 'https://images.unsplash.com/photo-1590362891988-f778047831d0?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1590362891988-f778047831d0?w=800', fullUrl: 'https://images.unsplash.com/photo-1590362891988-f778047831d0?w=1600', order: 0, isPrimary: true }],
      features: ['MYLINK_SEM_FIO', 'CARREGADOR_INDUCAO', 'SENSOR_PONTO_CEGO'],
      description: 'Onix Plus Premier top de linha, único dono e IPVA 2024 pago.',
      notes: null,
      rawPayloadHash: 'hash_onix_plus_2023_004',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace2.id,
      feedConfigId: feedConfig2.id,
      dealershipId: dealership2.id,
      externalId: 'JR-105120',
      vin: '9BWAA4BZ9RP012938',
      licensePlate: 'POL5T05',
      stockNumber: 'JR-505',
      make: 'Volkswagen',
      model: 'Polo Track',
      version: '1.0 MPI Flex Manual',
      title: 'Volkswagen Polo Track 1.0 Flex 2024 Branco',
      bodyStyle: BodyStyle.HATCHBACK,
      manufactureYear: 2024,
      modelYear: 2024,
      doors: 4,
      exteriorColor: 'Branco Cristal',
      interiorColor: 'Preto Tecido',
      mileage: 18000,
      fuelType: FuelType.FLEX,
      transmission: TransmissionType.MANUAL,
      engineSize: '1.0 MPI',
      drivetrain: 'FWD',
      armored: false,
      price: 74900.00,
      promotionalPrice: null,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia de fábrica VW',
      canonicalUrl: 'https://jrcaseminovos.com.br/veiculos/vw-polo-track-2024',
      heroImageUrl: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800', fullUrl: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=1600', order: 0, isPrimary: true }],
      features: ['AR_CONDICIONADO', 'DIRECAO_ELETRICA', 'CONTROLE_ESTABILIDADE'],
      description: 'Polo Track seminovo, robusto e extremamente econômico.',
      notes: null,
      rawPayloadHash: 'hash_vw_polo_track_2024_005',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace2.id,
      feedConfigId: feedConfig2.id,
      dealershipId: dealership2.id,
      externalId: 'JR-106430',
      vin: '9BHBG41CBPP019283',
      licensePlate: 'HB20H06',
      stockNumber: 'JR-506',
      make: 'Hyundai',
      model: 'HB20',
      version: 'Comfort Plus 1.0 Turbo TGDI Flex Aut.',
      title: 'Hyundai HB20 Comfort Plus 1.0 Turbo 2024 Cinza',
      bodyStyle: BodyStyle.HATCHBACK,
      manufactureYear: 2023,
      modelYear: 2024,
      doors: 4,
      exteriorColor: 'Cinza Silk',
      interiorColor: 'Preto',
      mileage: 22000,
      fuelType: FuelType.FLEX,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '1.0 TGDI Turbo',
      drivetrain: 'FWD',
      armored: false,
      price: 88900.00,
      promotionalPrice: 86500.00,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia de fábrica 5 anos Hyundai',
      canonicalUrl: 'https://jrcaseminovos.com.br/veiculos/hyundai-hb20-turbo-2024',
      heroImageUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800', fullUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=1600', order: 0, isPrimary: true }],
      features: ['CAMBIO_AUTOMATICO_6M', 'CENTRAL_8POL', 'CAMERA_RE'],
      description: 'HB20 turbo automático em excelente estado de conservação.',
      notes: null,
      rawPayloadHash: 'hash_hyundai_hb20_2024_006',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace2.id,
      feedConfigId: feedConfig2.id,
      dealershipId: dealership2.id,
      externalId: 'JR-107890',
      vin: '93YFB48D5P8392019',
      licensePlate: 'JEE7R07',
      stockNumber: 'JR-507',
      make: 'Jeep',
      model: 'Renegade',
      version: 'Sport 1.3 Turbo Flex Aut.',
      title: 'Jeep Renegade Sport 1.3 Turbo 2023 Preto',
      bodyStyle: BodyStyle.SUV,
      manufactureYear: 2023,
      modelYear: 2023,
      doors: 4,
      exteriorColor: 'Preto Carbon',
      interiorColor: 'Preto',
      mileage: 29500,
      fuelType: FuelType.FLEX,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '1.3 Turbo T270',
      drivetrain: 'FWD',
      armored: false,
      price: 99900.00,
      promotionalPrice: null,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia de 1 ano',
      canonicalUrl: 'https://jrcaseminovos.com.br/veiculos/jeep-renegade-sport-2023',
      heroImageUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800', fullUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=1600', order: 0, isPrimary: true }],
      features: ['MOTOR_T270_185CV', 'FRENAGEM_AUTONOMA', 'FAROIS_FULL_LED'],
      description: 'Renegade com motor turbo forte de 185cv e segurança ativa.',
      notes: null,
      rawPayloadHash: 'hash_jeep_renegade_2023_007',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace2.id,
      feedConfigId: feedConfig2.id,
      dealershipId: dealership2.id,
      externalId: 'JR-108340',
      vin: '93HFC1670MZ192837',
      licensePlate: 'CIV8T08',
      stockNumber: 'JR-508',
      make: 'Honda',
      model: 'Civic',
      version: 'Touring 1.5 Turbo Gasolina CVT',
      title: 'Honda Civic Touring 1.5 Turbo 2021 Branco',
      bodyStyle: BodyStyle.SEDAN,
      manufactureYear: 2020,
      modelYear: 2021,
      doors: 4,
      exteriorColor: 'Branco Topázio',
      interiorColor: 'Cinza Claro',
      mileage: 48000,
      fuelType: FuelType.GASOLINA,
      transmission: TransmissionType.CVT,
      engineSize: '1.5 Turbo',
      drivetrain: 'FWD',
      armored: false,
      price: 139900.00,
      promotionalPrice: 136900.00,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.USADO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia JR Casa 1 ano',
      canonicalUrl: 'https://jrcaseminovos.com.br/veiculos/honda-civic-touring-2021',
      heroImageUrl: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800', fullUrl: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=1600', order: 0, isPrimary: true }],
      features: ['TETO_SOLAR', 'SISTEMA_SOM_PREMIUM_450W', 'LANEWATCH_CAMERA'],
      description: 'Civic Touring G10, clássico moderno em raro estado de conservação.',
      notes: null,
      rawPayloadHash: 'hash_honda_civic_2021_008',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace2.id,
      feedConfigId: feedConfig2.id,
      dealershipId: dealership2.id,
      externalId: 'JR-109210',
      vin: '9BWDB42G5NP029384',
      licensePlate: 'TCX9C09',
      stockNumber: 'JR-509',
      make: 'Volkswagen',
      model: 'T-Cross',
      version: 'Comfortline 200 TSI Flex Aut.',
      title: 'Volkswagen T-Cross Comfortline 1.0 TSI 2023 Prata',
      bodyStyle: BodyStyle.SUV,
      manufactureYear: 2023,
      modelYear: 2023,
      doors: 4,
      exteriorColor: 'Prata Pyrit',
      interiorColor: 'Preto',
      mileage: 32000,
      fuelType: FuelType.FLEX,
      transmission: TransmissionType.AUTOMATICO,
      engineSize: '1.0 200 TSI',
      drivetrain: 'FWD',
      armored: false,
      price: 118900.00,
      promotionalPrice: null,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia de 1 ano',
      canonicalUrl: 'https://jrcaseminovos.com.br/veiculos/vw-t-cross-comfortline-2023',
      heroImageUrl: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800', fullUrl: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=1600', order: 0, isPrimary: true }],
      features: ['PAINEL_DIGITAL_8POL', 'VW_PLAY', 'CLIMATRONIC_DIGITAL'],
      description: 'SUV campeão de vendas com conforto e segurança comprovados.',
      notes: null,
      rawPayloadHash: 'hash_vw_tcross_2023_009',
      eligibleForMetaAds: true
    },
    {
      workspaceId: workspace2.id,
      feedConfigId: feedConfig2.id,
      dealershipId: dealership2.id,
      externalId: 'JR-110050',
      vin: '9BD376B17PP039485',
      licensePlate: 'FAS0F10',
      stockNumber: 'JR-510',
      make: 'Fiat',
      model: 'Fastback',
      version: 'Audace 1.0 Turbo Flex Aut.',
      title: 'Fiat Fastback Audace 1.0 Turbo 2023 Cinza',
      bodyStyle: BodyStyle.SUV,
      manufactureYear: 2023,
      modelYear: 2023,
      doors: 4,
      exteriorColor: 'Cinza Silverstone',
      interiorColor: 'Preto',
      mileage: 26000,
      fuelType: FuelType.FLEX,
      transmission: TransmissionType.CVT,
      engineSize: '1.0 Turbo T200',
      drivetrain: 'FWD',
      armored: false,
      price: 112900.00,
      promotionalPrice: 109900.00,
      currency: 'BRL',
      priceOnRequest: false,
      condition: VehicleCondition.SEMINOVO,
      status: VehicleStatus.AVAILABLE,
      hasWarranty: true,
      warrantyDetails: 'Garantia de 1 ano',
      canonicalUrl: 'https://jrcaseminovos.com.br/veiculos/fiat-fastback-audace-2023',
      heroImageUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800',
      images: [{ url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800', fullUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1600', order: 0, isPrimary: true }],
      features: ['PORTA_MALAS_600L', 'FREIO_ESTACIONAMENTO_ELETRICO', 'FRENAGEM_AUTONOMA'],
      description: 'SUV Coupé com o maior porta-malas da categoria (600 litros).',
      notes: null,
      rawPayloadHash: 'hash_fiat_fastback_2023_010',
      eligibleForMetaAds: true
    }
  ];

  for (const v of vehiclesWs2) {
    await prisma.vehicle.create({ data: v });
  }

  await prisma.metaCatalog.create({
    data: {
      workspaceId: workspace2.id,
      dealershipId: dealership2.id,
      catalogName: 'Catálogo Meta Ads DAA - JR Casa Seminovos',
      metaCatalogId: '987654321098765',
      feedFormat: 'XML_DAA',
      publicFeedUrl: `http://localhost:3000/api/v1/feeds/${rawToken2}/meta-vehicles.xml`,
      filterRules: { onlyAvailable: true, minImagesCount: 1 },
      totalVehiclesCount: 10,
      eligibleVehiclesCount: 10,
      lastExportAt: new Date(),
      lastExportStatus: SyncStatus.SUCCESS
    }
  });

  await prisma.syncHistory.create({
    data: {
      workspaceId: workspace2.id,
      feedConfigId: feedConfig2.id,
      status: SyncStatus.SUCCESS,
      totalIngested: 10,
      totalCreated: 10,
      totalUpdated: 0,
      totalUnchanged: 0,
      totalRemoved: 0,
      totalErrors: 0,
      durationMs: 1200,
      details: { sourceUrl: feedConfig2.feedUrl, ingestedCount: 10 }
    }
  });

  // 6. Auditoria de Segurança Inicial
  console.log('📝 Registrando auditoria de segurança (AuditLog)...');
  await prisma.auditLog.createMany({
    data: [
      {
        workspaceId: workspace1.id,
        actorUserId: superAdmin.id,
        actorEmail: superAdmin.email,
        action: 'SUPER_ADMIN_INITIALIZED',
        entityName: 'User',
        entityId: superAdmin.id,
        ipAddress: '127.0.0.1',
        userAgent: 'AutoCatalogo Seed Generator v1.0',
        metadata: { message: 'Setup inicial de usuário Super Administrador' }
      },
      {
        workspaceId: workspace1.id,
        actorUserId: owner1.id,
        actorEmail: owner1.email,
        action: 'WORKSPACE_INITIALIZED',
        entityName: 'Workspace',
        entityId: workspace1.id,
        ipAddress: '177.18.23.45',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        metadata: { message: 'Setup inicial do workspace Auto Elite Motors (PRO)' }
      },
      {
        workspaceId: workspace2.id,
        actorUserId: owner2.id,
        actorEmail: owner2.email,
        action: 'WORKSPACE_INITIALIZED',
        entityName: 'Workspace',
        entityId: workspace2.id,
        ipAddress: '189.44.12.90',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        metadata: { message: 'Setup inicial do workspace JR Casa Seminovos (STARTER)' }
      },
      {
        workspaceId: workspace1.id,
        actorUserId: owner1.id,
        actorEmail: owner1.email,
        action: 'FEED_SYNC_COMPLETED',
        entityName: 'FeedConfig',
        entityId: feedConfig1.id,
        ipAddress: '177.18.23.45',
        userAgent: 'AutoCatalogo Sync Worker',
        metadata: { message: 'Sincronização DMS concluída com 10 veículos ingestados', durationMs: 1650 }
      },
      {
        workspaceId: workspace1.id,
        actorUserId: manager1.id,
        actorEmail: manager1.email,
        action: 'VEHICLE_UPDATED',
        entityName: 'Vehicle',
        entityId: null,
        ipAddress: '177.18.23.45',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        metadata: { message: 'Preço promocional atualizado no Mercedes GLC 300' }
      },
      {
        workspaceId: workspace1.id,
        actorUserId: owner1.id,
        actorEmail: owner1.email,
        action: 'PRICE_CHANGED',
        entityName: 'Vehicle',
        entityId: null,
        ipAddress: '177.18.23.45',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        metadata: { message: 'Mercedes GLC 300: R$ 489.700 → R$ 479.900' }
      }
    ]
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Carga de seeds finalizada com 100% de sucesso!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Resumo da carga:');
  console.log('  - 1 Super Admin (admin@drivesync.me)');
  console.log('  - 2 Workspaces (Auto Elite Motors [PRO], JR Casa Seminovos [STARTER])');
  console.log('  - 5 Usuários de Tenant (Owners, Managers, Viewers)');
  console.log('  - 2 Concessionárias e 2 FeedConfigs');
  console.log('  - 20 Veículos canônicos completos (10 por workspace)');
  console.log('  - 2 Catálogos Meta DAA e Históricos de Sincronização');
  console.log('  - Documentos jurídicos vigentes sincronizados do manifesto legal-docs');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante a execução dos seeds:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
