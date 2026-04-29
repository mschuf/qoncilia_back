# QonciliaBack

## Requisitos
- Node.js 18+
- PostgreSQL 13+

## Configuracion
1. Copiar `.env.example` a `.env` y completar credenciales.
2. Ejecutar scripts SQL en orden dentro de `sql/`.

## Ejecutar
1. `npm install`
2. `npm run start:dev`

## Endpoints principales
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /users`
- `POST /users`
- `PATCH /users/:id`
- `POST /users/:id/reset-password`
- `POST /conciliation/bank-statements/preview`
- `POST /conciliation/bank-statements`
- `GET /conciliation/bank-statements`
- `POST /conciliation/compare-bank-statement`

## Documentacion funcional
- `docs/tablas-del-proyecto.md`: diccionario de tablas y columnas.
- `docs/flujo-extractos-y-conciliacion.md`: flujo nuevo de extractos bancarios y comparacion temporal.
