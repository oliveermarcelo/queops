/**
 * Adaptador de handler assíncrono.
 *
 * O Express 4 não captura rejeição de promessa: um `await` que falha dentro do
 * handler viraria requisição pendurada até o timeout, sem nada no log. `h()`
 * encaminha a falha para o middleware de erro, que é quem sabe transformar
 * `ApiError` em resposta e o resto em 500.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function h(
  fn: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
