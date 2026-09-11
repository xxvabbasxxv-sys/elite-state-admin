-- Additive migration after 001-initial.sql. Existing records are preserved; email invites no longer grant access.
ALTER TABLE elite.roles ADD COLUMN IF NOT EXISTS discord_role_id text;
ALTER TABLE elite.roles ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS roles_discord_role_unique ON elite.roles(discord_role_id) WHERE discord_role_id IS NOT NULL;
ALTER TABLE elite.members ADD COLUMN IF NOT EXISTS discord_id text;
ALTER TABLE elite.members ADD COLUMN IF NOT EXISTS last_verified_at text;
ALTER TABLE elite.members ALTER COLUMN email DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS members_discord_unique ON elite.members(discord_id) WHERE discord_id IS NOT NULL;
ALTER TABLE elite.settings ADD COLUMN IF NOT EXISTS owner_discord_id text;
-- Do not auto-adopt legacy owner accounts. Existing email-based owners require an explicit reviewed identity migration.
