# OSCA System — Deploy Guide (Vercel + Railway)

> **Frontend** → Vercel (free, optimized for Next.js)
> **Backend** → Railway ($5/month credit covers API + Celery + MinIO + Postgres + Redis)

---

## OVERVIEW

```
┌─────────────────────────────────────────────────┐
│  VERCEL (Frontend)                               │
│  https://osca-system-portal.vercel.app           │
│  Next.js 15 — auto-deploy on git push            │
└───────────────────┬─────────────────────────────┘
                    │ API calls
┌───────────────────▼─────────────────────────────┐
│  RAILWAY (Backend)                               │
│  ┌─────┐ ┌──────┐ ┌───────┐ ┌───────┐ ┌─────┐ │
│  │ API │ │Redis │ │Postgres│ │ MinIO │ │Celery│ │
│  └─────┘ └──────┘ └───────┘ └───────┘ └─────┘ │
└─────────────────────────────────────────────────┘
```

---

## PART A: Deploy Frontend on VERCEL

### A1. Go to Vercel

1. Go to **https://vercel.com**
2. Click **"Add New..."** → **"Project"**
3. Import **`carlkelvin8/osca-system-portal`** from GitHub
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
5. Click **"Environment Variables"** and add:

```
NEXT_PUBLIC_API_URL = https://YOUR_API_URL.up.railway.app/api/v1
```

> ⚠️ Replace `YOUR_API_URL` with the actual Railway API URL (set this AFTER creating the Railway API service in Part B)

6. Click **"Deploy"**
7. Done! Your frontend is live at `https://osca-system-portal.vercel.app`

> **Auto-deploy**: Every push to `main` auto-deploys to Vercel

---

## PART B: Deploy Backend on RAILWAY

### B1. Create Railway Project

1. Go to **https://railway.app/dashboard**
2. Click **"+ New"** → **"Empty Project"**
3. Name: **osca-system**

### B2. Add PostgreSQL

1. Click **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Go to PostgreSQL service → **Variables** tab → copy these values:
   - `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `DATABASE_URL`

### B3. Add Redis

1. Click **"+ New"** → **"Database"** → **"Redis"**
2. Go to Redis service → **Variables** tab → copy:
   - `REDISHOST`, `REDISPORT`, `REDISPASSWORD`, `REDIS_URL`

### B4. Create API Service

1. Click **"+ New"** → **"GitHub Repo"** → select `osca-system-portal`
2. Name: **api**
3. **Settings** → Root Directory: `backend`
4. **Settings** → Start Command:
   ```
   gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --workers 2 --bind 0.0.0.0:$PORT --timeout 120 --keep-alive 5 --access-logfile - --error-logfile -
   ```
5. **Variables** tab → paste these:

```
APP_ENV=production
DEBUG=false
LOG_LEVEL=WARNING
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
LOGIN_RATE_LIMIT_ATTEMPTS=5
LOGIN_RATE_LIMIT_WINDOW_SECONDS=900
LOGIN_LOCKOUT_SECONDS=1800
API_PREFIX=/api/v1
API_HOST=0.0.0.0
API_PORT=8000
FR_MODEL=insightface
FR_GPU_ENABLED=false
FR_LIVENESS_ENABLED=false
FR_MAX_SCAN_TIME_SECONDS=3
FR_SIMILARITY_THRESHOLD=0.85
FR_EMBEDDING_DIM=512
CELERY_TIMEZONE=Asia/Manila
OVERDUE_CHECK_SCHEDULE_HOURS=24
FACE_IMAGE_RETENTION_DAYS=30
MINIO_ENDPOINT=minio:9000
MINIO_BUCKET_FACES=osca-faces
MINIO_BUCKET_REPORTS=osca-reports
MINIO_BUCKET_PROFILES=osca-profile-pictures
MINIO_SECURE=false
EMAIL_PROVIDER=resend
EMAIL_FROM=OSCA System <osca@naap.edu.ph>
```

6. **Also add** (from your generated secrets + plugin values):

```
SECRET_KEY=99211ce72835c8e2ef81e4c34c342c61ac09aa6f9706ac6e2612d0621d5c30e4
MINIO_ACCESS_KEY=b8f6bf8822b18171dec7
MINIO_SECRET_KEY=7e20f20bef0d74d01087e55ac421653e
```

7. **Database vars** (copy from PostgreSQL Variables tab, modify DATABASE_URL):

```
DATABASE_URL=postgresql+asyncpg://USER:PASS@HOST:PORT/DBNAME
POSTGRES_HOST=PGHOST_VALUE
POSTGRES_PORT=PGPORT_VALUE
POSTGRES_DB=PGDATABASE_VALUE
POSTGRES_USER=PGUSER_VALUE
POSTGRES_PASSWORD=PGPASSWORD_VALUE
```

> ⚠️ Change `postgresql://` to `postgresql+asyncpg://` in DATABASE_URL!

8. **Redis vars** (copy from Redis Variables tab):

```
REDIS_URL=REDIS_URL_VALUE
REDIS_PASSWORD=REDISPASSWORD_VALUE
CELERY_BROKER_URL=redis://:PASSWORD@HOST:PORT/1
CELERY_RESULT_BACKEND=redis://:PASSWORD@HOST:PORT/2
```

### B5. Create Celery Worker

1. Click **"+ New"** → **"GitHub Repo"** → same repo
2. Name: **celery-worker**
3. Settings → Root Directory: `backend`
4. Variables → **copy ALL variables from API service**
5. Settings → Start Command:
   ```
   celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
   ```

### B6. Create Celery Beat

1. Click **"+ New"** → **"GitHub Repo"** → same repo
2. Name: **celery-beat**
3. Settings → Root Directory: `backend`
4. Variables → **copy ALL variables from API service**
5. Settings → Start Command:
   ```
   celery -A app.workers.celery_app beat --loglevel=info
   ```

### B7. Create MinIO Service

1. Click **"+ New"** → **"GitHub Repo"** → same repo
2. Name: **minio**
3. Settings → Root Directory: `.` (root)
4. Settings → Dockerfile Path: `Dockerfile.minio`
5. Variables:
   ```
   MINIO_ROOT_USER=b8f6bf8822b18171dec7
   MINIO_ROOT_PASSWORD=7e20f20bef0d74d01087e55ac421653e
   ```
6. Settings → Start Command:
   ```
   server /data --console-address :9001
   ```

### B8. Update MinIO Public Endpoint

After MinIO deploys, copy its public URL (e.g., `minio.up.railway.app`).

Go to **API service** → Variables → add:
```
MINIO_PUBLIC_ENDPOINT=minio.up.railway.app
```

Also add to Celery Worker variables.

### B9. Deploy All Railway Services

Click **"Deploy"** on each service, or they auto-deploy on git push.

---

## PART C: Connect Vercel ↔ Railway

### C1. Update Vercel env var

1. Go to **Vercel** → your project → **Settings** → **Environment Variables**
2. Set `NEXT_PUBLIC_API_URL` to:
   ```
   https://api.up.railway.app/api/v1
   ```
3. Click **"Redeploy"**

### C2. Update Railway CORS

1. Go to **Railway** → API service → **Variables**
2. Set `ALLOWED_ORIGINS` to:
   ```
   https://osca-system-portal.vercel.app
   ```
3. Redeploy the API service

### C3. Update Frontend image patterns

Update `frontend/next.config.ts` to allow Railway MinIO images:

```ts
images: {
  remotePatterns: [
    { protocol: "http",  hostname: "localhost", port: "9000" },
    { protocol: "https", hostname: "*.up.railway.app" },
  ],
},
```

---

## PART D: Run Migrations & Seed

```bash
# Install Railway CLI
npm i -g @railway/cli
railway login
railway link  # select osca-system

# Run migrations
railway run --service api alembic upgrade head

# Seed admin user
railway run --service api python -m app.scripts.seed

# Init MinIO buckets
railway run --service api python -m app.scripts.init_storage
```

---

## DONE! 🎉

| Service | URL |
|---------|-----|
| **Frontend** | `https://osca-system-portal.vercel.app` |
| **API** | `https://api.up.railway.app/health` |
| **MinIO Console** | `https://minio.up.railway.app` |
| **Login** | admin / (from seed) |

---

## Quick Reference — Generated Secrets

```
SECRET_KEY=99211ce72835c8e2ef81e4c34c342c61ac09aa6f9706ac6e2612d0621d5c30e4
MINIO_ACCESS_KEY=b8f6bf8822b18171dec7
MINIO_SECRET_KEY=7e20f20bef0d74d01087e55ac421653e
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Frontend shows "Failed to fetch" | Check `NEXT_PUBLIC_API_URL` in Vercel env vars |
| CORS error on API | Set `ALLOWED_ORIGINS` in Railway API vars |
| API won't start | Check Logs tab — usually missing env var |
| Database error | DATABASE_URL must use `postgresql+asyncpg://` |
| Face recognition slow | Normal — downloads ~300MB model on first start |
| MinIO images broken | Set `MINIO_PUBLIC_ENDPOINT` to MinIO Railway URL |
| Vercel deploy fails | Check build logs — usually missing `NEXT_PUBLIC_API_URL` |
