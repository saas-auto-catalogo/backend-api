/**
 * Opções de configuração para execução com Exponential Backoff e Full Jitter.
 */
export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryableErrors?: (error: Error) => boolean;
  onRetry?: (attempt: number, delayMs: number, error: Error) => void;
}

/**
 * Calcula o tempo de espera utilizando Exponential Backoff com Full Jitter:
 * Delay = random(0, min(maxDelay, initialDelay * 2^attempt))
 */
export function calculateFullJitterDelay(
  attempt: number,
  initialDelayMs: number = 2000,
  maxDelayMs: number = 60000
): number {
  const exponentialDelay = initialDelayMs * Math.pow(2, attempt);
  const ceiling = Math.min(maxDelayMs, exponentialDelay);
  // Full jitter: valor aleatório uniforme entre 0 e o teto exponencial
  return Math.floor(Math.random() * ceiling);
}

/**
 * Executa uma função assíncrona com política de retries resiliente.
 */
export async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const initialDelayMs = options.initialDelayMs ?? 2000;
  const maxDelayMs = options.maxDelayMs ?? 60000;

  let lastError: Error = new Error('Operação falhou sem erro explícito.');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Se atingiu o número máximo de tentativas, não espera mais
      if (attempt >= maxAttempts - 1) {
        break;
      }

      // Verifica se o erro é elegível para retry
      if (options.retryableErrors && !options.retryableErrors(lastError)) {
        throw lastError;
      }

      const delayMs = calculateFullJitterDelay(attempt, initialDelayMs, maxDelayMs);
      if (options.onRetry) {
        options.onRetry(attempt + 1, delayMs, lastError);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
