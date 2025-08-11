#!/bin/sh

echo "🚀 Starting PrintFlow Backend..."

# Run database migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy

# Start the application
echo "✅ Starting server..."
node dist/server.js