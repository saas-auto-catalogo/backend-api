export enum CircuitState {
  CLOSED = 'CLOSED',       // Operação normal (100% ou erros abaixo do limite)
  OPEN = 'OPEN',           // Circuito aberto (bloqueia chamadas para proteger o servidor)
  HALF_OPEN = 'HALF_OPEN'  // Modo de teste de recuperação
}

export interface CircuitBreakerOptions {
  failureThresholdPercentage?: number; // Padrão: 50%
  minRequests?: number;                // Padrão: 5 requisições mínimas na janela
  resetTimeoutMs?: number;             // Padrão: 5 minutos (300.000 ms)
  windowDurationMs?: number;           // Padrão: 1 minuto (60.000 ms)
  consecutiveSuccessToClose?: number;  // Padrão: 3 sucessos consecutivos em HALF_OPEN
}

interface RequestLog {
  timestamp: number;
  success: boolean;
}

export class HostCircuitBreaker {
  public readonly host: string;
  private state: CircuitState = CircuitState.CLOSED;
  private logs: RequestLog[] = [];
  private stateChangedAt: number = Date.now();
  private halfOpenSuccesses: number = 0;

  private failureThresholdPercentage: number;
  private minRequests: number;
  private resetTimeoutMs: number;
  private windowDurationMs: number;
  private consecutiveSuccessToClose: number;

  constructor(host: string, options: CircuitBreakerOptions = {}) {
    this.host = host;
    this.failureThresholdPercentage = options.failureThresholdPercentage ?? 50;
    this.minRequests = options.minRequests ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 5 * 60 * 1000;
    this.windowDurationMs = options.windowDurationMs ?? 60 * 1000;
    this.consecutiveSuccessToClose = options.consecutiveSuccessToClose ?? 3;
  }

  getState(): CircuitState {
    const now = Date.now();

    // Se estiver OPEN e já passou o tempo de reset, transiciona para HALF_OPEN
    if (this.state === CircuitState.OPEN && now - this.stateChangedAt >= this.resetTimeoutMs) {
      this.state = CircuitState.HALF_OPEN;
      this.stateChangedAt = now;
      this.halfOpenSuccesses = 0;
    }

    return this.state;
  }

  canExecute(): boolean {
    const currentState = this.getState();
    return currentState !== CircuitState.OPEN;
  }

  recordSuccess(): void {
    const now = Date.now();
    this.logs.push({ timestamp: now, success: true });
    this.cleanOldLogs(now);

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.consecutiveSuccessToClose) {
        this.state = CircuitState.CLOSED;
        this.stateChangedAt = now;
        this.halfOpenSuccesses = 0;
        this.logs = [];
      }
    }
  }

  recordFailure(): void {
    const now = Date.now();
    this.logs.push({ timestamp: now, success: false });
    this.cleanOldLogs(now);

    if (this.state === CircuitState.HALF_OPEN) {
      // Qualquer falha em teste reabre o circuito imediatamente
      this.state = CircuitState.OPEN;
      this.stateChangedAt = now;
      this.halfOpenSuccesses = 0;
      return;
    }

    if (this.state === CircuitState.CLOSED && this.logs.length >= this.minRequests) {
      const failures = this.logs.filter((l) => !l.success).length;
      const failureRate = (failures / this.logs.length) * 100;

      if (failureRate >= this.failureThresholdPercentage) {
        this.state = CircuitState.OPEN;
        this.stateChangedAt = now;
      }
    }
  }

  private cleanOldLogs(now: number): void {
    const threshold = now - this.windowDurationMs;
    this.logs = this.logs.filter((l) => l.timestamp >= threshold);
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.logs = [];
    this.stateChangedAt = Date.now();
    this.halfOpenSuccesses = 0;
  }
}

/**
 * Gerenciador centralizado de Circuit Breakers por Host de DMS
 */
export class CircuitBreakerManager {
  private static breakers: Map<string, HostCircuitBreaker> = new Map();

  static getBreaker(host: string, options?: CircuitBreakerOptions): HostCircuitBreaker {
    if (!this.breakers.has(host)) {
      this.breakers.set(host, new HostCircuitBreaker(host, options));
    }
    return this.breakers.get(host)!;
  }

  static clear(): void {
    this.breakers.clear();
  }
}
