-- Server-only schema: never expose this schema in the Supabase Data API.
CREATE SCHEMA IF NOT EXISTS elite;
REVOKE ALL ON SCHEMA elite FROM PUBLIC;
CREATE TABLE IF NOT EXISTS elite.roles (id text PRIMARY KEY,name text NOT NULL,permissions text NOT NULL);
CREATE TABLE IF NOT EXISTS elite.members (id text PRIMARY KEY,user_id text UNIQUE,email text UNIQUE NOT NULL,name text NOT NULL,role_id text NOT NULL REFERENCES elite.roles(id),active integer NOT NULL DEFAULT 1 CHECK(active IN(0,1)),expires_at text);
CREATE TABLE IF NOT EXISTS elite.settings (id integer PRIMARY KEY CHECK(id=1),owner_id text NOT NULL,name text NOT NULL,discord text NOT NULL DEFAULT '',connect text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS elite.items (id text PRIMARY KEY,kind text NOT NULL CHECK(kind IN('rules','announcements','reports','tasks')),title text NOT NULL,body text NOT NULL,category text NOT NULL,status text NOT NULL,audience text NOT NULL,pinned integer NOT NULL DEFAULT 0 CHECK(pinned IN(0,1)),priority text NOT NULL,assignee text REFERENCES elite.members(id),due text,created_by text NOT NULL REFERENCES elite.members(id),created_at text NOT NULL,updated_at text NOT NULL,version integer NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS items_kind_updated ON elite.items(kind,updated_at);
CREATE TABLE IF NOT EXISTS elite.comments(id text PRIMARY KEY,item_id text NOT NULL REFERENCES elite.items(id),body text NOT NULL,internal integer NOT NULL CHECK(internal IN(0,1)),actor text NOT NULL,created_at text NOT NULL);
CREATE INDEX IF NOT EXISTS comments_item_time ON elite.comments(item_id,created_at);
CREATE TABLE IF NOT EXISTS elite.audit(id text PRIMARY KEY,actor text NOT NULL,action text NOT NULL,target text NOT NULL,created_at text NOT NULL);
CREATE INDEX IF NOT EXISTS audit_time ON elite.audit(created_at);
ALTER TABLE elite.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE elite.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE elite.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE elite.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE elite.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE elite.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA elite FROM PUBLIC;
-- No public policies. Only the trusted server's DATABASE_URL role may access these tables.

