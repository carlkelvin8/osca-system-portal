# OSCA System — Railway Deploy Guide (Beginner-Friendly)

> Free tier: **$5/month credit** — covers API + Frontend + Celery + MinIO + Postgres + Redis

---

## PRE-REQUISITES
- [ ] GitHub account (push this repo there)
- [ ] Railway account (sign up free at https://railway.app)
- [ ] Railway CLI installed: `npm i -g @railway/cli`

---

## STEP 1: Push to GitHub

```bash
cd /path/to/osca-management-system
git add -A
git commit -m "Add Railway deployment configs"
git push origin main
```

---

## STEP 2: Create Railway Project

1. Go to **https://railway.app/dashboard**
2. Click **"New Project"**
3. Select **"Empty Project"**
4. Name it: **osca-system**

---

## STEP 3: Add PostgreSQL

1. In your project, click **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Railway auto-creates it
3. Go to the PostgreSQL service → **Variables** tab → note these:
   - `PGHOST`
   - `PGPORT`
   - `PGDATABASE`
   - `PGUSER`
   - `PGPASSWORD`
   - `DATABASE_URL`

---

## STEP 4: Add Redis

1. Click **"+ New"** → **"Database"** → **"Redis"**
2. Go to Redis service → **Variables** tab → note these:
   - `REDISHOST`
   - `REDISPORT`
   - `REDISPASSWORD`
   - `REDIS_URL`

---

## STEP 5: Create API Service

1. Click **"+ New"** → **"GitHub Repo"** → select your `osca-management-system` repo
2. Name it: **api**
3. Go to **Settings**:
   - **Root Directory**: `backend`
   - **Dockerfile Path**: `Dockerfile`
   - **Watch Patterns**: leave default
4. Go to **Variables** tab and paste these:

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

5. Then **add the database variables** (copy from PostgreSQL + Redis Variables tabs):
   - `DATABASE_URL` = paste from PostgreSQL (change `postgresql://` to `postgresql+asyncpg://`)
   - `POSTGRES_HOST` = PGHOST value
   - `POSTGRES_PORT` = PGPORT value
   - `POSTGRES_DB` = PGDATABASE value
   - `POSTGRES_USER` = PGUSER value
   - `POSTGRES_PASSWORD` = PGPASSWORD value
   - `REDIS_URL` = paste from Redis
   - `REDIS_PASSWORD` = REDISPASSWORD value
   - `CELERY_BROKER_URL` = `redis://:PASSWORD@HOST:PORT/1` (use Redis values)
   - `CELERY_RESULT_BACKEND` = `redis://:PASSWORD@HOST:PORT/2` (use Redis values)

6. Also generate and set:
   - `SECRET_KEY` = run `openssl rand -hex 32` in your terminal
   - `ALLOWED_ORIGINS` = `https://YOUR FRONTEND URL` (set after frontend is created)

7. **MinIO credentials** (generate these):
   - `MINIO_ACCESS_KEY` = run `openssl rand -hex 10`
   - `MINIO_SECRET_KEY` = run `openssl rand -hex 16`

8. Go to **Settings** → set **Start Command**:
   ```
   gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --workers 2 --bind 0.0.0.0:$PORT --timeout 120 --keep-alive 5 --access-logfile - --error-logfile -
   ```

---

## STEP 6: Create Frontend Service

1. Click **"+ New"** → **"GitHub Repo"** → select same repo
2. Name it: **frontend**
3. Go to **Settings**:
   - **Root Directory**: `frontend`
   - **Dockerfile Path**: `Dockerfile`
   - **Docker Build Target**: `runner`
4. Go to **Variables** tab:
   ```
   NODE_ENV=production
   NEXT_PUBLIC_API_URL=https://YOUR_API_URL.up.railway.app/api/v1
   ```
   (Replace YOUR_API_URL with the actual API service URL from Railway)

---

## STEP 7: Create Celery Worker

1. Click **"+ New"** → **"GitHub Repo"** → same repo
2. Name it: **celery-worker**
3. Go to **Settings**:
   - **Root Directory**: `backend`
   - **Dockerfile Path**: `Dockerfile`
4. Go to **Variables** tab → paste **ALL the same variables as API service** (copy from API Variables tab)
5. Go to **Settings** → set **Start Command**:
   ```
   celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
   ```

---

## STEP 8: Create Celery Beat

1. Click **"+ New"** → **"GitHub Repo"** → same repo
2. Name it: **celery-beat**
3. Settings: same as Celery Worker (Root Directory: `backend`, Dockerfile: `Dockerfile`)
4. Variables: same as API service (copy all)
5. Start Command:
   ```
   celery -A app.workers.celery_app beat --loglevel=info
   ```

---

## STEP 9: Create MinIO Service

1. Click **"+ New"** → **"GitHub Repo"** → same repo
2. Name it: **minio**
3. Settings:
   - **Root Directory**: `.` (root of repo)
   - **Dockerfile Path**: `Dockerfile.minio`
4. Variables:
   ```
   MINIO_ROOT_USER=YOUR_MINIO_ACCESS_KEY (same as API's MINIO_ACCESS_KEY)
   MINIO_ROOT_PASSWORD=YOUR_MINIO_SECRET_KEY (same as API's MINIO_SECRET_KEY)
   ```
5. Start Command:
   ```
   server /data --console-address :9001
   ```

---

## STEP 10: Update API MinIO_PUBLIC_ENDPOINT

After MinIO service is deployed, it gets a public URL like `minio.up.railway.app`.

Go back to **API service** → Variables → add:
```
MINIO_PUBLIC_ENDPOINT=minio.up.railway.app
```
(Replace with the actual MinIO Railway URL)

---

## STEP 11: Update Frontend API URL + CORS

1. **API service** → Variables → set `ALLOWED_ORIGINS` to:
   ```
   https://YOUR_FRONTEND.up.railway.app
   ```

2. **Frontend service** → Variables → set `NEXT_PUBLIC_API_URL` to:
   ```
   https://YOUR_API.up.railway.app/api/v1
   ```

---

## STEP 12: Deploy All Services

1. Go to each service → click **"Deploy"** button (or they auto-deploy on git push)
2. Wait for all services to show "Deployed" (green)

---

## STEP 13: Run Migrations

In your terminal:
```bash
railway login
railway link  # select your osca-system project

# Run migrations
railway run --service api alembic upgrade head

# Seed admin user
railway run --service api python -m app.scripts.seed
```

---

## STEP 14: Seed MinIO Buckets

```bash
railway run --service api python -m app.scripts.init_storage
```

---

## DONE! 🎉

- **Frontend**: `https://YOUR_FRONTEND.up.railway.app`
- **API Health**: `https://YOUR_API.up.railway.app/health`
- **MinIO Console**: `https://YOUR_MINIO.up.railway.app` (port 9001)
- **Login**: admin / (whatever you set in seed)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| API won't start | Check Logs tab. Usually missing env var. |
| Database connection error | Make sure DATABASE_URL uses `postgresql+asyncpg://` |
| Frontend can't reach API | Check NEXT_PUBLIC_API_URL and ALLOWED_ORIGINS |
| Face recognition slow | Normal — insightface downloads ~300MB model on first start |
| MinIO 403 on images | Set MINIO_PUBLIC_ENDPOINT to MinIO's Railway URL |
| Out of free credit | Upgrade or move to Oracle Cloud Free Tier |
