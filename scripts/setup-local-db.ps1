# Setup local PostgreSQL database for development
# Run as: powershell -ExecutionPolicy Bypass -File scripts\setup-local-db.ps1

$ErrorActionPreference = "Stop"

Write-Host "🔧 Setting up local PostgreSQL database..." -ForegroundColor Cyan

# Configuration
$dbName = "sampada_dev"
$dbUser = "sampada"
$dbPassword = "sampada"
$dbPort = "5432"
$dbHost = "localhost"

# Check if PostgreSQL is installed
Write-Host "`n📋 Checking PostgreSQL installation..." -ForegroundColor Yellow
$pgCmd = Get-Command psql -ErrorAction SilentlyContinue
if (-not $pgCmd) {
    Write-Host "❌ PostgreSQL not found. Please install PostgreSQL 16+" -ForegroundColor Red
    Write-Host "   Download from: https://www.postgresql.org/download/windows/" -ForegroundColor Gray
    exit 1
}
Write-Host "✓ PostgreSQL found: $($pgCmd.Source)" -ForegroundColor Green

# Create database
Write-Host "`n🗄️  Creating database '$dbName'..." -ForegroundColor Yellow
try {
    $env:PGPASSWORD = "postgres"
    $output = psql -h $dbHost -U postgres -c "CREATE DATABASE $dbName;" 2>&1
    if ($LASTEXITCODE -eq 0 -or $output -match "already exists") {
        Write-Host "✓ Database ready" -ForegroundColor Green
    } else {
        throw $output
    }
} catch {
    Write-Host "❌ Failed to create database: $_" -ForegroundColor Red
    exit 1
}

# Create user
Write-Host "`n👤 Creating user '$dbUser'..." -ForegroundColor Yellow
try {
    $env:PGPASSWORD = "postgres"
    $output = psql -h $dbHost -U postgres -d $dbName -c "CREATE USER $dbUser WITH PASSWORD '$dbPassword';" 2>&1
    if ($LASTEXITCODE -eq 0 -or $output -match "already exists") {
        Write-Host "✓ User ready" -ForegroundColor Green
    } else {
        throw $output
    }
} catch {
    Write-Host "⚠️  User may already exist, continuing..." -ForegroundColor Yellow
}

# Grant privileges
Write-Host "`n🔐 Granting privileges..." -ForegroundColor Yellow
try {
    $env:PGPASSWORD = "postgres"
    psql -h $dbHost -U postgres -d $dbName -c "GRANT ALL PRIVILEGES ON DATABASE $dbName TO $dbUser;" | Out-Null
    psql -h $dbHost -U postgres -d $dbName -c "GRANT USAGE ON SCHEMA public TO $dbUser;" | Out-Null
    psql -h $dbHost -U postgres -d $dbName -c "GRANT CREATE ON SCHEMA public TO $dbUser;" | Out-Null
    Write-Host "✓ Privileges granted" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Error granting privileges: $_" -ForegroundColor Yellow
}

# Test connection
Write-Host "`n🔗 Testing connection..." -ForegroundColor Yellow
try {
    $env:PGPASSWORD = $dbPassword
    $output = psql -h $dbHost -U $dbUser -d $dbName -c "SELECT version();" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Connection successful" -ForegroundColor Green
        Write-Host "   $($output[2])" -ForegroundColor Gray
    } else {
        throw $output
    }
} catch {
    Write-Host "❌ Connection failed: $_" -ForegroundColor Red
    exit 1
}

# Create .env.local
Write-Host "`n📝 Creating .env.local..." -ForegroundColor Yellow
$envContent = @"
# Local development database
DATABASE_URL="postgresql://$($dbUser):$($dbPassword)@$($dbHost):$($dbPort)/$($dbName)?schema=public"

# Copy other vars from .env.example and fill in:
# CORS_ORIGIN, ADMIN_EMAIL, JWT_SECRET, etc.
"@

$envFile = "apps\api\.env.local"
if (Test-Path $envFile) {
    Write-Host "⊘ $envFile already exists, skipping" -ForegroundColor Yellow
} else {
    $envContent | Set-Content $envFile -Encoding UTF8
    Write-Host "✓ Created $envFile" -ForegroundColor Green
}

Write-Host "`n✅ Local database setup complete!

Next steps:
  1. Configure apps/api/.env.local with remaining variables
  2. Run: cd apps/api && pnpm prisma:migrate dev
  3. Run migration: pnpm node scripts/migrate-real-data.mjs
  4. Start dev server: pnpm dev

Connection string:
  postgresql://$($dbUser):$($dbPassword)@$($dbHost):$($dbPort)/$($dbName)
" -ForegroundColor Green

$env:PGPASSWORD = ""
