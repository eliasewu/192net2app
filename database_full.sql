--
-- PostgreSQL database dump
--

\restrict BwMvjgpt7vsE1dmWFvCYaIcb5vS1YrH5CXe5lBhs7DCHBofSSy4dVDqOxdmxoeR

-- Dumped from database version 14.23 (Ubuntu 14.23-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.23 (Ubuntu 14.23-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.trunks DROP CONSTRAINT IF EXISTS trunks_supplier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.translations DROP CONSTRAINT IF EXISTS translations_supplier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.translations DROP CONSTRAINT IF EXISTS translations_route_id_fkey;
ALTER TABLE IF EXISTS ONLY public.translations DROP CONSTRAINT IF EXISTS translations_client_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sms_logs DROP CONSTRAINT IF EXISTS sms_logs_supplier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sms_logs DROP CONSTRAINT IF EXISTS sms_logs_client_id_fkey;
ALTER TABLE IF EXISTS ONLY public.route_maps DROP CONSTRAINT IF EXISTS route_maps_supplier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.route_maps DROP CONSTRAINT IF EXISTS route_maps_route_id_fkey;
ALTER TABLE IF EXISTS ONLY public.route_maps DROP CONSTRAINT IF EXISTS route_maps_client_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ott_devices DROP CONSTRAINT IF EXISTS ott_devices_supplier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.dlr_queue DROP CONSTRAINT IF EXISTS dlr_queue_message_id_fkey;
ALTER TABLE IF EXISTS ONLY public.campaigns_recipients DROP CONSTRAINT IF EXISTS campaigns_recipients_campaign_id_fkey;
ALTER TABLE IF EXISTS ONLY public.campaigns DROP CONSTRAINT IF EXISTS campaigns_client_id_fkey;
ALTER TABLE IF EXISTS ONLY public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
DROP TRIGGER IF EXISTS update_suppliers_updated_at ON public.suppliers;
DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
DROP TRIGGER IF EXISTS generate_sms_message_id ON public.sms_logs;
DROP TRIGGER IF EXISTS generate_payment_number_trigger ON public.payments;
DROP TRIGGER IF EXISTS generate_invoice_number_trigger ON public.invoices;
DROP INDEX IF EXISTS public.idx_voice_otp_logs_status;
DROP INDEX IF EXISTS public.idx_users_username;
DROP INDEX IF EXISTS public.idx_users_role;
DROP INDEX IF EXISTS public.idx_trunks_supplier_active;
DROP INDEX IF EXISTS public.idx_suppliers_type;
DROP INDEX IF EXISTS public.idx_suppliers_code;
DROP INDEX IF EXISTS public.idx_suppliers_bind;
DROP INDEX IF EXISTS public.idx_sms_logs_supplier_id;
DROP INDEX IF EXISTS public.idx_sms_logs_submit_time;
DROP INDEX IF EXISTS public.idx_sms_logs_status;
DROP INDEX IF EXISTS public.idx_sms_logs_smpp_message_id;
DROP INDEX IF EXISTS public.idx_sms_logs_message_id;
DROP INDEX IF EXISTS public.idx_sms_logs_destination;
DROP INDEX IF EXISTS public.idx_sms_logs_client_id;
DROP INDEX IF EXISTS public.idx_sms_logs_client_date;
DROP INDEX IF EXISTS public.idx_routes_active;
DROP INDEX IF EXISTS public.idx_route_maps_supplier;
DROP INDEX IF EXISTS public.idx_route_maps_client_mccmnc;
DROP INDEX IF EXISTS public.idx_rates_entity_active;
DROP INDEX IF EXISTS public.idx_rates_effective;
DROP INDEX IF EXISTS public.idx_rates_destination;
DROP INDEX IF EXISTS public.idx_payments_entity;
DROP INDEX IF EXISTS public.idx_notifications_unread;
DROP INDEX IF EXISTS public.idx_notifications_type;
DROP INDEX IF EXISTS public.idx_mccmnc_mcc;
DROP INDEX IF EXISTS public.idx_mccmnc_country;
DROP INDEX IF EXISTS public.idx_invoices_status;
DROP INDEX IF EXISTS public.idx_invoices_entity;
DROP INDEX IF EXISTS public.idx_dlr_queue_status;
DROP INDEX IF EXISTS public.idx_dlr_queue_message_id;
DROP INDEX IF EXISTS public.idx_dlr_queue_force;
DROP INDEX IF EXISTS public.idx_clients_email;
DROP INDEX IF EXISTS public.idx_clients_code;
DROP INDEX IF EXISTS public.idx_audit_logs_user;
DROP INDEX IF EXISTS public.idx_audit_logs_time;
ALTER TABLE IF EXISTS ONLY public.voice_otp_logs DROP CONSTRAINT IF EXISTS voice_otp_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.voice_otp_logs DROP CONSTRAINT IF EXISTS voice_otp_logs_call_id_key;
ALTER TABLE IF EXISTS ONLY public.voice_otp_configs DROP CONSTRAINT IF EXISTS voice_otp_configs_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.trunks DROP CONSTRAINT IF EXISTS trunks_pkey;
ALTER TABLE IF EXISTS ONLY public.translations DROP CONSTRAINT IF EXISTS translations_pkey;
ALTER TABLE IF EXISTS ONLY public.tenants DROP CONSTRAINT IF EXISTS tenants_pkey;
ALTER TABLE IF EXISTS ONLY public.tenants DROP CONSTRAINT IF EXISTS tenants_code_key;
ALTER TABLE IF EXISTS ONLY public.suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_code_key;
ALTER TABLE IF EXISTS ONLY public.suppliers DROP CONSTRAINT IF EXISTS suppliers_pkey;
ALTER TABLE IF EXISTS ONLY public.smtp_config DROP CONSTRAINT IF EXISTS smtp_config_pkey;
ALTER TABLE IF EXISTS ONLY public.sms_logs DROP CONSTRAINT IF EXISTS sms_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.sms_logs DROP CONSTRAINT IF EXISTS sms_logs_message_id_key;
ALTER TABLE IF EXISTS ONLY public.routes DROP CONSTRAINT IF EXISTS routes_pkey;
ALTER TABLE IF EXISTS ONLY public.route_plans DROP CONSTRAINT IF EXISTS route_plans_pkey;
ALTER TABLE IF EXISTS ONLY public.route_maps DROP CONSTRAINT IF EXISTS route_maps_pkey;
ALTER TABLE IF EXISTS ONLY public.rates DROP CONSTRAINT IF EXISTS rates_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_settings DROP CONSTRAINT IF EXISTS platform_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_settings DROP CONSTRAINT IF EXISTS platform_settings_key_key;
ALTER TABLE IF EXISTS ONLY public.payments DROP CONSTRAINT IF EXISTS payments_pkey;
ALTER TABLE IF EXISTS ONLY public.payments DROP CONSTRAINT IF EXISTS payments_payment_number_key;
ALTER TABLE IF EXISTS ONLY public.ott_devices DROP CONSTRAINT IF EXISTS ott_devices_pkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_templates DROP CONSTRAINT IF EXISTS notification_templates_pkey;
ALTER TABLE IF EXISTS ONLY public.mccmnc DROP CONSTRAINT IF EXISTS mccmnc_pkey;
ALTER TABLE IF EXISTS ONLY public.license DROP CONSTRAINT IF EXISTS license_pkey;
ALTER TABLE IF EXISTS ONLY public.license DROP CONSTRAINT IF EXISTS license_license_key_key;
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS invoices_pkey;
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
ALTER TABLE IF EXISTS ONLY public.dlr_queue DROP CONSTRAINT IF EXISTS dlr_queue_pkey;
ALTER TABLE IF EXISTS ONLY public.clients DROP CONSTRAINT IF EXISTS clients_smpp_username_key;
ALTER TABLE IF EXISTS ONLY public.clients DROP CONSTRAINT IF EXISTS clients_pkey;
ALTER TABLE IF EXISTS ONLY public.clients DROP CONSTRAINT IF EXISTS clients_client_code_key;
ALTER TABLE IF EXISTS ONLY public.campaigns_recipients DROP CONSTRAINT IF EXISTS campaigns_recipients_pkey;
ALTER TABLE IF EXISTS ONLY public.campaigns DROP CONSTRAINT IF EXISTS campaigns_pkey;
ALTER TABLE IF EXISTS ONLY public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.api_connectors DROP CONSTRAINT IF EXISTS api_connectors_pkey;
ALTER TABLE IF EXISTS public.voice_otp_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.voice_otp_configs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.trunks ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.translations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tenants ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.suppliers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.smtp_config ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.sms_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.routes ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.route_plans ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.route_maps ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.rates ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.platform_settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.payments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ott_devices ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notifications ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notification_templates ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.mccmnc ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.license ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.invoices ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.dlr_queue ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.clients ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.campaigns_recipients ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.campaigns ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.audit_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.api_connectors ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.voice_otp_logs_id_seq;
DROP TABLE IF EXISTS public.voice_otp_logs;
DROP SEQUENCE IF EXISTS public.voice_otp_configs_id_seq;
DROP TABLE IF EXISTS public.voice_otp_configs;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP SEQUENCE IF EXISTS public.trunks_id_seq;
DROP TABLE IF EXISTS public.trunks;
DROP SEQUENCE IF EXISTS public.translations_id_seq;
DROP TABLE IF EXISTS public.translations;
DROP SEQUENCE IF EXISTS public.tenants_id_seq;
DROP TABLE IF EXISTS public.tenants;
DROP SEQUENCE IF EXISTS public.suppliers_id_seq;
DROP TABLE IF EXISTS public.suppliers;
DROP SEQUENCE IF EXISTS public.smtp_config_id_seq;
DROP TABLE IF EXISTS public.smtp_config;
DROP SEQUENCE IF EXISTS public.sms_logs_id_seq;
DROP TABLE IF EXISTS public.sms_logs;
DROP SEQUENCE IF EXISTS public.routes_id_seq;
DROP TABLE IF EXISTS public.routes;
DROP SEQUENCE IF EXISTS public.route_plans_id_seq;
DROP TABLE IF EXISTS public.route_plans;
DROP SEQUENCE IF EXISTS public.route_maps_id_seq;
DROP TABLE IF EXISTS public.route_maps;
DROP SEQUENCE IF EXISTS public.rates_id_seq;
DROP TABLE IF EXISTS public.rates;
DROP SEQUENCE IF EXISTS public.platform_settings_id_seq;
DROP TABLE IF EXISTS public.platform_settings;
DROP SEQUENCE IF EXISTS public.payments_id_seq;
DROP TABLE IF EXISTS public.payments;
DROP SEQUENCE IF EXISTS public.ott_devices_id_seq;
DROP TABLE IF EXISTS public.ott_devices;
DROP SEQUENCE IF EXISTS public.notifications_id_seq;
DROP TABLE IF EXISTS public.notifications;
DROP SEQUENCE IF EXISTS public.notification_templates_id_seq;
DROP TABLE IF EXISTS public.notification_templates;
DROP SEQUENCE IF EXISTS public.mccmnc_id_seq;
DROP TABLE IF EXISTS public.mccmnc;
DROP SEQUENCE IF EXISTS public.license_id_seq;
DROP TABLE IF EXISTS public.license;
DROP SEQUENCE IF EXISTS public.invoices_id_seq;
DROP TABLE IF EXISTS public.invoices;
DROP SEQUENCE IF EXISTS public.dlr_queue_id_seq;
DROP TABLE IF EXISTS public.dlr_queue;
DROP SEQUENCE IF EXISTS public.clients_id_seq;
DROP TABLE IF EXISTS public.clients;
DROP SEQUENCE IF EXISTS public.campaigns_recipients_id_seq;
DROP TABLE IF EXISTS public.campaigns_recipients;
DROP SEQUENCE IF EXISTS public.campaigns_id_seq;
DROP TABLE IF EXISTS public.campaigns;
DROP SEQUENCE IF EXISTS public.audit_logs_id_seq;
DROP TABLE IF EXISTS public.audit_logs;
DROP SEQUENCE IF EXISTS public.api_connectors_id_seq;
DROP TABLE IF EXISTS public.api_connectors;
DROP FUNCTION IF EXISTS public.update_updated_at_column();
DROP FUNCTION IF EXISTS public.generate_payment_number();
DROP FUNCTION IF EXISTS public.generate_message_id();
DROP FUNCTION IF EXISTS public.generate_invoice_number();
DROP FUNCTION IF EXISTS public.deduct_client_balance();
DROP FUNCTION IF EXISTS public.check_client_balance(client_id integer, estimated_cost numeric);
--
-- Name: check_client_balance(integer, numeric); Type: FUNCTION; Schema: public; Owner: sms_user
--

CREATE FUNCTION public.check_client_balance(client_id integer, estimated_cost numeric) RETURNS TABLE(allowed boolean, current_balance numeric, available_credit numeric, message text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    bal DECIMAL(15,4);
    cred DECIMAL(15,4);
BEGIN
    SELECT balance, credit_limit INTO bal, cred FROM clients WHERE id = client_id;
    
    -- Total available = balance + credit_limit
    IF (bal + cred) >= estimated_cost THEN
        RETURN QUERY SELECT true, bal, bal + cred, 'Sufficient balance'::TEXT;
    ELSE
        RETURN QUERY SELECT false, bal, bal + cred, 'Insufficient balance. Please top up your account.'::TEXT;
    END IF;
END;
$$;


ALTER FUNCTION public.check_client_balance(client_id integer, estimated_cost numeric) OWNER TO sms_user;

--
-- Name: deduct_client_balance(); Type: FUNCTION; Schema: public; Owner: sms_user
--

CREATE FUNCTION public.deduct_client_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    client_balance DECIMAL(15,4);
    client_credit DECIMAL(15,4);
    total_cost DECIMAL(15,4);
    billing_mode VARCHAR(20);
BEGIN
    SELECT balance, credit_limit, billing_mode INTO client_balance, client_credit, billing_mode FROM clients WHERE id = NEW.client_id FOR UPDATE;
    
    -- Calculate cost
    total_cost := NEW.client_rate * NEW.message_parts;
    
    -- Only deduct if billing_mode is 'submit' (immediate charge)
    -- For 'dlr' mode, charge happens when DLR received
    IF billing_mode = 'submit' THEN
        UPDATE clients SET balance = balance - total_cost WHERE id = NEW.client_id;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.deduct_client_balance() OWNER TO sms_user;

--
-- Name: generate_invoice_number(); Type: FUNCTION; Schema: public; Owner: sms_user
--

CREATE FUNCTION public.generate_invoice_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    year_prefix VARCHAR(4);
    sequence_num INTEGER;
BEGIN
    year_prefix := to_char(NEW.created_at, 'YYYY');
    SELECT COALESCE(MAX(CAST(SPLIT_PART(invoice_number, '-', 3) AS INTEGER)), 0) + 1 INTO sequence_num FROM invoices WHERE invoice_number LIKE 'INV-' || year_prefix || '-%';
    NEW.invoice_number := 'INV-' || year_prefix || '-' || LPAD(sequence_num::TEXT, 4, '0');
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_invoice_number() OWNER TO sms_user;

--
-- Name: generate_message_id(); Type: FUNCTION; Schema: public; Owner: sms_user
--

CREATE FUNCTION public.generate_message_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.message_id := 'MSG' || to_char(NOW(), 'YYYYMMDDHH24MISS') || LPAD(CAST(floor(random() * 9999) AS TEXT), 4, '0');
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_message_id() OWNER TO sms_user;

--
-- Name: generate_payment_number(); Type: FUNCTION; Schema: public; Owner: sms_user
--

CREATE FUNCTION public.generate_payment_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    year_prefix VARCHAR(4);
    sequence_num INTEGER;
BEGIN
    year_prefix := to_char(NEW.created_at, 'YYYY');
    SELECT COALESCE(MAX(CAST(SPLIT_PART(payment_number, '-', 3) AS INTEGER)), 0) + 1 INTO sequence_num FROM payments WHERE payment_number LIKE 'PAY-' || year_prefix || '-%';
    NEW.payment_number := 'PAY-' || year_prefix || '-' || LPAD(sequence_num::TEXT, 4, '0');
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_payment_number() OWNER TO sms_user;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: sms_user
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO sms_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: api_connectors; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.api_connectors (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    provider character varying(100) NOT NULL,
    region character varying(100),
    auth_type character varying(50) DEFAULT 'API_KEY'::character varying,
    http_method character varying(10) DEFAULT 'POST'::character varying,
    api_key text,
    api_secret text,
    send_url text NOT NULL,
    dlr_url text,
    submit_pattern character varying(255),
    dlr_pattern character varying(255),
    dlr_value character varying(100),
    params text,
    is_active boolean DEFAULT true,
    connection_status character varying(20) DEFAULT 'untested'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT api_connectors_auth_type_check CHECK (((auth_type)::text = ANY ((ARRAY['API_KEY'::character varying, 'BASIC'::character varying, 'BEARER'::character varying, 'OAUTH2'::character varying])::text[]))),
    CONSTRAINT api_connectors_connection_status_check CHECK (((connection_status)::text = ANY ((ARRAY['untested'::character varying, 'connected'::character varying, 'failed'::character varying, 'testing'::character varying])::text[]))),
    CONSTRAINT api_connectors_http_method_check CHECK (((http_method)::text = ANY ((ARRAY['POST'::character varying, 'GET'::character varying, 'PUT'::character varying])::text[])))
);


ALTER TABLE public.api_connectors OWNER TO sms_user;

--
-- Name: api_connectors_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.api_connectors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.api_connectors_id_seq OWNER TO sms_user;

--
-- Name: api_connectors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.api_connectors_id_seq OWNED BY public.api_connectors.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id integer,
    username character varying(100),
    action character varying(50) NOT NULL,
    entity_type character varying(50),
    entity_id integer,
    details jsonb,
    ip_address character varying(50),
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.audit_logs OWNER TO sms_user;

--
-- Name: TABLE audit_logs; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.audit_logs IS 'User activity audit trail';


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.audit_logs_id_seq OWNER TO sms_user;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.campaigns (
    id integer NOT NULL,
    campaign_name character varying(255) NOT NULL,
    client_id integer,
    sender_id character varying(100) NOT NULL,
    message_template text NOT NULL,
    recipients_count integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    delivered_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    scheduled_at timestamp without time zone,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT campaigns_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'running'::character varying, 'paused'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.campaigns OWNER TO sms_user;

--
-- Name: campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.campaigns_id_seq OWNER TO sms_user;

--
-- Name: campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.campaigns_id_seq OWNED BY public.campaigns.id;


--
-- Name: campaigns_recipients; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.campaigns_recipients (
    id integer NOT NULL,
    campaign_id integer,
    phone_number character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT campaigns_recipients_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'delivered'::character varying, 'failed'::character varying])::text[])))
);


ALTER TABLE public.campaigns_recipients OWNER TO sms_user;

--
-- Name: campaigns_recipients_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.campaigns_recipients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.campaigns_recipients_id_seq OWNER TO sms_user;

--
-- Name: campaigns_recipients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.campaigns_recipients_id_seq OWNED BY public.campaigns_recipients.id;


--
-- Name: clients; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.clients (
    id integer NOT NULL,
    client_code character varying(50) NOT NULL,
    company_name character varying(255) NOT NULL,
    contact_person character varying(255),
    email character varying(255),
    phone character varying(50),
    address text,
    country character varying(100),
    smpp_username character varying(100) NOT NULL,
    smpp_password character varying(255) NOT NULL,
    smpp_ip character varying(50) DEFAULT '0.0.0.0'::character varying,
    smpp_port integer DEFAULT 2775,
    system_type character varying(50) DEFAULT 'SMPP'::character varying,
    max_tps integer DEFAULT 100,
    billing_mode character varying(20) DEFAULT 'dlr'::character varying,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    balance numeric(15,4) DEFAULT 0.0000,
    credit_limit numeric(15,4) DEFAULT 0.0000,
    api_enabled boolean DEFAULT false,
    webhook_url text,
    force_dlr boolean DEFAULT false,
    dlr_timeout integer DEFAULT 150,
    routing_plan_id integer,
    rate_plan_id integer,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT clients_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'suspended'::character varying])::text[])))
);


ALTER TABLE public.clients OWNER TO sms_user;

--
-- Name: TABLE clients; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.clients IS 'SMPP client accounts with billing info';


--
-- Name: clients_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.clients_id_seq OWNER TO sms_user;

--
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.clients_id_seq OWNED BY public.clients.id;


--
-- Name: dlr_queue; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.dlr_queue (
    id integer NOT NULL,
    message_id character varying(100) NOT NULL,
    smpp_message_id character varying(100),
    destination character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 150,
    force_dlr boolean DEFAULT false,
    dlr_timeout integer DEFAULT 150,
    submitted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_retry_at timestamp without time zone,
    dlr_received_at timestamp without time zone,
    dlr_result character varying(50),
    CONSTRAINT dlr_queue_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'waiting_dlr'::character varying, 'dlr_received'::character varying, 'dlr_failed'::character varying, 'timeout'::character varying])::text[])))
);


ALTER TABLE public.dlr_queue OWNER TO sms_user;

--
-- Name: TABLE dlr_queue; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.dlr_queue IS 'DLR retry queue for undelivered messages';


--
-- Name: dlr_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.dlr_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.dlr_queue_id_seq OWNER TO sms_user;

--
-- Name: dlr_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.dlr_queue_id_seq OWNED BY public.dlr_queue.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    invoice_number character varying(100) NOT NULL,
    entity_type character varying(20) NOT NULL,
    entity_id integer NOT NULL,
    entity_name character varying(255) NOT NULL,
    invoice_to_name character varying(255),
    invoice_to_address text,
    invoice_to_email character varying(255),
    invoice_by_name character varying(255) DEFAULT 'NET2APP Hub'::character varying,
    invoice_by_address text,
    invoice_by_email character varying(255) DEFAULT 'billing@net2app.com'::character varying,
    invoice_by_vat character varying(50),
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_sms integer DEFAULT 0,
    total_amount numeric(15,4) DEFAULT 0,
    tax_amount numeric(15,4) DEFAULT 0,
    tax_rate numeric(5,2) DEFAULT 19.00,
    grand_total numeric(15,4) DEFAULT 0,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    status character varying(20) DEFAULT 'draft'::character varying,
    due_date date,
    paid_date date,
    payment_method character varying(50),
    payment_reference character varying(255),
    notes text,
    bank_name character varying(255),
    bank_account character varying(100),
    bank_iban character varying(50),
    bank_bic character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sent_at timestamp without time zone,
    CONSTRAINT invoices_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['client'::character varying, 'supplier'::character varying])::text[]))),
    CONSTRAINT invoices_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'sent'::character varying, 'paid'::character varying, 'overdue'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.invoices OWNER TO sms_user;

--
-- Name: TABLE invoices; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.invoices IS 'Professional invoices with destination breakdown';


--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.invoices_id_seq OWNER TO sms_user;

--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: license; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.license (
    id integer NOT NULL,
    license_key character varying(255) NOT NULL,
    license_type character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    issued_to character varying(255),
    system_ip character varying(50),
    system_mac character varying(50),
    issued_date date,
    expiry_date date,
    features jsonb DEFAULT '{"rcs": false, "http": true, "smpp": true, "telegram": false, "whatsapp": false, "voice_otp": false}'::jsonb,
    limits jsonb DEFAULT '{"max_tps": 100, "max_clients": 10, "max_suppliers": 5, "max_sms_monthly": 100000}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT license_license_type_check CHECK (((license_type)::text = ANY ((ARRAY['trial'::character varying, 'standard'::character varying, 'enterprise'::character varying, 'unlimited'::character varying])::text[]))),
    CONSTRAINT license_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'expired'::character varying, 'invalid'::character varying, 'suspended'::character varying])::text[])))
);


ALTER TABLE public.license OWNER TO sms_user;

--
-- Name: TABLE license; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.license IS 'Platform license and feature control';


--
-- Name: license_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.license_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.license_id_seq OWNER TO sms_user;

--
-- Name: license_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.license_id_seq OWNED BY public.license.id;


--
-- Name: mccmnc; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.mccmnc (
    id integer NOT NULL,
    country character varying(100) NOT NULL,
    country_code character varying(10) NOT NULL,
    mcc character varying(10) NOT NULL,
    mnc character varying(10) NOT NULL,
    operator character varying(255) NOT NULL,
    network_type character varying(50) DEFAULT 'GSM'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.mccmnc OWNER TO sms_user;

--
-- Name: mccmnc_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.mccmnc_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.mccmnc_id_seq OWNER TO sms_user;

--
-- Name: mccmnc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.mccmnc_id_seq OWNED BY public.mccmnc.id;


--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.notification_templates (
    id integer NOT NULL,
    template_name character varying(255) NOT NULL,
    subject character varying(500) NOT NULL,
    body text NOT NULL,
    variables text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notification_templates OWNER TO sms_user;

--
-- Name: TABLE notification_templates; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.notification_templates IS 'Email notification templates with variables';


--
-- Name: notification_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.notification_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.notification_templates_id_seq OWNER TO sms_user;

--
-- Name: notification_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.notification_templates_id_seq OWNED BY public.notification_templates.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    type character varying(20) DEFAULT 'info'::character varying,
    entity_type character varying(20),
    entity_name character varying(255),
    entity_id integer,
    recipient_email character varying(255),
    recipient_role character varying(50),
    is_read boolean DEFAULT false,
    is_emailed boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notifications_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['client'::character varying, 'supplier'::character varying, 'system'::character varying, 'route'::character varying])::text[]))),
    CONSTRAINT notifications_type_check CHECK (((type)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'error'::character varying, 'success'::character varying])::text[])))
);


ALTER TABLE public.notifications OWNER TO sms_user;

--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.notifications_id_seq OWNER TO sms_user;

--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: ott_devices; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.ott_devices (
    id integer NOT NULL,
    device_name character varying(255) NOT NULL,
    device_type character varying(20) NOT NULL,
    phone_number character varying(50),
    session_status character varying(20) DEFAULT 'disconnected'::character varying,
    qr_code text,
    last_active timestamp without time zone,
    supplier_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ott_devices_device_type_check CHECK (((device_type)::text = ANY ((ARRAY['whatsapp'::character varying, 'telegram'::character varying])::text[]))),
    CONSTRAINT ott_devices_session_status_check CHECK (((session_status)::text = ANY ((ARRAY['connected'::character varying, 'disconnected'::character varying, 'qr_pending'::character varying, 'error'::character varying])::text[])))
);


ALTER TABLE public.ott_devices OWNER TO sms_user;

--
-- Name: ott_devices_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.ott_devices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.ott_devices_id_seq OWNER TO sms_user;

--
-- Name: ott_devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.ott_devices_id_seq OWNED BY public.ott_devices.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    payment_number character varying(100) NOT NULL,
    entity_type character varying(20) NOT NULL,
    entity_id integer NOT NULL,
    entity_name character varying(255) NOT NULL,
    amount numeric(15,4) NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    payment_method character varying(50) NOT NULL,
    reference character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payments_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['client'::character varying, 'supplier'::character varying])::text[]))),
    CONSTRAINT payments_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['bank_transfer'::character varying, 'credit_card'::character varying, 'paypal'::character varying, 'crypto'::character varying, 'stripe'::character varying, 'piprapay'::character varying, 'manual'::character varying])::text[]))),
    CONSTRAINT payments_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying, 'refunded'::character varying])::text[])))
);


ALTER TABLE public.payments OWNER TO sms_user;

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.payments_id_seq OWNER TO sms_user;

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.platform_settings (
    id integer NOT NULL,
    key character varying(255) NOT NULL,
    value text NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.platform_settings OWNER TO sms_user;

--
-- Name: TABLE platform_settings; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.platform_settings IS 'Global platform configuration';


--
-- Name: platform_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.platform_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.platform_settings_id_seq OWNER TO sms_user;

--
-- Name: platform_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.platform_settings_id_seq OWNED BY public.platform_settings.id;


--
-- Name: rates; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.rates (
    id integer NOT NULL,
    entity_type character varying(20) NOT NULL,
    entity_id integer NOT NULL,
    mcc character varying(10) NOT NULL,
    mnc character varying(10) DEFAULT '*'::character varying NOT NULL,
    country character varying(100) NOT NULL,
    operator character varying(100) DEFAULT 'All'::character varying,
    rate numeric(10,6) NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    effective_from date NOT NULL,
    effective_to date,
    is_active boolean DEFAULT true,
    version integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT rates_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['client'::character varying, 'supplier'::character varying])::text[])))
);


ALTER TABLE public.rates OWNER TO sms_user;

--
-- Name: TABLE rates; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.rates IS 'Client/supplier rates with version history';


--
-- Name: rates_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.rates_id_seq OWNER TO sms_user;

--
-- Name: rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.rates_id_seq OWNED BY public.rates.id;


--
-- Name: route_maps; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.route_maps (
    id integer NOT NULL,
    client_id integer NOT NULL,
    route_id integer NOT NULL,
    supplier_id integer NOT NULL,
    mccmnc_pattern character varying(50) DEFAULT '*'::character varying NOT NULL,
    priority integer DEFAULT 1,
    percentage integer DEFAULT 100,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.route_maps OWNER TO sms_user;

--
-- Name: TABLE route_maps; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.route_maps IS 'Client -> Route -> Supplier mapping with MCCMNC patterns';


--
-- Name: route_maps_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.route_maps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.route_maps_id_seq OWNER TO sms_user;

--
-- Name: route_maps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.route_maps_id_seq OWNED BY public.route_maps.id;


--
-- Name: route_plans; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.route_plans (
    id integer NOT NULL,
    plan_name character varying(255) NOT NULL,
    route_ids integer[] DEFAULT '{}'::integer[],
    is_default boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.route_plans OWNER TO sms_user;

--
-- Name: route_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.route_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.route_plans_id_seq OWNER TO sms_user;

--
-- Name: route_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.route_plans_id_seq OWNED BY public.route_plans.id;


--
-- Name: routes; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.routes (
    id integer NOT NULL,
    route_name character varying(255) NOT NULL,
    trunk_ids integer[] DEFAULT '{}'::integer[],
    route_method character varying(20) DEFAULT 'priority'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT routes_route_method_check CHECK (((route_method)::text = ANY ((ARRAY['priority'::character varying, 'percentage'::character varying, 'lcr'::character varying])::text[])))
);


ALTER TABLE public.routes OWNER TO sms_user;

--
-- Name: routes_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.routes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.routes_id_seq OWNER TO sms_user;

--
-- Name: routes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.routes_id_seq OWNED BY public.routes.id;


--
-- Name: sms_logs; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.sms_logs (
    id integer NOT NULL,
    message_id character varying(100) NOT NULL,
    client_id integer,
    client_code character varying(50),
    supplier_id integer,
    supplier_code character varying(50),
    sender_id character varying(100) NOT NULL,
    destination character varying(50) NOT NULL,
    mcc character varying(10),
    mnc character varying(10),
    country character varying(100),
    operator character varying(100),
    message text NOT NULL,
    message_parts integer DEFAULT 1,
    client_rate numeric(10,6) DEFAULT 0,
    supplier_rate numeric(10,6) DEFAULT 0,
    profit numeric(10,6) DEFAULT 0,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    status character varying(20) DEFAULT 'pending'::character varying,
    dlr_status character varying(20),
    dlr_timestamp timestamp without time zone,
    error_code character varying(10),
    error_message text,
    route_id integer,
    route_name character varying(255),
    trunk_name character varying(255),
    smpp_message_id character varying(100),
    registered_delivery integer DEFAULT 1,
    data_coding integer DEFAULT 0,
    esm_class integer DEFAULT 0,
    submit_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    delivery_time timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sms_logs_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'submitted'::character varying, 'sent'::character varying, 'delivered'::character varying, 'failed'::character varying, 'expired'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.sms_logs OWNER TO sms_user;

--
-- Name: TABLE sms_logs; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.sms_logs IS 'Complete SMS transaction log with DLR tracking';


--
-- Name: sms_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.sms_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.sms_logs_id_seq OWNER TO sms_user;

--
-- Name: sms_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.sms_logs_id_seq OWNED BY public.sms_logs.id;


--
-- Name: smtp_config; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.smtp_config (
    id integer NOT NULL,
    host character varying(255) NOT NULL,
    port integer DEFAULT 587,
    encryption character varying(10) DEFAULT 'tls'::character varying,
    username character varying(255),
    password text,
    from_email character varying(255),
    from_name character varying(255),
    is_active boolean DEFAULT true,
    test_status character varying(20) DEFAULT 'untested'::character varying,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT smtp_config_encryption_check CHECK (((encryption)::text = ANY ((ARRAY['tls'::character varying, 'ssl'::character varying, 'none'::character varying])::text[]))),
    CONSTRAINT smtp_config_test_status_check CHECK (((test_status)::text = ANY ((ARRAY['untested'::character varying, 'success'::character varying, 'failed'::character varying])::text[])))
);


ALTER TABLE public.smtp_config OWNER TO sms_user;

--
-- Name: TABLE smtp_config; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.smtp_config IS 'SMTP email configuration';


--
-- Name: smtp_config_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.smtp_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.smtp_config_id_seq OWNER TO sms_user;

--
-- Name: smtp_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.smtp_config_id_seq OWNED BY public.smtp_config.id;


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.suppliers (
    id integer NOT NULL,
    supplier_code character varying(50) NOT NULL,
    company_name character varying(255) NOT NULL,
    contact_person character varying(255),
    email character varying(255),
    phone character varying(50),
    connection_type character varying(50) NOT NULL,
    smpp_host character varying(255),
    smpp_port integer DEFAULT 2775,
    smpp_username character varying(100),
    smpp_password character varying(255),
    system_id character varying(100),
    api_url text,
    api_key text,
    api_secret text,
    api_method character varying(10) DEFAULT 'POST'::character varying,
    balance numeric(15,4) DEFAULT 0.0000,
    credit_limit numeric(15,4) DEFAULT 0.0000,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    bind_status character varying(20) DEFAULT 'unbound'::character varying,
    consecutive_failures integer DEFAULT 0,
    max_failures integer DEFAULT 20,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT suppliers_bind_status_check CHECK (((bind_status)::text = ANY ((ARRAY['bound'::character varying, 'unbound'::character varying, 'binding'::character varying, 'error'::character varying])::text[]))),
    CONSTRAINT suppliers_connection_type_check CHECK (((connection_type)::text = ANY ((ARRAY['smpp'::character varying, 'http'::character varying, 'ott_whatsapp'::character varying, 'ott_telegram'::character varying, 'voice_otp'::character varying, 'local_bypass'::character varying, 'rcs'::character varying, 'flash_sms'::character varying])::text[]))),
    CONSTRAINT suppliers_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'suspended'::character varying])::text[])))
);


ALTER TABLE public.suppliers OWNER TO sms_user;

--
-- Name: TABLE suppliers; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.suppliers IS 'SMPP suppliers and gateways';


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.suppliers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.suppliers_id_seq OWNER TO sms_user;

--
-- Name: suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.suppliers_id_seq OWNED BY public.suppliers.id;


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.tenants (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    features jsonb DEFAULT '{"rcs": false, "http": true, "smpp": true, "telegram": false, "whatsapp": false, "voice_otp": false}'::jsonb,
    limits jsonb DEFAULT '{"max_tps": 100, "max_sms_monthly": 100000}'::jsonb,
    sms_this_month integer DEFAULT 0,
    tps_current integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tenants_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'suspended'::character varying])::text[])))
);


ALTER TABLE public.tenants OWNER TO sms_user;

--
-- Name: TABLE tenants; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.tenants IS 'Tenant management with feature limits';


--
-- Name: tenants_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.tenants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tenants_id_seq OWNER TO sms_user;

--
-- Name: tenants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.tenants_id_seq OWNED BY public.tenants.id;


--
-- Name: translations; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.translations (
    id integer NOT NULL,
    translation_type character varying(50) NOT NULL,
    source_pattern character varying(255) NOT NULL,
    target_value character varying(255) NOT NULL,
    client_id integer,
    supplier_id integer,
    route_id integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT translations_translation_type_check CHECK (((translation_type)::text = ANY ((ARRAY['sender_id'::character varying, 'destination'::character varying, 'content'::character varying, 'origination'::character varying])::text[])))
);


ALTER TABLE public.translations OWNER TO sms_user;

--
-- Name: translations_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.translations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.translations_id_seq OWNER TO sms_user;

--
-- Name: translations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.translations_id_seq OWNED BY public.translations.id;


--
-- Name: trunks; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.trunks (
    id integer NOT NULL,
    trunk_name character varying(255) NOT NULL,
    trunk_type character varying(50) NOT NULL,
    supplier_id integer NOT NULL,
    priority integer DEFAULT 1,
    percentage integer DEFAULT 100,
    is_active boolean DEFAULT true,
    mccmnc_allowed text[] DEFAULT '{*}'::text[],
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT trunks_trunk_type_check CHECK (((trunk_type)::text = ANY ((ARRAY['sim_otp'::character varying, 'sim_marketing'::character varying, 'voice_otp'::character varying, 'local_direct_otp'::character varying, 'local_direct_marketing'::character varying, 'direct_route_otp'::character varying, 'direct_route_marketing'::character varying, 'whatsapp'::character varying, 'telegram'::character varying, 'rcs'::character varying])::text[])))
);


ALTER TABLE public.trunks OWNER TO sms_user;

--
-- Name: trunks_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.trunks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.trunks_id_seq OWNER TO sms_user;

--
-- Name: trunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.trunks_id_seq OWNED BY public.trunks.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'agent'::character varying NOT NULL,
    permissions text[] DEFAULT '{}'::text[],
    client_id integer,
    supplier_id integer,
    name character varying(255),
    is_active boolean DEFAULT true,
    last_login timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.users OWNER TO sms_user;

--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.users IS 'User accounts with roles and permissions';


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO sms_user;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: voice_otp_configs; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.voice_otp_configs (
    id integer NOT NULL,
    language character varying(100) NOT NULL,
    language_code character varying(10) NOT NULL,
    greeting_text text NOT NULL,
    retry_text text,
    audio_0_9 jsonb DEFAULT '{}'::jsonb,
    sip_host character varying(255) DEFAULT 'sip.provider.com'::character varying,
    sip_port integer DEFAULT 5060,
    sip_username character varying(100),
    sip_password character varying(255),
    caller_id character varying(50),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.voice_otp_configs OWNER TO sms_user;

--
-- Name: TABLE voice_otp_configs; Type: COMMENT; Schema: public; Owner: sms_user
--

COMMENT ON TABLE public.voice_otp_configs IS 'Voice OTP language configs with audio files';


--
-- Name: voice_otp_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.voice_otp_configs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.voice_otp_configs_id_seq OWNER TO sms_user;

--
-- Name: voice_otp_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.voice_otp_configs_id_seq OWNED BY public.voice_otp_configs.id;


--
-- Name: voice_otp_logs; Type: TABLE; Schema: public; Owner: sms_user
--

CREATE TABLE public.voice_otp_logs (
    id integer NOT NULL,
    call_id character varying(100) NOT NULL,
    destination character varying(50) NOT NULL,
    otp_code character varying(10) NOT NULL,
    language character varying(100),
    duration integer DEFAULT 0,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 4,
    status character varying(20) DEFAULT 'initiated'::character varying,
    dlr_status character varying(20),
    error_message text,
    sip_call_id character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp without time zone,
    CONSTRAINT voice_otp_logs_status_check CHECK (((status)::text = ANY ((ARRAY['initiated'::character varying, 'ringing'::character varying, 'answered'::character varying, 'completed'::character varying, 'failed'::character varying, 'busy'::character varying, 'no_answer'::character varying, 'timeout'::character varying])::text[])))
);


ALTER TABLE public.voice_otp_logs OWNER TO sms_user;

--
-- Name: voice_otp_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: sms_user
--

CREATE SEQUENCE public.voice_otp_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.voice_otp_logs_id_seq OWNER TO sms_user;

--
-- Name: voice_otp_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sms_user
--

ALTER SEQUENCE public.voice_otp_logs_id_seq OWNED BY public.voice_otp_logs.id;


--
-- Name: api_connectors id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.api_connectors ALTER COLUMN id SET DEFAULT nextval('public.api_connectors_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: campaigns id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.campaigns ALTER COLUMN id SET DEFAULT nextval('public.campaigns_id_seq'::regclass);


--
-- Name: campaigns_recipients id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.campaigns_recipients ALTER COLUMN id SET DEFAULT nextval('public.campaigns_recipients_id_seq'::regclass);


--
-- Name: clients id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.clients ALTER COLUMN id SET DEFAULT nextval('public.clients_id_seq'::regclass);


--
-- Name: dlr_queue id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.dlr_queue ALTER COLUMN id SET DEFAULT nextval('public.dlr_queue_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: license id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.license ALTER COLUMN id SET DEFAULT nextval('public.license_id_seq'::regclass);


--
-- Name: mccmnc id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.mccmnc ALTER COLUMN id SET DEFAULT nextval('public.mccmnc_id_seq'::regclass);


--
-- Name: notification_templates id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.notification_templates ALTER COLUMN id SET DEFAULT nextval('public.notification_templates_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: ott_devices id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.ott_devices ALTER COLUMN id SET DEFAULT nextval('public.ott_devices_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: platform_settings id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.platform_settings ALTER COLUMN id SET DEFAULT nextval('public.platform_settings_id_seq'::regclass);


--
-- Name: rates id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.rates ALTER COLUMN id SET DEFAULT nextval('public.rates_id_seq'::regclass);


--
-- Name: route_maps id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.route_maps ALTER COLUMN id SET DEFAULT nextval('public.route_maps_id_seq'::regclass);


--
-- Name: route_plans id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.route_plans ALTER COLUMN id SET DEFAULT nextval('public.route_plans_id_seq'::regclass);


--
-- Name: routes id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.routes ALTER COLUMN id SET DEFAULT nextval('public.routes_id_seq'::regclass);


--
-- Name: sms_logs id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.sms_logs ALTER COLUMN id SET DEFAULT nextval('public.sms_logs_id_seq'::regclass);


--
-- Name: smtp_config id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.smtp_config ALTER COLUMN id SET DEFAULT nextval('public.smtp_config_id_seq'::regclass);


--
-- Name: suppliers id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN id SET DEFAULT nextval('public.suppliers_id_seq'::regclass);


--
-- Name: tenants id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.tenants ALTER COLUMN id SET DEFAULT nextval('public.tenants_id_seq'::regclass);


--
-- Name: translations id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.translations ALTER COLUMN id SET DEFAULT nextval('public.translations_id_seq'::regclass);


--
-- Name: trunks id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.trunks ALTER COLUMN id SET DEFAULT nextval('public.trunks_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: voice_otp_configs id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.voice_otp_configs ALTER COLUMN id SET DEFAULT nextval('public.voice_otp_configs_id_seq'::regclass);


--
-- Name: voice_otp_logs id; Type: DEFAULT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.voice_otp_logs ALTER COLUMN id SET DEFAULT nextval('public.voice_otp_logs_id_seq'::regclass);


--
-- Data for Name: api_connectors; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: campaigns; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: campaigns_recipients; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.clients VALUES (1, 'CLT001', 'TechCorp Global', 'John Smith', 'john@techcorp.com', '+1234567890', '123 Tech Street, Silicon Valley', 'USA', 'techcorp_smpp', 'secure123', '0.0.0.0', 2775, 'SMPP', 100, 'dlr', 'EUR', 5000.0000, 10000.0000, false, NULL, false, 150, NULL, NULL, 'active', '2026-06-09 09:39:09.507862', '2026-06-09 09:39:09.507862');
INSERT INTO public.clients VALUES (4, 'TriAngle', 'Triangle', NULL, 'triangle@gmail.com', NULL, NULL, NULL, 'tuesday', 'tuesday', '0.0.0.0', 2775, 'SMPP', 100, 'dlr', 'EUR', 0.0000, 100.0000, false, NULL, false, 150, NULL, NULL, 'active', '2026-06-09 11:27:01.12768', '2026-06-09 11:27:01.12768');


--
-- Data for Name: dlr_queue; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: license; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: mccmnc; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.mccmnc VALUES (1, 'United States', 'US', '310', '260', 'T-Mobile USA', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (2, 'United States', 'US', '310', '410', 'AT&T Mobility', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (3, 'United States', 'US', '311', '480', 'Verizon Wireless', 'CDMA', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (4, 'United Kingdom', 'GB', '234', '10', 'O2 UK', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (5, 'United Kingdom', 'GB', '234', '15', 'Vodafone UK', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (6, 'Germany', 'DE', '262', '01', 'Telekom Deutschland', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (7, 'France', 'FR', '208', '01', 'Orange France', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (8, 'Spain', 'ES', '214', '01', 'Vodafone Spain', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (9, 'India', 'IN', '404', '10', 'Airtel India', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (10, 'Bangladesh', 'BD', '470', '01', 'Grameenphone', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (11, 'Saudi Arabia', 'SA', '420', '01', 'STC', 'GSM', 'active', '2026-06-09 09:39:09.675165');


--
-- Data for Name: notification_templates; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.notification_templates VALUES (1, 'Low Balance Alert', 'Low Balance Alert — {{client_name}} ({{client_code}})', 'Dear {{client_name}},\n\nYour account balance is low. Current balance: €{{balance}}\n\nPlease top up your account to continue service.\n\nNET2APP Hub', '{client_name,client_code,smpp_username,balance}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (2, 'Client Account Created', 'Welcome to {{platform_name}} — SMPP Account Created', 'Dear {{client_name}},\n\nWelcome to {{platform_name}}!\n\nClient Code: {{client_code}}SMPP Username: {{smpp_username}}\n\nBest regards,\nNET2APP Hub Team', '{client_name,company_name,client_code,smpp_username,platform_name}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (3, 'Supplier Account Created', 'Supplier Account Created — {{supplier_code}}', 'Dear {{contact_person}},\n\nSupplier account created.\n\nSupplier Code: {{supplier_code}}Connection Type: {{connection_type}}\n\nNET2APP Hub', '{contact_person,company_name,supplier_code,connection_type}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (4, 'Invoice Generated', 'Invoice {{invoice_number}} — {{client_name}}', 'Dear {{client_name}},\n\nInvoice {{invoice_number}} generated.\n\nPeriod: {{period_start}} to {{period_end}}Total: €{{total_amount}}Due: {{due_date}}\n\nNET2APP Hub', '{client_name,invoice_number,period_start,period_end,total_amount,due_date}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (5, 'Payment Received', 'Payment Received — €{{amount}} — {{entity_name}}', 'Dear {{entity_name}},\n\nPayment of €{{amount}} received via {{payment_method}}.\n\nReference: {{reference}}\n\nNET2APP Hub', '{entity_name,payment_number,amount,payment_method}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (6, 'Rate Change Notice', 'Rate Update Notice — {{destination}}', 'Dear {{entity_name}},\n\nRate change notification.\n\nDestination: {{destination}}Old Rate: €{{old_rate}} → New Rate: €{{new_rate}}Effective: {{effective_date}}\n\nNET2APP Hub', '{entity_name,entity_code,smpp_username,destination,old_rate,new_rate,effective_date}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (7, 'Channel Disconnect', '⚠ Channel Disconnected — {{entity_code}}', 'Alert! Channel disconnected.\n\nEntity: {{entity_name}} ({{entity_code}})Type: {{entity_type}}Failures: {{failure_count}}\n\nNET2APP Hub System', '{entity_code,entity_name,entity_type,smpp_username,failure_count}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (8, 'Payment Reminder', 'Payment Reminder — Invoice {{invoice_number}}', 'Dear {{client_name}},\n\nPayment reminder for invoice {{invoice_number}}.\n\nAmount Due: €{{amount_due}}Due Date: {{due_date}}\n\nPlease pay promptly.\n\nNET2APP Hub', '{client_name,invoice_number,amount_due,due_date}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (9, 'DLR Failure Alert', '⚠ DLR Failure Alert — {{route_name}}', 'Alert! High DLR failure rate detected.\n\nRoute: {{route_name}}Supplier: {{supplier_name}}Failures: {{failure_count}} in 20 consecutiveAction: Route auto-blocked\n\nNET2APP Hub System', '{route_name,supplier_name,failure_count,action_taken}', true, '2026-06-09 09:39:09.947337');


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: ott_devices; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: platform_settings; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.platform_settings VALUES (1, 'platform_name', 'NET2APP Hub', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (2, 'support_email', 'support@net2app.com', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (3, 'company_name', 'NET2APP Technologies', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (4, 'company_address', '123 Tech Park, Innovation City', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (5, 'company_phone', '+1-800-SMS-HUB', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (6, 'company_email', 'info@net2app.com', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (7, 'company_vat', 'VAT-2024-001', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (8, 'currency', 'EUR', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (9, 'invoice_prefix', 'INV-2024-', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (10, 'payment_prefix', 'PAY-2024-', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (11, 'default_tax_rate', '19.00', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (12, 'force_dlr_default', 'true', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (13, 'dlr_timeout_default', '150', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (14, 'auto_block_failures', '20', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (15, 'max_retry_attempts', '4', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (16, 'voice_otp_retry_interval', '30', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (17, 'voice_otp_max_retries', '4', '2026-06-09 09:39:10.025429');


--
-- Data for Name: rates; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.rates VALUES (1, 'client', 1, '310', '*', 'United States', 'All', 0.025000, 'EUR', '2024-01-01', NULL, true, 2, '2026-06-09 09:39:09.666944');
INSERT INTO public.rates VALUES (2, 'client', 1, '310', '*', 'United States', 'All', 0.020000, 'EUR', '2023-06-01', NULL, false, 1, '2026-06-09 09:39:09.666944');
INSERT INTO public.rates VALUES (3, 'client', 1, '234', '*', 'United Kingdom', 'All', 0.022000, 'EUR', '2024-01-01', NULL, true, 1, '2026-06-09 09:39:09.666944');


--
-- Data for Name: route_maps; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: route_plans; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.route_plans VALUES (1, 'Premium Plan', '{1,3,4}', true, '2026-06-09 09:39:09.629467');
INSERT INTO public.route_plans VALUES (2, 'Marketing Plan', '{2}', false, '2026-06-09 09:39:09.629467');


--
-- Data for Name: routes; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.routes VALUES (1, 'Premium OTP Route', '{2,1}', 'priority', true, '2026-06-09 09:39:09.602783');
INSERT INTO public.routes VALUES (2, 'Marketing Blend', '{1,3}', 'percentage', true, '2026-06-09 09:39:09.602783');
INSERT INTO public.routes VALUES (3, 'OTT Messaging', '{4}', 'lcr', true, '2026-06-09 09:39:09.602783');
INSERT INTO public.routes VALUES (4, 'Voice OTP Fallback', '{5}', 'priority', true, '2026-06-09 09:39:09.602783');


--
-- Data for Name: sms_logs; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: smtp_config; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.suppliers VALUES (7, 'SMS Gateway', 'SMS Gateway', NULL, NULL, NULL, 'smpp', '5.78.72.23', 2775, 'testing', 'test123', NULL, NULL, NULL, NULL, 'POST', 0.0000, 0.0000, 'EUR', 'bound', 0, 20, 'active', '2026-06-09 11:29:54.511931', '2026-06-09 14:43:01.961522');


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: translations; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: trunks; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.users VALUES (2, 'support', '$2b$10$go8iES96OdPXtctpkUwB8O.YL3K.qYt9bXVc2eLpEKJ94JZBLK.rS', 'support@net2app.com', 'support', '{view_clients,view_suppliers,view_sms_logs,test_sms,manage_bind,view_reports}', NULL, NULL, 'Support Team', true, NULL, '2026-06-09 09:39:09.471572', '2026-06-09 09:51:24.733133');
INSERT INTO public.users VALUES (3, 'billing', '$2b$10$fBqvyfqZV6dZK7axci67HOUM8vuc2rvXcD0qYFNXysz3auDJB3H.y', 'billing@net2app.com', 'billing', '{manage_invoices,manage_payments,view_reports,view_clients,view_suppliers}', NULL, NULL, 'Billing Team', true, NULL, '2026-06-09 09:39:09.471572', '2026-06-09 09:51:24.833456');
INSERT INTO public.users VALUES (4, 'techcorp_user', '$2b$10$Zt.WIqiILxykAjWoVZPKDOgi10wCEzOzQOdPd67xvrEzsFzYoVnhy', 'user@techcorp.com', 'client', '{view_own_cdr,view_own_usage,view_own_payments,test_sms,send_sms}', NULL, NULL, 'TechCorp Client', true, NULL, '2026-06-09 09:39:09.471572', '2026-06-09 09:51:24.93314');
INSERT INTO public.users VALUES (5, 'globalsms_user', '$2b$10$sfB9PCsRuYtfTtIcXyz4oOCy0EIic0fi3f8hiOc0cLwDFL9tIpBWi', 'user@globalsms.com', 'supplier', '{view_own_cdr,view_own_usage,view_own_payments,view_bind_status}', NULL, NULL, 'GlobalSMS Supplier', true, NULL, '2026-06-09 09:39:09.471572', '2026-06-09 09:51:25.03261');
INSERT INTO public.users VALUES (1, 'admin', '$2b$10$Dgn0lX.YsCknRKpubzLPKupqvy43UK96e1osMOJkbXaDhFiQGqpQK', 'admin@net2app.com', 'super_admin', '{all}', NULL, NULL, 'Super Admin', true, '2026-06-09 14:14:55.890154', '2026-06-09 09:39:09.471572', '2026-06-09 14:14:55.890154');


--
-- Data for Name: voice_otp_configs; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: voice_otp_logs; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Name: api_connectors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.api_connectors_id_seq', 1, false);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 1, false);


--
-- Name: campaigns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.campaigns_id_seq', 1, false);


--
-- Name: campaigns_recipients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.campaigns_recipients_id_seq', 1, false);


--
-- Name: clients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.clients_id_seq', 4, true);


--
-- Name: dlr_queue_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.dlr_queue_id_seq', 1, false);


--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.invoices_id_seq', 1, false);


--
-- Name: license_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.license_id_seq', 1, false);


--
-- Name: mccmnc_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.mccmnc_id_seq', 11, true);


--
-- Name: notification_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.notification_templates_id_seq', 9, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.notifications_id_seq', 1, false);


--
-- Name: ott_devices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.ott_devices_id_seq', 1, false);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.payments_id_seq', 1, false);


--
-- Name: platform_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.platform_settings_id_seq', 17, true);


--
-- Name: rates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.rates_id_seq', 6, true);


--
-- Name: route_maps_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.route_maps_id_seq', 4, true);


--
-- Name: route_plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.route_plans_id_seq', 2, true);


--
-- Name: routes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.routes_id_seq', 4, true);


--
-- Name: sms_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.sms_logs_id_seq', 1, false);


--
-- Name: smtp_config_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.smtp_config_id_seq', 1, false);


--
-- Name: suppliers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.suppliers_id_seq', 7, true);


--
-- Name: tenants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.tenants_id_seq', 1, false);


--
-- Name: translations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.translations_id_seq', 1, false);


--
-- Name: trunks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.trunks_id_seq', 5, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.users_id_seq', 5, true);


--
-- Name: voice_otp_configs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.voice_otp_configs_id_seq', 1, false);


--
-- Name: voice_otp_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.voice_otp_logs_id_seq', 1, false);


--
-- Name: api_connectors api_connectors_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.api_connectors
    ADD CONSTRAINT api_connectors_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: campaigns_recipients campaigns_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.campaigns_recipients
    ADD CONSTRAINT campaigns_recipients_pkey PRIMARY KEY (id);


--
-- Name: clients clients_client_code_key; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_client_code_key UNIQUE (client_code);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: clients clients_smpp_username_key; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_smpp_username_key UNIQUE (smpp_username);


--
-- Name: dlr_queue dlr_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.dlr_queue
    ADD CONSTRAINT dlr_queue_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: license license_license_key_key; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.license
    ADD CONSTRAINT license_license_key_key UNIQUE (license_key);


--
-- Name: license license_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.license
    ADD CONSTRAINT license_pkey PRIMARY KEY (id);


--
-- Name: mccmnc mccmnc_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.mccmnc
    ADD CONSTRAINT mccmnc_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: ott_devices ott_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.ott_devices
    ADD CONSTRAINT ott_devices_pkey PRIMARY KEY (id);


--
-- Name: payments payments_payment_number_key; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_payment_number_key UNIQUE (payment_number);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_key_key UNIQUE (key);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: rates rates_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.rates
    ADD CONSTRAINT rates_pkey PRIMARY KEY (id);


--
-- Name: route_maps route_maps_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.route_maps
    ADD CONSTRAINT route_maps_pkey PRIMARY KEY (id);


--
-- Name: route_plans route_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.route_plans
    ADD CONSTRAINT route_plans_pkey PRIMARY KEY (id);


--
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (id);


--
-- Name: sms_logs sms_logs_message_id_key; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.sms_logs
    ADD CONSTRAINT sms_logs_message_id_key UNIQUE (message_id);


--
-- Name: sms_logs sms_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.sms_logs
    ADD CONSTRAINT sms_logs_pkey PRIMARY KEY (id);


--
-- Name: smtp_config smtp_config_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.smtp_config
    ADD CONSTRAINT smtp_config_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_supplier_code_key; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_supplier_code_key UNIQUE (supplier_code);


--
-- Name: tenants tenants_code_key; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_code_key UNIQUE (code);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: translations translations_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.translations
    ADD CONSTRAINT translations_pkey PRIMARY KEY (id);


--
-- Name: trunks trunks_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.trunks
    ADD CONSTRAINT trunks_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: voice_otp_configs voice_otp_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.voice_otp_configs
    ADD CONSTRAINT voice_otp_configs_pkey PRIMARY KEY (id);


--
-- Name: voice_otp_logs voice_otp_logs_call_id_key; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.voice_otp_logs
    ADD CONSTRAINT voice_otp_logs_call_id_key UNIQUE (call_id);


--
-- Name: voice_otp_logs voice_otp_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.voice_otp_logs
    ADD CONSTRAINT voice_otp_logs_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_logs_time; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_audit_logs_time ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_user; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_clients_code; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_clients_code ON public.clients USING btree (client_code);


--
-- Name: idx_clients_email; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_clients_email ON public.clients USING btree (email);


--
-- Name: idx_dlr_queue_force; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_dlr_queue_force ON public.dlr_queue USING btree (force_dlr) WHERE (force_dlr = true);


--
-- Name: idx_dlr_queue_message_id; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_dlr_queue_message_id ON public.dlr_queue USING btree (message_id);


--
-- Name: idx_dlr_queue_status; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_dlr_queue_status ON public.dlr_queue USING btree (status);


--
-- Name: idx_invoices_entity; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_invoices_entity ON public.invoices USING btree (entity_type, entity_id);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_mccmnc_country; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_mccmnc_country ON public.mccmnc USING btree (country);


--
-- Name: idx_mccmnc_mcc; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_mccmnc_mcc ON public.mccmnc USING btree (mcc);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (is_read) WHERE (is_read = false);


--
-- Name: idx_payments_entity; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_payments_entity ON public.payments USING btree (entity_type, entity_id);


--
-- Name: idx_rates_destination; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_rates_destination ON public.rates USING btree (entity_type, entity_id, mcc, mnc);


--
-- Name: idx_rates_effective; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_rates_effective ON public.rates USING btree (effective_from, effective_to);


--
-- Name: idx_rates_entity_active; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_rates_entity_active ON public.rates USING btree (entity_type, entity_id, is_active);


--
-- Name: idx_route_maps_client_mccmnc; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_route_maps_client_mccmnc ON public.route_maps USING btree (client_id, mccmnc_pattern);


--
-- Name: idx_route_maps_supplier; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_route_maps_supplier ON public.route_maps USING btree (supplier_id);


--
-- Name: idx_routes_active; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_routes_active ON public.routes USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_sms_logs_client_date; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_sms_logs_client_date ON public.sms_logs USING btree (client_id, submit_time);


--
-- Name: idx_sms_logs_client_id; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_sms_logs_client_id ON public.sms_logs USING btree (client_id);


--
-- Name: idx_sms_logs_destination; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_sms_logs_destination ON public.sms_logs USING btree (destination);


--
-- Name: idx_sms_logs_message_id; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_sms_logs_message_id ON public.sms_logs USING btree (message_id);


--
-- Name: idx_sms_logs_smpp_message_id; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_sms_logs_smpp_message_id ON public.sms_logs USING btree (smpp_message_id);


--
-- Name: idx_sms_logs_status; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_sms_logs_status ON public.sms_logs USING btree (status);


--
-- Name: idx_sms_logs_submit_time; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_sms_logs_submit_time ON public.sms_logs USING btree (submit_time);


--
-- Name: idx_sms_logs_supplier_id; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_sms_logs_supplier_id ON public.sms_logs USING btree (supplier_id);


--
-- Name: idx_suppliers_bind; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_suppliers_bind ON public.suppliers USING btree (bind_status);


--
-- Name: idx_suppliers_code; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_suppliers_code ON public.suppliers USING btree (supplier_code);


--
-- Name: idx_suppliers_type; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_suppliers_type ON public.suppliers USING btree (connection_type);


--
-- Name: idx_trunks_supplier_active; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_trunks_supplier_active ON public.trunks USING btree (supplier_id, is_active);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: idx_voice_otp_logs_status; Type: INDEX; Schema: public; Owner: sms_user
--

CREATE INDEX idx_voice_otp_logs_status ON public.voice_otp_logs USING btree (status);


--
-- Name: invoices generate_invoice_number_trigger; Type: TRIGGER; Schema: public; Owner: sms_user
--

CREATE TRIGGER generate_invoice_number_trigger BEFORE INSERT ON public.invoices FOR EACH ROW WHEN ((new.invoice_number IS NULL)) EXECUTE FUNCTION public.generate_invoice_number();


--
-- Name: payments generate_payment_number_trigger; Type: TRIGGER; Schema: public; Owner: sms_user
--

CREATE TRIGGER generate_payment_number_trigger BEFORE INSERT ON public.payments FOR EACH ROW WHEN ((new.payment_number IS NULL)) EXECUTE FUNCTION public.generate_payment_number();


--
-- Name: sms_logs generate_sms_message_id; Type: TRIGGER; Schema: public; Owner: sms_user
--

CREATE TRIGGER generate_sms_message_id BEFORE INSERT ON public.sms_logs FOR EACH ROW WHEN ((new.message_id IS NULL)) EXECUTE FUNCTION public.generate_message_id();


--
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: sms_user
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: suppliers update_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: sms_user
--

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: sms_user
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: campaigns campaigns_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: campaigns_recipients campaigns_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.campaigns_recipients
    ADD CONSTRAINT campaigns_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: dlr_queue dlr_queue_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.dlr_queue
    ADD CONSTRAINT dlr_queue_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.sms_logs(message_id);


--
-- Name: ott_devices ott_devices_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.ott_devices
    ADD CONSTRAINT ott_devices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: route_maps route_maps_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.route_maps
    ADD CONSTRAINT route_maps_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: route_maps route_maps_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.route_maps
    ADD CONSTRAINT route_maps_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id);


--
-- Name: route_maps route_maps_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.route_maps
    ADD CONSTRAINT route_maps_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: sms_logs sms_logs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.sms_logs
    ADD CONSTRAINT sms_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: sms_logs sms_logs_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.sms_logs
    ADD CONSTRAINT sms_logs_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: translations translations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.translations
    ADD CONSTRAINT translations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: translations translations_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.translations
    ADD CONSTRAINT translations_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id);


--
-- Name: translations translations_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.translations
    ADD CONSTRAINT translations_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: trunks trunks_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sms_user
--

ALTER TABLE ONLY public.trunks
    ADD CONSTRAINT trunks_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

GRANT ALL ON SCHEMA public TO sms_user;


--
-- PostgreSQL database dump complete
--

\unrestrict BwMvjgpt7vsE1dmWFvCYaIcb5vS1YrH5CXe5lBhs7DCHBofSSy4dVDqOxdmxoeR

