Erros da API — Formato RFC 7807 (Problem Details)

Resumo
------
A API padroniza respostas de erro usando o formato "Problem Details" (RFC 7807). Cada resposta de erro é um objeto JSON contendo, no mínimo, os campos:

- type: URI identificando o tipo de erro (ex.: https://autocatalogo.com.br/errors/validation-error)
- title: título legível do erro (ex.: "Validation Error")
- status: código HTTP (ex.: 422)
- detail: mensagem curta descrevendo o problema
- instance: caminho da requisição que causou o erro

Validação (Zod)
---------------
Erros de validação retornam status 422 e incluem um array `errors` com detalhes por campo:

Exemplo de erro de validação (422):

{
  "type": "https://autocatalogo.com.br/errors/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "customer.email: Email inválido; customer.dealershipName: Deve ter ao menos 2 caracteres",
  "instance": "/api/v1/checkout/stripe/pix",
  "errors": [
    { "path": "customer.email", "message": "Email inválido", "code": "invalid_string" },
    { "path": "customer.dealershipName", "message": "String must contain at least 2 character(s)", "code": "too_small" }
  ]
}

Outros tipos de erro
--------------------
- 400 Bad Request — Requisição mal formada
- 401 Unauthorized — Falha de autenticação
- 403 Forbidden — Ação não permitida (RBAC / tenant isolation)
- 404 Not Found — Recurso não encontrado
- 409 Conflict — Conflito de estado (ex.: duplicidade)
- 429 Too Many Requests — Rate limit
- 500 Internal Server Error — Erro inesperado do servidor

Boas práticas
-------------
- Usar `type` estável e semântica para automatização de tratamentos de erro do cliente.
- Preencher `instance` com a rota (path) que gerou o erro.
- Fornecer uma `errors` detalhada em validações para facilitar UX nos formulários.
- Não vazar dados sensíveis no campo `detail`.
