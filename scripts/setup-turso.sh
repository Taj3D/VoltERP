#!/bin/bash
# VoltERP Turso Database Setup Script
# This script helps you set up a Turso database for VoltERP

set -e

echo "🚀 VoltERP — Turso Database Setup"
echo "=================================="
echo ""

# Check if turso CLI is installed
if ! command -v turso &> /dev/null; then
    echo "❌ Turso CLI not found. Installing..."
    curl -sSfL https://get.tur.so/install.sh | bash
    export PATH="$HOME/.turso:$PATH"
    echo "✅ Turso CLI installed."
fi

# Check if logged in
if ! turso auth whoami &> /dev/null; then
    echo ""
    echo "⚠️  You need to log in to Turso first."
    echo "   Run: turso auth signup"
    echo "   Or:  turso auth login"
    echo ""
    echo "   For headless environments, run: turso auth login --headless"
    exit 1
fi

echo "✅ Authenticated with Turso."
echo ""

# Create database
DB_NAME="volterp-db"
echo "📦 Creating Turso database: $DB_NAME"
turso db create "$DB_NAME" --group default 2>/dev/null || {
    echo "⚠️  Database may already exist. Continuing..."
}

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 5

# Get connection URL
DB_URL=$(turso db show "$DB_NAME" --url 2>/dev/null || echo "")
echo "🔗 Database URL: $DB_URL"

# Create auth token
AUTH_TOKEN=$(turso db tokens create "$DB_NAME" 2>/dev/null || echo "")
echo "🔑 Auth Token: $AUTH_TOKEN"

# Dump existing SQLite data and import to Turso
echo ""
echo "📊 Migrating data from local SQLite to Turso..."

# Check if local DB exists
if [ -f "db/custom.db" ]; then
    # Dump the SQLite database
    sqlite3 db/custom.db ".dump" > /tmp/volterp_dump.sql 2>/dev/null || {
        echo "⚠️  Could not dump local database. You may need to install sqlite3 CLI."
        echo "   The schema will be created via Prisma instead."
    }

    # Import to Turso using the shell
    if [ -f "/tmp/volterp_dump.sql" ] && [ -n "$DB_URL" ] && [ -n "$AUTH_TOKEN" ]; then
        echo "📤 Importing data to Turso..."
        turso db shell "$DB_NAME" < /tmp/volterp_dump.sql 2>/dev/null || {
            echo "⚠️  Direct import failed. Using Prisma to create schema..."
        }
    fi
else
    echo "ℹ️  No local database found. Creating schema via Prisma..."
fi

# Update .env file
echo ""
echo "📝 Updating .env file..."
if [ -f ".env" ]; then
    # Backup existing .env
    cp .env .env.backup
    
    # Update DATABASE_URL
    if [ -n "$DB_URL" ]; then
        sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"$DB_URL\"|" .env
    fi
    
    # Add DATABASE_AUTH_TOKEN if not present
    if [ -n "$AUTH_TOKEN" ] && ! grep -q "DATABASE_AUTH_TOKEN" .env; then
        echo "DATABASE_AUTH_TOKEN=\"$AUTH_TOKEN\"" >> .env
    elif [ -n "$AUTH_TOKEN" ]; then
        sed -i "s|DATABASE_AUTH_TOKEN=.*|DATABASE_AUTH_TOKEN=\"$AUTH_TOKEN\"|" .env
    fi
    
    echo "✅ .env file updated."
    echo "   Backup saved as .env.backup"
else
    echo "DATABASE_URL=\"$DB_URL\"" > .env
    echo "DATABASE_AUTH_TOKEN=\"$AUTH_TOKEN\"" >> .env
    echo "JWT_SECRET=\"change-this-to-a-secure-random-string-in-production\"" >> .env
    echo "✅ .env file created."
fi

# Generate Prisma client and push schema
echo ""
echo "🔧 Generating Prisma client..."
bun run db:generate

echo "📊 Pushing schema to Turso..."
DATABASE_URL="$DB_URL" DATABASE_AUTH_TOKEN="$AUTH_TOKEN" bun run db:push

echo ""
echo "🎉 Turso setup complete!"
echo ""
echo "📋 Summary:"
echo "   Database Name: $DB_NAME"
echo "   Database URL:  $DB_URL"
echo "   Auth Token:    $AUTH_TOKEN"
echo ""
echo "🚀 Next steps:"
echo "   1. Run 'bun run dev' to start the development server"
echo "   2. For Vercel deployment, add these environment variables:"
echo "      - DATABASE_URL=$DB_URL"
echo "      - DATABASE_AUTH_TOKEN=$AUTH_TOKEN"
echo "      - JWT_SECRET=<your-secure-secret>"
