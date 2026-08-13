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

  constructor(message: string, status = 400, code = 'bad_request', cause?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    /*
     * A causa original fica pendurada aqui, sem nunca ir para a resposta.
     *
     * O cliente recebe "Não foi possível conectar ao banco de dados"; quem
     * precisa do motivo real (ER_ACCESS_DENIED_ERROR, ER_BAD_DB_ERROR…) é o
     * log e o `diagnostico.js`, e é daqui que eles leem.
     */
    if (cause !== undefined) this.cause = cause;
  }
}

/** Aborta a requisição com um erro de API (mesma assinatura do json_error do PHP). */
export function fail(message: string, status = 400, code = 'bad_request', cause?: unknown): never {
  throw new ApiError(message, status, code, cause);
}
