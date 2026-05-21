-- =========================================================================
-- Savismartboard — Create a dedicated SQL Server login + database user
-- Run this as an RDS master user (has sysadmin or db_owner on master).
--
-- Usage:
--   1. Replace the password placeholder below with a strong password.
--   2. Run the entire script connected to the RDS instance (any database).
-- =========================================================================

-- -------------------------------------------------------------------------
-- Step 1: Create the server-level login (runs in master context)
-- -------------------------------------------------------------------------
USE master;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.server_principals WHERE name = N'smartuser'
)
BEGIN
    CREATE LOGIN smartuser
        WITH PASSWORD    = N'CHANGE_THIS_PASSWORD',
             CHECK_POLICY = ON,
             CHECK_EXPIRATION = OFF;
    PRINT 'Login smartuser created.';
END
ELSE
    PRINT 'Login smartuser already exists — skipped.';
GO

-- -------------------------------------------------------------------------
-- Step 2: Create the database user and grant only what the app needs
-- -------------------------------------------------------------------------
USE savismartboard;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.database_principals WHERE name = N'smartuser'
)
BEGIN
    CREATE USER smartuser FOR LOGIN smartuser;
    PRINT 'Database user smartuser created.';
END
ELSE
    PRINT 'Database user smartuser already exists — skipped.';
GO

-- SELECT, INSERT, UPDATE, DELETE on all current and future tables in dbo
ALTER ROLE db_datareader ADD MEMBER smartuser;
ALTER ROLE db_datawriter ADD MEMBER smartuser;

-- EXECUTE on stored procedures (if any are added later)
-- GRANT EXECUTE TO smartboard_app;

PRINT 'Permissions granted.';
GO
