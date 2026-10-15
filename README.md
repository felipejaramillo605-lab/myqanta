# Qanta

ERP ligero que combina finanzas, inventario, hábitos y agenda con apoyo de IA (según la descripción de su página de inicio).

> **Estado:** en desarrollo. Proyecto generado y editado con [Lovable](https://lovable.dev).

## Módulos presentes en el código

Las rutas autenticadas de `src/routes/_authenticated/` incluyen: finanzas (diario, periodos, bancos, conciliación, impuestos, presupuestos, estados financieros, activos), inventario, ventas, CRM, agenda y recordatorios, proyectos, hábitos, recursos humanos (asistencia, organigrama), documentos, reportes, aprobaciones y ajustes (empresa, equipo, roles, integraciones). También hay páginas de administración de plataforma y seguridad.

Esto describe lo que existe como pantallas; no implica que cada módulo esté completo.

## Stack

- [TanStack Start](https://tanstack.com/start) + TanStack Router y React Query, con React 19 y Vite
- Tailwind CSS 4 y componentes Radix UI
- [Supabase](https://supabase.com) como backend (`@supabase/supabase-js`; migraciones SQL en `supabase/migrations/`)
- Drizzle (`drizzle.config.ts`), Vitest para pruebas y ESLint/Prettier

## Cómo ejecutarlo

Requiere Node.js y un proyecto Supabase propio.

```bash
cp .env.example .env   # completar con los valores de tu proyecto Supabase
npm install            # también hay bun.lock si prefieres Bun
npm run dev
```

Otros scripts: `npm run build`, `npm run lint`, `npm test`.

Variables esperadas (ver `.env.example`): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` y sus equivalentes `VITE_*`. No subas el archivo `.env`; está en `.gitignore`.

## Notas

- El repositorio está conectado a Lovable: no reescribas el historial publicado.
- No declara licencia.
