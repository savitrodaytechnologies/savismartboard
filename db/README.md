# Database — MS SQL Server

The Smartboard backend uses **Microsoft SQL Server** (matching Savischools).

## Local setup

1. Install SQL Server (Developer or Express) and SQL Server Management Studio (or Azure Data Studio).
2. Create an empty database named `Savismartboard`:
   ```sql
   CREATE DATABASE Savismartboard;
   ```
3. Run migrations in order from this folder:
   ```powershell
   sqlcmd -S localhost -d Savismartboard -E -i .\migrations\001_create_smartboard_schema.sql
   sqlcmd -S localhost -d Savismartboard -E -i .\seed\dev_seed.sql
   ```
4. Connection string is set in `backend/Smartboard.Api/appsettings.json` (`ConnectionStrings:Smartboard`).
   Override locally with **user-secrets** or `appsettings.Development.json`.

## Migration policy

- One file per change, numbered `NNN_short_description.sql`.
- All migrations must be **idempotent** (use `IF NOT EXISTS` / `IF OBJECT_ID(...) IS NULL`).
- Never edit a migration after it has been merged — add a new one.
