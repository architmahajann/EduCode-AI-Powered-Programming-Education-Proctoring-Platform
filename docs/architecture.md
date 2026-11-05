# Educode production structure

Educode is organized as a monorepo with independently deployable applications.

```text
apps/
  api-django/       Django REST API and domain models
  web-react/        React/Vite user interface
  legacy-node/      Existing Express/EJS app during migration
legacy/
  proctoring/       Historical proctoring services and browser extensions
docs/
  architecture.md
  demo-assets/
```

## Runtime boundaries

- `apps/api-django` owns the new REST API, persistence, authentication boundary, and AI integrations.
- Its proctoring API stores camera snapshots under media/object storage and records exam events.
- `apps/web-react` owns the new browser client and communicates with Django through `VITE_API_URL`.
- `apps/legacy-node` remains isolated and runnable while features are migrated. Its internal relative imports remain unchanged.
- `legacy/proctoring` contains historical variants that are not production entry points.

## Commands

From the repository root:

```powershell
npm run start:api
npm run start:web
npm run start:legacy
npm run build:web
```

Secrets belong in local environment files or a deployment secret manager. Do not commit `.env` files.
