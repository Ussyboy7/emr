#!/bin/bash

# Script to help fix TypeScript any types in EMR frontend
# This script performs bulk replacements of common any type patterns

echo "=== EMR TypeScript Any Type Fixer ==="
echo "Starting bulk replacements..."

# Change to the frontend directory
cd "/Users/macbook/Documents/Cursur Apps/emr/frontend" || exit 1

# Common replacements
echo "1. Replacing ': any[]' with ': Record<string, unknown>[]'"
sed -i '' 's/: any\[\]/: Record<string, unknown>[]/g' lib/**/*.ts

echo "2. Replacing ': any' in catch blocks with ': unknown'"
sed -i '' 's/catch (error: any)/catch (error: unknown)/g' lib/**/*.ts

echo "3. Replacing ': any' in API response processing with ': Record<string, unknown>'"
sed -i '' 's/\.map(([^:]*): any =>/\.map((\1: Record<string, unknown>) =>/g' lib/**/*.ts
sed -i '' 's/\.forEach(([^:]*): any =>/\.forEach((\1: Record<string, unknown>) =>/g' lib/**/*.ts

echo "4. Replacing ': any' in object fields with ': Record<string, unknown>'"
sed -i '' 's/\([a-zA-Z_][a-zA-Z0-9_]*\): any;/\1: Record<string, unknown>;/g' lib/**/*.ts

echo "Bulk replacements completed!"
echo ""
echo "=== Remaining any types ==="
echo "Remaining any types in lib:" $(grep -r ": any" lib/ --include="*.ts" | wc -l)
echo "Remaining any types in hooks:" $(grep -r ": any" hooks/ --include="*.ts" | wc -l)

echo ""
echo "Next steps:"
echo "1. Review remaining any types manually"
echo "2. Create proper interfaces for complex objects"
echo "3. Test that changes don't break functionality"