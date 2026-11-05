# Educode architecture migration

The migration starts in parallel so the existing Express application remains available while Django and React reach feature parity.

## Run the Django API

```powershell
cd apps/api-django
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python manage.py migrate
.\.venv\Scripts\python -m daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

The API health check is `GET http://localhost:8000/api/health/`.

## Run the React frontend

```powershell
cd apps/web-react
npm install
npm run dev
```

Set `VITE_API_URL` when the API is not at `http://localhost:8000/api`.

## Proctoring

The React lab provides camera/microphone activation, a five-second snapshot capture loop during an active camera session, and visibility-change/tab-switch alerts. Teachers can enter the live room from the dashboard and see the latest uploaded snapshots. Browser camera and microphone permission must be granted by each student.

## AI

`POST /api/ai/explain/` accepts `{ "language": "...", "code": "..." }`. Teacher grading uses `POST /api/ai/evaluate/` with `{ "language": "...", "question": "...", "code": "..." }` and returns marks out of 100. Configure `GEMINI_API_KEY` or `OPENAI_API_KEY` only through environment variables; never commit `.env` files.
