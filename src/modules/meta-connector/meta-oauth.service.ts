import crypto from 'crypto';

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  apiVersion?: string;
}

export interface OAuthTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresInSeconds?: number;
}

const DEFAULT_SCOPES = [
  'catalog_management',
  'ads_management',
  'business_management',
  'public_profile'
];

/**
 * Serviço de Autenticação OAuth 2.0 para o Facebook / Meta Login for Business.
 */
export class MetaOAuthService {
  private appId: string;
  private appSecret: string;
  private apiVersion: string;

  constructor(config?: Partial<MetaOAuthConfig>) {
    this.appId = config?.appId || process.env.META_APP_ID || 'mock-meta-app-id';
    this.appSecret = config?.appSecret || process.env.META_APP_SECRET || 'mock-meta-app-secret';
    this.apiVersion = config?.apiVersion || 'v21.0';
  }

  /**
   * Gera a URL de autorização OAuth com proteção CSRF assinada via HMAC.
   */
  generateAuthorizationUrl(
    workspaceId: string,
    redirectUri: string,
    additionalScopes: string[] = []
  ): { url: string; state: string } {
    const scopes = Array.from(new Set([...DEFAULT_SCOPES, ...additionalScopes])).join(',');
    const timestamp = Date.now();
    const payload = `${workspaceId}:${timestamp}`;
    const signature = crypto.createHmac('sha256', this.appSecret).update(payload).digest('hex');
    const state = Buffer.from(JSON.stringify({ workspaceId, timestamp, signature })).toString('base64url');

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: 'code',
      state
    });

    const url = `https://www.facebook.com/${this.apiVersion}/dialog/oauth?${params.toString()}`;
    return { url, state };
  }

  /**
   * Valida o parâmetro state para prevenir ataques CSRF.
   */
  verifyState(state: string): { isValid: boolean; workspaceId?: string } {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
      const { workspaceId, timestamp, signature } = decoded;

      // Validação de expiração (máximo 15 minutos)
      if (Date.now() - timestamp > 15 * 60 * 1000) {
        return { isValid: false };
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.appSecret)
        .update(`${workspaceId}:${timestamp}`)
        .digest('hex');

      if (signature !== expectedSignature) {
        return { isValid: false };
      }

      return { isValid: true, workspaceId };
    } catch {
      return { isValid: false };
    }
  }

  /**
   * Troca o código de autorização temporário por um token de acesso de curta duração.
   */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: redirectUri,
      code
    });

    const url = `https://graph.facebook.com/${this.apiVersion}/oauth/access_token?${params.toString()}`;

    const response = await fetch(url, { method: 'GET' });
    const data: any = await response.json();

    if (!response.ok || data.error) {
      throw new Error(`Erro OAuth Meta (${data.error?.code || response.status}): ${data.error?.message || 'Falha ao trocar código por token'}`);
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || 'bearer',
      expiresInSeconds: data.expires_in
    };
  }

  /**
   * Troca um token de curta duração por um token de longa duração (60 dias).
   */
  async exchangeForLongLivedToken(shortLivedToken: string): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: shortLivedToken
    });

    const url = `https://graph.facebook.com/${this.apiVersion}/oauth/access_token?${params.toString()}`;

    const response = await fetch(url, { method: 'GET' });
    const data: any = await response.json();

    if (!response.ok || data.error) {
      throw new Error(`Erro ao gerar Long-Lived Token (${data.error?.code || response.status}): ${data.error?.message || 'Falha na renovação'}`);
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || 'bearer',
      expiresInSeconds: data.expires_in || 60 * 24 * 60 * 60 // 60 dias
    };
  }

  /**
   * Emite um token de sessão temporário (30 min) assinado via HMAC contendo
   * workspaceId e o access token de longa duração, para uso na etapa de
   * seleção/criação de catálogo sem expor o token da Meta ao cliente.
   */
  generateMetaSessionToken(workspaceId: string, accessToken: string): string {
    const timestamp = Date.now();
    const payload = { workspaceId, accessToken, timestamp };
    const signature = crypto
      .createHmac('sha256', this.appSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return Buffer.from(JSON.stringify({ ...payload, signature })).toString('base64url');
  }

  /**
   * Valida e decodifica um token de sessão Meta. Retorna o workspaceId e o
   * access token apenas se a assinatura for válida e o token não tiver expirado.
   */
  verifyMetaSessionToken(token: string): {
    isValid: boolean;
    workspaceId?: string;
    accessToken?: string;
  } {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'));
      const { workspaceId, accessToken, timestamp, signature } = decoded;

      if (Date.now() - timestamp > 30 * 60 * 1000) {
        return { isValid: false };
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.appSecret)
        .update(JSON.stringify({ workspaceId, accessToken, timestamp }))
        .digest('hex');

      if (signature !== expectedSignature) {
        return { isValid: false };
      }

      return { isValid: true, workspaceId, accessToken };
    } catch {
      return { isValid: false };
    }
  }
}
