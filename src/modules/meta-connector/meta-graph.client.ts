export interface MetaBusinessAccount {
  id: string;
  name: string;
  verificationStatus?: string;
}

export interface MetaCatalogItem {
  id: string;
  name: string;
  vertical?: string;
  productCount?: number;
  feedCount?: number;
}

export interface CatalogDiagnosticIssue {
  vehicleId?: string;
  field?: string;
  errorCode: string;
  message: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  affectedCount: number;
}

export interface CatalogDiagnosticsReport {
  catalogId: string;
  totalProducts: number;
  eligibleProducts: number;
  rejectedProducts: number;
  healthScorePercentage: number;
  issues: CatalogDiagnosticIssue[];
  checkedAt: string;
}

/**
 * Cliente HTTP tipado para a Meta Graph API v21.0.
 */
export class MetaGraphApiClient {
  private apiVersion: string;
  private baseUrl: string;

  constructor(apiVersion: string = 'v21.0') {
    this.apiVersion = apiVersion;
    this.baseUrl = `https://graph.facebook.com/${apiVersion}`;
  }

  private async request<T>(endpoint: string, accessToken: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });
    const data: any = await response.json();

    if (!response.ok || data.error) {
      const code = data.error?.code || response.status;
      const message = data.error?.message || response.statusText;
      throw new Error(`[MetaGraphApi:${code}] ${message}`);
    }

    return data as T;
  }

  /**
   * Obtém as contas de Business Manager pertencentes ao usuário autenticado.
   */
  async getBusinesses(accessToken: string): Promise<MetaBusinessAccount[]> {
    const res = await this.request<{ data: any[] }>('/me/businesses?fields=id,name,verification_status', accessToken);
    return (res.data || []).map((b) => ({
      id: b.id,
      name: b.name,
      verificationStatus: b.verification_status
    }));
  }

  /**
   * Obtém os catálogos associados a uma conta de Business Manager.
   */
  async getOwnedCatalogs(businessId: string, accessToken: string): Promise<MetaCatalogItem[]> {
    const res = await this.request<{ data: any[] }>(
      `/${businessId}/owned_product_catalogs?fields=id,name,vertical,product_count,feed_count`,
      accessToken
    );

    return (res.data || []).map((c) => ({
      id: c.id,
      name: c.name,
      vertical: c.vertical,
      productCount: c.product_count,
      feedCount: c.feed_count
    }));
  }

  /**
   * Cria programaticamente um novo catálogo de veículos (Automotive Inventory) na Meta.
   */
  async createVehicleCatalog(businessId: string, catalogName: string, accessToken: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(`/${businessId}/owned_product_catalogs`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        name: catalogName,
        vertical: 'vehicles'
      })
    });
  }

  /**
   * Consulta os diagnósticos e status de rejeições de produtos do catálogo na Meta.
   */
  async getCatalogDiagnostics(catalogId: string, accessToken: string): Promise<CatalogDiagnosticsReport> {
    try {
      const res = await this.request<{ data: any[]; summary?: any }>(
        `/${catalogId}/diagnostics?fields=affected_features,error_code,message,severity,number_of_affected_entities`,
        accessToken
      );

      const issues: CatalogDiagnosticIssue[] = (res.data || []).map((item) => ({
        errorCode: item.error_code || 'CATALOG_ERROR',
        message: item.message || 'Erro não especificado na ingestão do item',
        severity: item.severity === 'FATAL' || item.severity === 'ERROR' ? 'ERROR' : 'WARNING',
        affectedCount: item.number_of_affected_entities || 1
      }));

      const total = res.summary?.total_entities || 0;
      const rejected = issues.filter((i) => i.severity === 'ERROR').reduce((acc, i) => acc + i.affectedCount, 0);
      const eligible = Math.max(0, total - rejected);
      const healthScore = total > 0 ? Math.round((eligible / total) * 100) : 100;

      return {
        catalogId,
        totalProducts: total,
        eligibleProducts: eligible,
        rejectedProducts: rejected,
        healthScorePercentage: healthScore,
        issues,
        checkedAt: new Date().toISOString()
      };
    } catch {
      // Fallback gracioso se o endpoint de diagnósticos não estiver disponível
      return {
        catalogId,
        totalProducts: 0,
        eligibleProducts: 0,
        rejectedProducts: 0,
        healthScorePercentage: 100,
        issues: [],
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Dispara sob demanda o re-processamento do feed XML no Meta Ads Manager.
   */
  async triggerFeedUpload(feedId: string, accessToken: string): Promise<{ id: string; status: string }> {
    return this.request<{ id: string; status: string }>(`/${feedId}/uploads`, accessToken, {
      method: 'POST'
    });
  }
}
