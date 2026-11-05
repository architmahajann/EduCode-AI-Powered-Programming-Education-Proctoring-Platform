# Educode

### AI-powered programming education and proctoring platform

Educode is a secure, real-time coding classroom for teaching, practice, timed assessments, submissions, and browser-based proctoring. Teachers create password-protected rooms; students join with a room ID; and the platform provides live collaboration, snapshots, static code feedback, and optional AI-assisted coaching.

[![Django](https://img.shields.io/badge/API-Django%20REST-092E20?logo=django)](apps/api-django)
[![React](https://img.shields.io/badge/Web-React%20%2B%20Vite-61DAFB?logo=react&logoColor=111)](apps/web-react)
[![Node.js](https://img.shields.io/badge/Legacy-Express-339933?logo=node.js&logoColor=fff)](apps/legacy-node)

> **Status:** The Django + React stack is the primary application. The Express application and historical integrations remain available during migration.

## Features

- Live coding rooms with teacher and student roles
- Practice and timed test sessions with question banks
- Password-hashed room access and short-lived signed room tokens
- Student submissions, teacher grading, and PDF evaluation reports
- Browser camera snapshots and WebRTC signaling
- Local code analysis with optional OpenAI enhancement
- PostgreSQL support for production and SQLite for local development
- Configurable CORS, host allowlists, throttling, upload limits, and secure headers

## Architecture

```text
apps/
  api-django/       Django REST API, persistence, room authorization, AI integrations
  web-react/        React/Vite browser client
  legacy-node/      Express/EJS application retained during migration
legacy/
  proctoring/       Historical services and browser-extension variants
docs/
  architecture.md   Runtime boundaries and migration notes
```

The current frontend talks to Django at `http://localhost:8000/api` by default. See [the architecture guide](docs/architecture.md) for boundaries and migration context.

## Requirements

- Node.js 20 or newer
- Python 3.11 or newer
- Git
- PostgreSQL 14+ for production (optional locally)
- MongoDB only for the legacy Express application

## Quick start

### 1. Clone and install

```powershell
git clone https://github.com/architmahajann/Educode-AI-Powered-Programming-Education-Proctoring-Platform.git
cd Educode-AI-Powered-Programming-Education-Proctoring-Platform
npm install
cd apps\web-react
npm install
cd ..\api-django
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Configure the Django API

```powershell
Copy-Item .env.example .env
```

Generate a strong value for `DJANGO_SECRET_KEY`, then edit `.env`:

```dotenv
DJANGO_SECRET_KEY=replace-with-a-long-random-secret
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

Never commit `.env`. The repository ignores environment files, SQLite databases, media uploads, logs, and generated dependencies.

### 3. Run the primary stack

Open three PowerShell terminals from the repository root:

```powershell
npm run start:api
npm run start:web
```

Open `http://localhost:5173`.

For the legacy application, configure `apps\legacy-node\.env` with `JWT_SECRET`, `MONGO_DB_URI`, and any provider settings, then run:

```powershell
npm run start:legacy
```

## API security

The API is designed so secrets stay server-side:

- Room passwords are stored as Django password hashes; plaintext passwords are never returned.
- Creating or joining a room returns a short-lived HMAC-signed `X-Room-Token`.
- Room reads, question changes, submissions, snapshots, grading, and reports require the appropriate room token.
- Teacher-only resources reject student tokens.
- Production startup fails without `DJANGO_SECRET_KEY` and rejects wildcard hosts.
- CORS is allowlisted; anonymous requests are throttled; request bodies and image uploads are size-limited.
- Security headers, secure cookies, HSTS, content sniffing protection, and clickjacking protection are enabled for production.
- The legacy API requires its short-lived JWT cookie or bearer token for room data and proctoring endpoints.
- Image upload IDs are validated before filesystem paths are constructed.

For production, use HTTPS, a managed secret store, PostgreSQL, object storage for media, a reverse proxy, and restricted network access. Rotate secrets if they are ever exposed. Do not put OpenAI, MongoDB, database, or JWT secrets in React/Vite environment variables because browser variables are public.

## API overview

Base URL: `http://localhost:8000/api`

| Method | Endpoint | Access |
|---|---|---|
| `GET` | `/health/` | Public health check |
| `POST` | `/rooms/` | Creates a teacher room and returns `access_token` |
| `POST` | `/rooms/{id}/join/` | Password join; returns a student `access_token` |
| `GET` | `/rooms/{id}/random_question/` | Room token |
| `POST` | `/submissions/` | Student or teacher room token |
| `GET` | `/submissions/?room={id}` | Teacher room token |
| `PATCH` | `/submissions/{id}/` | Teacher room token |
| `GET` | `/submissions/{id}/report/` | Teacher room token |
| `POST` | `/rooms/{id}/snapshots/` | Student or teacher room token |
| `GET` | `/rooms/{id}/snapshots/` | Teacher room token |
| `POST` | `/ai/explain/` and `/ai/evaluate/` | Throttled API access |

Send room credentials as:

```http
X-Room-Token: <access_token>
```

## Testing and build

```powershell
npm run build:web
cd apps\api-django
python manage.py check
```

## Privacy and responsible use

Proctoring captures audio/video-related browser permissions and assessment events. Deploy only with informed consent, a clear retention policy, access controls, and compliance with applicable privacy and education regulations. Educode is not a substitute for institutional security or legal review.

## Contributing

1. Create a feature branch.
2. Keep secrets and generated files out of commits.
3. Add or update tests for behavior changes.
4. Run the web build and Django checks.
5. Open a pull request describing security and migration impact.

## License

Add the project license before distributing this software. Until then, all rights remain with the copyright holder.
