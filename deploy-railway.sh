#!/bin/bash
# ============================================================
# OSCA Railway — Generate Secrets + Print Instructions
# Run this locally to get your secrets, then follow the guide
# ============================================================

echo ""
echo "🔑 OSCA System — Railway Secrets Generator"
echo "══════════════════════════════════════════════════"
echo ""

SECRET_KEY=$(openssl rand -hex 32)
MINIO_AK=$(openssl rand -hex 10)
MINIO_SK=$(openssl rand -hex 16)

echo "Copy these values into Railway Variables tab:"
echo ""
echo "────────────────────────────────────────────────"
echo "SECRET_KEY=$SECRET_KEY"
echo "MINIO_ACCESS_KEY=$MINIO_AK"
echo "MINIO_SECRET_KEY=$MINIO_SK"
echo "────────────────────────────────────────────────"
echo ""
echo "For DATABASE_URL, REDIS_URL, etc. — copy from Railway plugin Variables tabs."
echo ""
echo "Full guide: see RAILWAY_DEPLOY.md"
echo ""
