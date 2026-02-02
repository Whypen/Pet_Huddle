#!/bin/bash

# UAT Remediation - Migration Deployment Script
# This script deploys the new migrations to your Supabase project

set -e  # Exit on error

PROJECT_ID="odxzuymckzalelypqnhk"
MIGRATIONS_DIR="supabase/migrations"

echo "=========================================="
echo "UAT Remediation - Migration Deployment"
echo "=========================================="
echo ""
echo "Project ID: $PROJECT_ID"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found"
    echo "Install with: npm install -g supabase"
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Check if project is linked
if [ ! -f ".supabase/config.toml" ]; then
    echo "⚠️  Project not linked to Supabase"
    echo "Running: supabase link --project-ref $PROJECT_ID"
    echo ""
    supabase link --project-ref "$PROJECT_ID"
    echo ""
fi

echo "📋 Migrations to deploy:"
echo "  1. 20260202170000_uat_remediation_location_geography.sql"
echo "  2. 20260202170100_create_emergency_logs.sql"
echo ""

read -p "Deploy these migrations? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 0
fi

echo ""
echo "🚀 Deploying migrations..."
echo ""

# Deploy migrations
supabase db push

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migrations deployed successfully!"
    echo ""
    echo "📊 Running verification script..."
    echo ""

    # Run verification
    supabase db execute -f "$MIGRATIONS_DIR/20260202170001_verify_rls_policies.sql"

    echo ""
    echo "=========================================="
    echo "✅ Deployment Complete!"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "  1. Deploy Edge Function: supabase functions deploy mesh-alert"
    echo "  2. Test the HazardScanner cache functionality"
    echo "  3. Test mesh-alert with emergency_logs"
    echo "  4. Review DEPLOYMENT_GUIDE.md for detailed testing"
    echo ""
else
    echo ""
    echo "❌ Migration deployment failed"
    echo "Check the error messages above"
    exit 1
fi
