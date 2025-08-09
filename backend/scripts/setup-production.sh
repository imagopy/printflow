#!/bin/bash

echo "🚀 Setting up PrintFlow production database..."

# Run migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy

# Check if we should seed
if [ "$SEED_DATABASE" = "true" ]; then
  echo "🌱 Seeding database with demo data..."
  npx prisma db seed
else
  echo "ℹ️  Skipping database seed (set SEED_DATABASE=true to seed)"
fi

echo "✅ Database setup complete!"