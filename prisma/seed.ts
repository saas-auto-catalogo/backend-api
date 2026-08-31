import { PrismaClient, Role, WorkspaceStatus, FeedSourceType, SyncStatus, VehicleStatus, VehicleCondition, FuelType, TransmissionType, BodyStyle } from '@prisma/client';
import crypto from 'crypto';

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
  await prisma.subscription.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.adminSetting.deleteMany();

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
  const superAdmin = await prisma.user.create({
    data: {
      email: 'admin@autocatalogo.com.br',
      name: 'Super Administrador SaaS',
      passwordHash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', // hash de exemplo
      isSuperAdmin: true,
      mfaEnabled: true,
      avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150'
    }
  });

  const tenantOwner1 = await prisma.user.create({
    data: {
      email: 'carlos.silva@autoelitemotors.com.br',
      name: 'Carlos Silva',
      passwordHash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
      isSuperAdmin: false,
      mfaEnabled: false,
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'
    }
  });

  const tenantManager1 = await prisma.user.create({
    data: {
      email: 'marcos.trafego@autoelitemotors.com.br',
      name: 'Marcos Oliveira (Gestor de Tráfego)',
      passwordHash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
      isSuperAdmin: false,
      mfaEnabled: false,
      avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150'
    }
  });

  const tenantViewer1 = await prisma.user.create({
    data: {
      email: 'ana.vendas@autoelitemotors.com.br',
      name: 'Ana Paula Vendas',
      passwordHash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
      isSuperAdmin: false,
      mfaEnabled: false,
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'
    }
  });

  // 4. Criação do Workspace Principal (Tenant)
  console.log('🏢 Criando Workspace e Concessionária...');
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

  // Assinatura do Workspace
  await prisma.subscription.create({
    data: {
      workspaceId: workspace1.id,
      planTier: 'PRO',
      maxVehicles: 500,
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  // Membros do Workspace
  await prisma.workspaceMember.createMany({
    data: [
      {
        workspaceId: workspace1.id,
        userId: tenantOwner1.id,
        role: Role.OWNER
      },
      {
        workspaceId: workspace1.id,
        userId: tenantManager1.id,
        role: Role.MANAGER
      },
      {
        workspaceId: workspace1.id,
        userId: tenantViewer1.id,
        role: Role.VIEWER
      }
    ]
  });

  // Concessionária Vinculada
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

  // 5. Configuração de Feed de DMS (AutoCerto)
  console.log('📡 Criando configuração de feed de estoque (FeedConfig)...');
  const feedSalt = 'salt_autocerto_sec_99a8b7c6';
  const rawToken = 'feed_tok_autoelite_live_9f8a7b6c5d4e3f2a1';
  const tokenHash = generateFeedTokenHash(rawToken, feedSalt);

  const feedConfig1 = await prisma.feedConfig.create({
    data: {
      workspaceId: workspace1.id,
      dealershipId: dealership1.id,
      sourceType: FeedSourceType.AUTOCERTO,
      feedUrl: 'https://integracao.autocerto.com/feeds/estoque-autoelite-sp.xml',
      syncIntervalMinutes: 30,
      isActive: true,
      activeTokenHash: tokenHash,
      tokenSalt: feedSalt,
      lastSyncAt: new Date(),
      lastSyncStatus: SyncStatus.SUCCESS,
      lastSyncMessage: 'Sincronização concluída com sucesso: 7 veículos processados.'
    }
  });

  // 6. Criação de Veículos Canônicos
  console.log('🚗 Cadastrando inventário canônico de veículos...');
  const sampleVehicles = [
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
      features: ['AR_CONDICIONADO_DIGITAL', 'DIRECAO_ELETRICA', 'BANCOS_COURO', 'CAMBIO_CVT', 'PILOTO_AUTOMATICO_ADAPTATIVO', 'CENTRAL_MULTIMIDIA', 'FAROIS_FULL_LED'],
      description: 'Toyota Corolla Cross XRE 2024 em estado impecável de conservação. Único dono, todas as revisões feitas na concessionária.',
      notes: 'Laudo cautelar 100% aprovado.',
      rawPayloadHash: 'hash_corolla_cross_xre_2024_abc123',
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
      features: ['AR_CONDICIONADO_DUAL_ZONE', 'CENTRAL_MULTIMIDIA_10POL', 'BANCOS_COURO', 'SENSOR_ESTACIONAMENTO', 'CAMERA_RE', 'RODAS_LIGA_18'],
      description: 'Jeep Compass Longitude T270 2023. Motor turbo forte e econômico.',
      notes: null,
      rawPayloadHash: 'hash_jeep_compass_2023_def456',
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
      features: ['PAINEL_DIGITAL_ACTIVE_INFO_DISPLAY', 'VW_PLAY', 'FRENAGEM_AUTONOMA', 'CONTROLE_CRUZEIRO_ADAPTATIVO', 'RODAS_DIAMANTADAS_17'],
      description: 'Nivus Highline 2024 praticamente 0km, cor exclusiva Azul Biscay.',
      notes: null,
      rawPayloadHash: 'hash_vw_nivus_2024_ghi789',
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
      features: ['TRACAO_4X4_COM_REDUZIDA', 'MOTOR_V6_DIESEL', 'PAINEL_12POL_VERTICAL', 'SYNC_4', 'ASSISTENCIA_CONDUCAO_COMPLETA'],
      description: 'Nova Ford Ranger Limited V6. Força bruta aliada a tecnologia de ponta.',
      notes: null,
      rawPayloadHash: 'hash_ford_ranger_v6_2024_jkl012',
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
      features: ['KIT_M_SPORT', 'TETO_SOLAR_ELETRICO', 'CURVED_DISPLAY_BMW', 'SOM_HARMAN_KARDON', 'HEAD_UP_DISPLAY'],
      description: 'BMW 320i M Sport impecável com interior Cognac. Pacote M completo.',
      notes: null,
      rawPayloadHash: 'hash_bmw_320i_m_sport_2023_mno345',
      eligibleForMetaAds: true
    }
  ];

  for (const v of sampleVehicles) {
    await prisma.vehicle.create({ data: v });
  }

  // 7. Catálogo Meta DAA
  console.log('📦 Configurando Catálogo Meta DAA (MetaCatalog)...');
  await prisma.metaCatalog.create({
    data: {
      workspaceId: workspace1.id,
      dealershipId: dealership1.id,
      catalogName: 'Catálogo Meta Ads DAA - Auto Elite Motors',
      metaCatalogId: '456789012345678',
      feedFormat: 'XML_DAA',
      publicFeedUrl: `http://localhost:3000/api/v1/feeds/${rawToken}/meta-vehicles.xml`,
      filterRules: {
        onlyAvailable: true,
        minImagesCount: 1
      },
      totalVehiclesCount: 5,
      eligibleVehiclesCount: 5,
      lastExportAt: new Date(),
      lastExportStatus: SyncStatus.SUCCESS
    }
  });

  // 8. Histórico de Sincronização
  console.log('📊 Registrando histórico de sincronizações (SyncHistory)...');
  await prisma.syncHistory.create({
    data: {
      workspaceId: workspace1.id,
      feedConfigId: feedConfig1.id,
      status: SyncStatus.SUCCESS,
      totalIngested: 5,
      totalCreated: 5,
      totalUpdated: 0,
      totalUnchanged: 0,
      totalRemoved: 0,
      totalErrors: 0,
      durationMs: 1450,
      errorMessage: null,
      details: {
        sourceUrl: feedConfig1.feedUrl,
        ingestedCount: 5
      }
    }
  });

  // 9. Registro de Trilha de Auditoria (AuditLog)
  console.log('📝 Registrando auditoria de segurança (AuditLog)...');
  await prisma.auditLog.createMany({
    data: [
      {
        workspaceId: workspace1.id,
        actorUserId: tenantOwner1.id,
        actorEmail: tenantOwner1.email,
        action: 'WORKSPACE_INITIALIZED',
        entityName: 'Workspace',
        entityId: workspace1.id,
        ipAddress: '177.18.23.45',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        metadata: { message: 'Setup inicial do workspace Auto Elite Motors' }
      },
      {
        workspaceId: workspace1.id,
        actorUserId: tenantManager1.id,
        actorEmail: tenantManager1.email,
        action: 'FEED_CONFIGURED',
        entityName: 'FeedConfig',
        entityId: feedConfig1.id,
        ipAddress: '177.18.23.45',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        metadata: { sourceType: 'AUTOCERTO', feedUrl: feedConfig1.feedUrl }
      }
    ]
  });

  console.log('✅ Carga de seeds finalizada com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante a execução dos seeds:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
