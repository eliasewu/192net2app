-- ============================================================
-- IDEMPOTENT MIGRATIONS: multi-channel routing + voice OTP + validation
-- Safe to re-run on live databases. Each CREATE uses IF NOT EXISTS;
-- each ALTER uses ADD COLUMN IF NOT EXISTS.
-- Apply AFTER the base schema has been loaded.
-- ============================================================

-- ----- 0. Schema migrations versioning table (must be first) -----
-- Tracks which migration statements have been applied so the boot-time
-- runner can skip already-executed DDL. Each row stores the SHA-256
-- hash of the statement text, applied_at timestamp, and an optional
-- human-readable label for auditing.
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    hash TEXT NOT NULL UNIQUE,
    label TEXT,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_hash ON schema_migrations(hash);

-- ----- 1. Number validation cache -----
CREATE TABLE IF NOT EXISTS number_validation_results (
    id SERIAL PRIMARY KEY,
    phone_e164 VARCHAR(40) NOT NULL UNIQUE,
    has_whatsapp BOOLEAN DEFAULT NULL,
    has_telegram BOOLEAN DEFAULT NULL,
    has_rcs BOOLEAN DEFAULT NULL,
    flash_sms_capable BOOLEAN DEFAULT NULL,
    voice_capable BOOLEAN DEFAULT NULL,
    provider VARCHAR(50),          -- which adapter produced this result
    raw_response JSONB,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '24 hours',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nvr_phone ON number_validation_results(phone_e164);
CREATE INDEX IF NOT EXISTS idx_nvr_expires ON number_validation_results(expires_at);

-- ----- 2. Voice call retry queue (DLR 70s/105s) -----
CREATE TABLE IF NOT EXISTS voice_call_retry_queue (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) NOT NULL,
    destination VARCHAR(40) NOT NULL,
    otp_code VARCHAR(20) NOT NULL,
    language VARCHAR(20) NOT NULL,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    -- wait seconds AFTER this retry before considering it failed.
    -- retry 1 = inline (no wait). retry 2 = wait 70s. retry 3 = wait 105s.
    next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_dial_result VARCHAR(40),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','waiting','connected','failed','timeout','completed')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vcrq_status_next ON voice_call_retry_queue(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_vcrq_call_id ON voice_call_retry_queue(call_id);

-- ----- 3. Voice OTP per-digit audio files -----
ALTER TABLE voice_otp_configs
    ADD COLUMN IF NOT EXISTS audio_files JSONB DEFAULT '{}';
-- audio_files schema:
--   { "0": "/uploads/audio/en-US/0.wav",
--     "1": ...,
--     "9": ... }

-- ----- 4. Asterisk / SIP settings table -----
CREATE TABLE IF NOT EXISTS asterisk_settings (
    id SERIAL PRIMARY KEY,
    sip_host VARCHAR(255) NOT NULL DEFAULT '127.0.0.1',
    sip_port INT NOT NULL DEFAULT 5060,
    ami_host VARCHAR(255) NOT NULL DEFAULT '127.0.0.1',
    ami_port INT NOT NULL DEFAULT 5038,
    ami_username VARCHAR(100) DEFAULT 'net2app',
    ami_secret VARCHAR(255) DEFAULT 'net2app_secret',
    -- context inside extensions.conf
    dialplan_context VARCHAR(100) DEFAULT 'net2app-otp',
    -- DLR polling loop (seconds)
    poll_interval_seconds INT DEFAULT 5,
    -- default retry policy
    retries_2_wait_seconds INT DEFAULT 70,
    retries_3_wait_seconds INT DEFAULT 105,
    max_retries INT DEFAULT 3,
    -- asterisk binary status
    asterisk_installed BOOLEAN DEFAULT false,
    asterisk_running BOOLEAN DEFAULT false,
    asterisk_config_path VARCHAR(500) DEFAULT '/etc/asterisk',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Seed defaults if table empty
INSERT INTO asterisk_settings (sip_host, sip_port, ami_host, ami_port, ami_username, ami_secret, dialplan_context, poll_interval_seconds, retries_2_wait_seconds, retries_3_wait_seconds, max_retries)
SELECT '127.0.0.1', 5060, '127.0.0.1', 5038, 'net2app', 'net2app_secret', 'net2app-otp', 5, 70, 105, 3
WHERE NOT EXISTS (SELECT 1 FROM asterisk_settings);

-- ----- 5. Number-validation providers table (pluggable adapters) -----
CREATE TABLE IF NOT EXISTS number_validation_providers (
    id SERIAL PRIMARY KEY,
    channel VARCHAR(40) NOT NULL UNIQUE,    -- 'whatsapp' | 'telegram' | 'rcs' | 'flash_sms' | 'voice_otp'
    provider_kind VARCHAR(40) NOT NULL,      -- 'mock' | 'telegram_bot' | 'whatsapp_cloud' | 'rcs_hub' | 'smpp_flash'
    enabled BOOLEAN DEFAULT true,
    api_url TEXT,
    api_key TEXT,
    api_secret TEXT,
    extra JSONB DEFAULT '{}',
    last_test_at TIMESTAMP,
    last_test_success BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO number_validation_providers (channel, provider_kind, enabled) VALUES
    ('whatsapp', 'mock', true),
    ('telegram', 'telegram_bot', false),
    ('rcs', 'mock', true),
    ('flash_sms', 'mock', true),
    ('voice_otp', 'mock', true)
ON CONFLICT (channel) DO NOTHING;

-- ----- 6. Routing-plan allowed-channels column -----
ALTER TABLE route_plans
    ADD COLUMN IF NOT EXISTS allowed_channels TEXT[] DEFAULT ARRAY['sms','whatsapp','telegram','rcs','flash_sms','voice_otp'];

-- ----- 7. Routes table channel preference (force one channel) -----
ALTER TABLE routes
    ADD COLUMN IF NOT EXISTS preferred_channel VARCHAR(40) DEFAULT 'sms';

-- ----- 8. Client-side channel preferences -----
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS allowed_channels TEXT[] DEFAULT ARRAY['sms','whatsapp','telegram','rcs','flash_sms','voice_otp'],
    ADD COLUMN IF NOT EXISTS preferred_channel VARCHAR(40) DEFAULT 'sms';

-- ----- 9. Suppliers: tunnel-through-asterisk flag -----
ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS routed_via_asterisk BOOLEAN DEFAULT false;

-- ----- 10. DLR queue extension for non-sms DLRs -----
ALTER TABLE dlr_queue
    ADD COLUMN IF NOT EXISTS channel VARCHAR(40) DEFAULT 'sms';

-- ----- 11. SMS logs channel column -----
ALTER TABLE sms_logs
    ADD COLUMN IF NOT EXISTS channel VARCHAR(40) DEFAULT 'sms';

-- ----- 12. Voice OTP logs: channel + Asterisk dial state -----
ALTER TABLE voice_otp_logs
    ADD COLUMN IF NOT EXISTS channel VARCHAR(40) DEFAULT 'voice_otp',
    ADD COLUMN IF NOT EXISTS asterisk_channel_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS dial_status VARCHAR(50),
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_vol_dial_status ON voice_otp_logs(dial_status);
CREATE INDEX IF NOT EXISTS idx_vol_next_retry ON voice_otp_logs(next_retry_at);

-- ----- 13. Voice OTP logs + retry queue carry client_id so DLR fans out to
-- the correct originator (used by pushSyntheticVoiceDlr to populate sms_logs).
ALTER TABLE voice_otp_logs
    ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);
ALTER TABLE voice_call_retry_queue
    ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);
CREATE INDEX IF NOT EXISTS idx_vol_client ON voice_otp_logs(client_id);

-- ----- 14. Asterisk settings: opt-out of config-file regeneration for
-- hosts that already have a working pjsip.conf + extensions.conf and just
-- want the Node bridge to read AMI events + dial via Originate.
ALTER TABLE asterisk_settings
    ADD COLUMN IF NOT EXISTS use_existing_config BOOLEAN DEFAULT true;

-- ----- 15. Multi-server failover: sip_servers table ----
-- Each row is one Asterisk instance reachable over AMI. The Node bridge
-- concurrently opens one AMI socket per row and maintains per-server
-- call-id awaiting maps. pickServer() picks a row by strategy when a
-- call originates; failover just picks the next row by priority when
-- a server is unhealthy.
CREATE TABLE IF NOT EXISTS sip_servers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    ami_host VARCHAR(255) NOT NULL,
    sip_host VARCHAR(255) NOT NULL,
    ami_port INT NOT NULL DEFAULT 5038,
    sip_port INT NOT NULL DEFAULT 5060,
    ami_username VARCHAR(100) NOT NULL DEFAULT 'net2app',
    ami_secret VARCHAR(255) NOT NULL DEFAULT 'net2app_secret',
    transport VARCHAR(10) NOT NULL DEFAULT 'udp' CHECK (transport IN ('udp','tcp','tls')),
    dialplan_context VARCHAR(100) DEFAULT 'net2app-otp',
    priority INT NOT NULL DEFAULT 10,            -- 1 = highest. pickServer() prefers lower numbers.
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_health_status VARCHAR(20) DEFAULT 'unknown', -- 'ok' / 'down' / 'unknown'
    last_health_at TIMESTAMP,
    last_health_latency_ms INT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ami_host, ami_port)
);
CREATE INDEX IF NOT EXISTS idx_sip_active_priority ON sip_servers(is_active, priority, id);

-- Seed first row ONLY if table is completely empty AND no legacy
-- asterisk_settings row exists. If the legacy row exists, the Node
-- boot will migrate it into sip_servers at runtime.
INSERT INTO sip_servers (name, ami_host, sip_host, ami_port, sip_port, ami_username, ami_secret,
                         transport, dialplan_context, priority, is_active, notes)
SELECT 'primary', '198.27.80.229', '198.27.80.229', 5038, 5060, 'net2app', 'net2app_secret',
       'udp', 'net2app-otp', 10, true, 'first SIP server added to fleet'
WHERE NOT EXISTS (SELECT 1 FROM sip_servers)
  AND NOT EXISTS (SELECT 1 FROM asterisk_settings);

-- ----- 16. Per-server attribution on voice retry queue + voice logs ----
ALTER TABLE voice_call_retry_queue
    ADD COLUMN IF NOT EXISTS sip_server_id INTEGER REFERENCES sip_servers(id),
    ADD COLUMN IF NOT EXISTS next_sip_server_id INTEGER REFERENCES sip_servers(id);
ALTER TABLE voice_otp_logs
    ADD COLUMN IF NOT EXISTS sip_server_id INTEGER REFERENCES sip_servers(id);
CREATE INDEX IF NOT EXISTS idx_vcrq_server ON voice_call_retry_queue(sip_server_id);
CREATE INDEX IF NOT EXISTS idx_vol_server ON voice_otp_logs(sip_server_id);

-- ----- 17. Per-SIP-server destination allow/deny routing ----
-- Each row pairs one sip_servers row with one destination regex (allow or
-- deny). pickServerForDestination() iterates rows ordered by priority ASC,
-- returns the first match's server when kind='allow', or short-circuits to
-- pickServer(fallbackStrategy) excluding the denied server for kind='deny'.
-- Empty table => all traffic falls through to pickServer('priority') so the
-- feature is opt-in.
CREATE TABLE IF NOT EXISTS sip_server_destinations (
    id SERIAL PRIMARY KEY,
    sip_server_id INTEGER NOT NULL REFERENCES sip_servers(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL DEFAULT 'allow' CHECK (kind IN ('allow','deny')),
    priority INT NOT NULL DEFAULT 10,        -- lower number wins on conflicting allow matches
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Cap pattern length at the DB level too. compilePatternSafe enforces
    -- the same cap at the API/bridge boundary (MAX_PATTERN_LEN=256), so
    -- this CHECK protects against direct-SQL inserts and a runaway regex
    -- DoS via patterns that exponential-backtrack on long E.164 input.
    -- Length cap is the cheapest fix; a real regex timeout would need a
    -- sandboxed worker. 256 is big enough for any sane country regex.
    pattern TEXT NOT NULL CHECK (char_length(pattern) <= 256),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (sip_server_id, pattern)          -- one row per (server, pattern) pair
);
CREATE INDEX IF NOT EXISTS idx_ssd_active_pri ON sip_server_destinations(is_active, priority, id);
CREATE INDEX IF NOT EXISTS idx_ssd_server ON sip_server_destinations(sip_server_id);

-- ----- 18. Asterisk config paths -----
-- The bridge now writes 5 conf files (pjsip/extensions/manager/modules/rtp).
-- manager_conf_path lets multi-host deployments (deck/edge split) override
-- the default /etc/asterisk/manager.conf location. Defaults to the
-- standard Debian/Ubuntu package location; trust the systemd unit.
ALTER TABLE asterisk_settings
    ADD COLUMN IF NOT EXISTS manager_conf_path VARCHAR(500) DEFAULT '/etc/asterisk/manager.conf';

-- ----- 19. DLR-push bookkeeping (voice OTP → ESME / webhook) -----
-- Each /dlr_event Node → Java call updates last_dlr_pushed_at on the
-- sip_server that originated the call, giving the UI a fleet-wide
-- "last DLR pushed at" timestamp and a quick way to spot brokers
-- whose synthetic DLR dispatcher is silently no-oping.
ALTER TABLE sip_servers
    ADD COLUMN IF NOT EXISTS last_dlr_pushed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS last_dlr_push_route VARCHAR(20),
    ADD COLUMN IF NOT EXISTS last_dlr_push_message_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_sip_dlr_pushed ON sip_servers(last_dlr_pushed_at);

-- ----- 20. Voice OTP: country prefix + retry language + greeting audio ----
ALTER TABLE voice_otp_configs
    ADD COLUMN IF NOT EXISTS country_prefix VARCHAR(200) DEFAULT '',
    ADD COLUMN IF NOT EXISTS retry_language_code VARCHAR(10) DEFAULT '',
    ADD COLUMN IF NOT EXISTS greeting_audio_url TEXT DEFAULT '';

-- ----- 20b. Voice OTP: primary/secondary language per country group ----
ALTER TABLE voice_otp_configs
    ADD COLUMN IF NOT EXISTS primary_language_code VARCHAR(10) DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS secondary_language_code VARCHAR(10) DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS primary_greeting_text TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS secondary_greeting_text TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS primary_retry_text TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS secondary_retry_text TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS secondary_audio_files JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS secondary_greeting_audio_url TEXT DEFAULT '';

-- ----- 21. Global voice OTP retry fallback language ----
INSERT INTO platform_settings (key, value) VALUES ('voice_otp_global_retry_language', 'en-US')
ON CONFLICT (key) DO NOTHING;

-- ----- 23. Social API Suppliers — WhatsApp Cloud API & Telegram Bot API as direct suppliers ----
CREATE TABLE IF NOT EXISTS social_api_suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('whatsapp_cloud','telegram_bot')),
    phone_number_id VARCHAR(100),
    business_account_id VARCHAR(100),
    access_token TEXT,
    webhook_verify_token VARCHAR(255),
    bot_token TEXT,
    bot_username VARCHAR(100),
    proxy_enabled BOOLEAN DEFAULT false,
    proxy_host VARCHAR(255),
    proxy_port INTEGER DEFAULT 8080,
    proxy_username VARCHAR(255),
    proxy_password TEXT,
    proxy_type VARCHAR(20) DEFAULT 'residential' CHECK (proxy_type IN ('residential','datacenter','isp')),
    is_active BOOLEAN DEFAULT true,
    connection_status VARCHAR(20) DEFAULT 'untested' CHECK (connection_status IN ('connected','disconnected','error','untested')),
    last_tested_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sas_platform ON social_api_suppliers(platform);
CREATE INDEX IF NOT EXISTS idx_sas_active ON social_api_suppliers(is_active);

-- ----- 25. Residential Proxies — dynamic proxy registration for WhatsApp/Telegram API suppliers ----
CREATE TABLE IF NOT EXISTS residential_proxies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    proxy_type VARCHAR(20) NOT NULL DEFAULT 'socks5' CHECK (proxy_type IN ('residential','datacenter','isp','socks5')),
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 1080,
    username VARCHAR(255) DEFAULT '',
    password TEXT DEFAULT '',
    public_ip VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    is_online BOOLEAN DEFAULT false,
    last_heartbeat TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rp_online ON residential_proxies(is_online);

-- ----- 26. sms_logs.source — recursion guard for DLR pipelines -----
-- Producers tag each INSERT so consumer code that scans sms_logs (the
-- voice call retry poller, the DLR inbound handler, the Java gateway
-- avoiding infinite loops) can safely exclude foreign-owned rows.
-- Convention:
--   'external_api'    — /api/sms/send + HTTP connector flows
--   'node_voice_dlr'  — server.cjs pushSyntheticVoiceDlr (this Node process)
--   'gateway_pushed'  — Java DlrRouter after routing to ESME / webhook
-- Without this column, the voice poller would re-fire on rows Java
-- itself just wrote back. Default existing rows to 'external_api' so
-- legacy / pre-migration rows still match inbound DLR lookups but
-- remain excluded from any NEW source='node_voice_dlr' sweep.
ALTER TABLE sms_logs
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'external_api';
CREATE INDEX IF NOT EXISTS idx_sms_logs_source ON sms_logs(source);

-- ----- 27. smpp_sessions: smpp_session_id + remote_ip tracking -----
-- Every bind event from the Java gateway carries a unique smpp_session_id
-- and the remote IP. Persisting both lets the bind-status dashboard show
-- the actual connected IP and session identifier for each ESME bind.
ALTER TABLE smpp_sessions
  ADD COLUMN IF NOT EXISTS smpp_session_id TEXT,
  ADD COLUMN IF NOT EXISTS remote_ip VARCHAR(50);

-- Backfill smpp_session_id from existing data: generate a stable id from
-- entity_type + entity_id so the API can join on it before Java sends
-- the next bind event with the real smpp_session_id.
UPDATE smpp_sessions
  SET smpp_session_id = 'esme-' || entity_type || '-' || entity_id
WHERE smpp_session_id IS NULL;

-- ----- 28. active_smpp_sessions VIEW -----
-- Convenience view that joins smpp_sessions with clients/suppliers
-- so the /api/bind/sessions endpoint can be a simple SELECT.
CREATE OR REPLACE VIEW active_smpp_sessions AS
SELECT
  ss.id,
  ss.entity_type,
  ss.entity_id,
  ss.system_id,
  COALESCE(ss.remote_ip, ss.ip_address) AS ip_address,
  ss.port,
  ss.bind_mode,
  ss.status,
  ss.negotiated_version,
  ss.connected_at,
  ss.disconnected_at,
  ss.last_activity,
  ss.bound_count,
  ss.smpp_session_id,
  CASE WHEN ss.entity_type = 'client' THEN c.client_code
       WHEN ss.entity_type = 'supplier' THEN s.supplier_code
  END AS entity_code,
  CASE WHEN ss.entity_type = 'client' THEN c.company_name
       WHEN ss.entity_type = 'supplier' THEN s.company_name
  END AS entity_name,
  COALESCE(s.connection_type, 'smpp') AS connection_type,
  COALESCE(s.is_inbound, false) AS is_inbound
FROM smpp_sessions ss
  LEFT JOIN clients c ON ss.entity_type = 'client' AND ss.entity_id = c.id
  LEFT JOIN suppliers s ON ss.entity_type = 'supplier' AND ss.entity_id = s.id;

-- ----- 28a. Extended translations columns (name, description, subtype, priority, apply_to, apply_entity_id) -----
ALTER TABLE translations ADD COLUMN IF NOT EXISTS name VARCHAR(255) DEFAULT '';
ALTER TABLE translations ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE translations ADD COLUMN IF NOT EXISTS subtype VARCHAR(50) DEFAULT '';
ALTER TABLE translations ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1;
ALTER TABLE translations ADD COLUMN IF NOT EXISTS apply_to VARCHAR(20) DEFAULT 'client';
ALTER TABLE translations ADD COLUMN IF NOT EXISTS apply_entity_id VARCHAR(20) DEFAULT 'all';

-- ----- 28b. Soft-delete columns for clients and suppliers -----
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- ----- 28b2. Last error tracking on smpp_sessions -----
-- Captures the most recent bind failure reason so the Bind Status
-- page can show why a supplier is unbound or in error state.
ALTER TABLE smpp_sessions ADD COLUMN IF NOT EXISTS last_error VARCHAR(500);
ALTER TABLE smpp_sessions ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMP;

-- ----- 28c. Client multi-IP and connection_type columns -----
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_ips TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS connection_type VARCHAR(50) DEFAULT 'smpp';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS api_connector_id INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS voice_otp_config_id INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_device_ids TEXT[] DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_device_ids TEXT[] DEFAULT '{}';

-- ----- 29. bind_history — append-only event log for bind/unbind timeline -----
-- Every bind lifecycle event (bound, unbound, error) creates a new row here.
-- Unlike smpp_sessions (which UPSERTs to show current state), bind_history
-- keeps the full timeline so /api/suppliers/:id/bind-history can render a
-- chronological event log.
CREATE TABLE IF NOT EXISTS bind_history (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('client','supplier')),
    entity_id INTEGER NOT NULL,
    system_id VARCHAR(100) NOT NULL,
    ip_address VARCHAR(50),
    port INTEGER DEFAULT 2775,
    bind_mode VARCHAR(20) DEFAULT 'transceiver',
    status VARCHAR(20) NOT NULL CHECK (status IN ('bound','unbound','binding','error')),
    negotiated_version VARCHAR(10),
    smpp_session_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bindhist_entity ON bind_history(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bindhist_created ON bind_history(created_at DESC);
