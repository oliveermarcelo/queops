/**
 * Erro de API com status e código — o equivalente ao `json_error()` do PHP.
 *
 * No PHP, `json_error()` respondia e encerrava a requisição com `exit`. Em
 * Node não existe esse corte, então a mesma semântica vem de lançar: qualquer
 * função pode abortar o fluxo, e o middleware de erro do Express monta a
 * resposta `{ error: { code, message } }` com o status certo.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'bad_request') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Aborta a requisição com um erro de API (mesma assinatura do json_error do PHP). */
export function fail(message: string, status = 400, code = 'bad_request'): never {
  throw new ApiError(message, status, code);
}
