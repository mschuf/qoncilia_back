# QonciliaBack - Buenas Practicas de Desarrollo

## Seguridad y autenticacion
- Usar JWT en todos los endpoints protegidos con `JwtAuthGuard`.
- Cuando el token expira, responder 401 con `code = TOKEN_EXPIRED` para que el front redirija al login con toast.
- Nunca guardar contraseñas en texto plano. Solo `bcrypt` con rounds configurables (`BCRYPT_ROUNDS`, minimo 12).
- Validar fortaleza de contraseña en registro y ABM: minimo 12 caracteres, mayuscula, minuscula, numero y simbolo.

## Modelo de roles
- Roles validos: `gestor`, `admin`, `superadmin`.
- Logica de rol:
  - Si `activo` y `isSuperAdmin` es `true` => `superadmin`.
  - Si `activo` y `isAdmin` es `true` => `admin`.
  - En cualquier otro caso => `gestor`.
- Usuarios inactivos no pueden iniciar sesion.

## Reglas ABM de usuario
- `superadmin` puede crear/editar usuarios de cualquier rol.
- `admin` solo puede crear/editar/resetear usuarios `gestor`.
- `gestor` no tiene ABM de usuarios.
- Al registrarse desde `auth/register`, el usuario siempre se crea inactivo y sin privilegios.

## Calidad de codigo
- Validar DTOs con `class-validator` y `ValidationPipe` global.
- Mantener logica de permisos en servicios (no solo en controladores).
- Centralizar conversion a usuario publico en `UsersService.toPublicUser`.
- Capturar errores de unicidad (`23505`) para mensajes claros (email/login/celular/legajo duplicados).

## Base de datos y scripts
- No usar `synchronize=true` en TypeORM.
- Mantener scripts SQL versionados y ordenados:
  1. extensiones/funciones base
  2. tablas
  3. triggers/indices
  4. seeds opcionales
- Respetar nombres de columnas `usr_*` para mantener coherencia con negocio.

