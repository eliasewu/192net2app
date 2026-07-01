// ==================== CORE TYPES ====================

export type UserRole = 'super_admin' | 'admin' | 'support' | 'billing' | 'agent' | 'client' | 'supplier';

export type ConnectionType = 'smpp' | 'http' | 'rcs' | 'flash_sms' | 'ott_whatsapp' | 'ott_telegram' | 'voice_otp' | 'local_bypass' | 'email';

export type BillingMode = 'submit' | 'dlr';

export type Currency = 'EUR' | 'USD' | 'GBP';

export type TrunkType = 'sim_otp' | 'sim_marketing' | 'voice_otp' | 'local_direct_otp' | 'local_direct_marketing' | 'direct_route_otp' | 'direct_route_marketing' | 'whatsapp' | 'telegram' | 'rcs';

export type RouteMethod = 'percentage' | 'lcr' | 'priority';

export type SMSStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'expired' | 'rejected' | 'submitted';

export type BindStatus = 'bound' | 'unbound' | 'binding' | 'error';

export type EntityType = 'client' | 'supplier';

// ==================== CLIENT ====================

export interface Client {
  id: string;
  client_code: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  
  // SMPP Settings
  smpp_username: string;
  smpp_password: string;
  smpp_ip: string;
  client_ips: string;
  smpp_port: number;
  system_type: string;
  max_tps: number;
  
  // Billing
  billing_mode: BillingMode;
  currency: Currency;
  balance: number;
  credit_limit: number;
  
  // Advanced
  api_enabled: boolean;
  webhook_url: string;
  force_dlr: boolean;
  /** How force-DLR timeout is determined:
   *  'fixed'       — use dlr_timeout seconds (default 150)
   *  'random_0_5'  — random 0–5 seconds for testing
   *  'random_0_10' — random 0–10 seconds for testing */
  force_dlr_timeout_mode: 'fixed' | 'random_0_5' | 'random_0_10';
  dlr_timeout: number;
  
  // Connection type — determines how client submits messages
  connection_type?: ConnectionType;
  api_connector_id?: string | null;
  voice_otp_config_id?: string | null;
  whatsapp_device_ids?: string[];
  telegram_device_ids?: string[];
  
  // Routing
  routing_plan_id: string | null;
  
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
  updated_at: string;
}

// ==================== SUPPLIER ====================

export interface Supplier {
  id: string;
  supplier_code: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  
  // Connection
  connection_type: ConnectionType;
  smpp_host: string;
  smpp_port: number;
  smpp_username: string;
  smpp_password: string;
  system_id: string;
  /**
   * SMPP protocol-version preference for the bind_transceiver PDU's
   * `interface_version` byte. `auto` lets the Java 21 SMPP gateway
   * pick (typically the highest supported). Strings like '3.3', '3.4',
   * '5.0' map to bytes 0x33, 0x34, 0x50 respectively.
   */
  smpp_version?: 'auto' | '3.3' | '3.4' | '5.0';

  /**
   * When true the supplier connects TO us (ESME client role) instead of us
   * dialling out to them. Required for GSM gateways (eJoin, Skyline) behind
   * NAT that don't have a public IP. The supplier authenticates via its
   * smpp_username / smpp_password on the ESME port.
   */
  is_inbound?: boolean;

  /**
   * SMPP system_type sent in the bind PDU. Per-SMSC configurable:
   * - "" (empty) for EIMS and most modern SMSCs
   * - "CMT" for legacy SMSCs that require it
   * - "SMPP", "VMA", or custom for specific providers
   * Defaults to empty string for maximum compatibility.
   */
  smpp_system_type?: string;

  /** SMPP bind type: trx=transceiver, tx=transmitter only, rx=receiver only. */
  smpp_bind_type?: 'trx' | 'tx' | 'rx';
  /** Type of Number for address_range in bind PDU. 0=UNKNOWN, 1=INTERNATIONAL, 2=NETWORK_SPECIFIC, 5=ALPHANUMERIC. */
  smpp_addr_ton?: number;
  /** Numbering Plan Indicator for address_range. 0=UNKNOWN, 1=ISDN. */
  smpp_addr_npi?: number;
  /** Address range: 'system_id' (use systemId), '' (empty), or 'null'. */
  smpp_addr_range?: string;
  
  // HTTP API
  api_url: string;
  api_key: string;
  api_method: 'GET' | 'POST';
  
  // Billing
  balance: number;
  credit_limit: number;
  currency: Currency;
  
  // DLR
  force_dlr: boolean;
  force_dlr_timeout_mode: 'fixed' | 'random_0_5' | 'random_0_10';
  dlr_timeout: number;
  
  // Status
  bind_status: BindStatus;
  status: 'active' | 'inactive' | 'suspended';
  consecutive_failures: number;
  
  created_at: string;
  updated_at: string;
}

// ==================== ROUTING ====================

export interface Trunk {
  id: string;
  trunk_name: string;
  trunk_type: TrunkType;
  supplier_id: string;
  priority: number;
  percentage: number;
  is_active: boolean;
  mccmnc_allowed: string[];
  created_at: string;
}

export interface Route {
  id: string;
  route_name: string;
  trunk_ids: string[];
  route_method: RouteMethod;
  is_active: boolean;
  created_at: string;
}

export interface RoutePlan {
  id: string;
  plan_name: string;
  route_ids: string[];
  is_default: boolean;
  created_at: string;
}

export interface RouteMap {
  id: string;
  client_id: string;
  route_id: string;
  supplier_id: string;
  mccmnc_pattern: string;
  priority: number;
  percentage: number;
  is_active: boolean;
  created_at?: string;
}

// ==================== RATES ====================

export interface Rate {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  mcc: string;
  mnc: string;
  country: string;
  operator: string;
  rate: number;
  currency: Currency;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  version?: number;
  created_at?: string;
}

export interface MCCMNC {
  id: string;
  country: string;
  country_code: string;
  mcc: string;
  mnc: string;
  operator: string;
  network_type: string;
  status: 'active' | 'inactive';
}

// ==================== BILLING ====================

export interface Invoice {
  id: string;
  invoice_number: string;
  entity_type: EntityType;
  entity_id: string;
  entity_name: string;
  period_start: string;
  period_end: string;
  total_sms: number;
  total_amount: number;
  tax_amount: number;
  grand_total: number;
  currency: Currency;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  due_date: string;
  paid_date: string | null;
  notes: string;
  created_at: string;
}

export interface Payment {
  id: string;
  payment_number: string;
  entity_type: EntityType;
  entity_id: string;
  entity_name: string;
  amount: number;
  currency: Currency;
  payment_method: 'bank_transfer' | 'credit_card' | 'paypal' | 'crypto' | 'manual';
  reference: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  created_at: string;
}

// ==================== SMS LOG ====================

export interface SMSLog {
  id: string;
  message_id: string;
  client_id: string;
  client_code: string;
  supplier_id: string | null;
  supplier_code: string | null;
  
  sender_id: string;
  destination: string;
  mcc: string;
  mnc: string;
  country: string;
  operator: string;
  
  message: string;
  message_parts: number;
  
  client_rate: number;
  supplier_rate: number;
  profit: number;
  currency: Currency;
  
  status: SMSStatus;
  dlr_status: string | null;
  dlr_timestamp: string | null;
  dlr_result: string | null;
  dlr_response_time: number | null;
  dlr_duration: number | null;
  error_code: string | null;
  error_message: string | null;
  
  route_name: string | null;
  trunk_name: string | null;
  trunk_id: number | null;
  
  smpp_message_id: string | null;
  registered_delivery: number | null;
  data_coding: number | null;
  esm_class: number | null;
  channel: string | null;
  source: string | null;
  dlr_callback_url: string | null;
  
  submit_time: string;
  delivery_time: string | null;
  
  created_at: string;
}

// ==================== TRANSLATIONS ====================

export interface Translation {
  id: string;
  translation_type: 'sender_id' | 'destination' | 'content' | 'origination';
  source_pattern: string;
  target_value: string;
  client_id: string | null;
  supplier_id: string | null;
  route_id: string | null;
  name?: string;
  description?: string;
  subtype?: string;
  priority?: number;
  apply_to?: string;
  apply_entity_id?: string;
  is_active: boolean;
  created_at: string;
}

// ==================== SMTP CONFIG ====================

export interface SMTPConfig {
  host: string;
  port: number;
  encryption: 'tls' | 'ssl' | 'none';
  username: string;
  password: string;
  from_email: string;
  from_name: string;
}

// ==================== EMAIL TEMPLATES ====================

export interface EmailTemplate {
  id: string;
  template_name: string;
  subject: string;
  body: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
}

// ==================== NOTIFICATIONS ====================

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  entity_type: EntityType | 'system';
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

// ==================== OTT DEVICES ====================

export interface OTTDevice {
  id: string;
  device_name: string;
  device_type: 'whatsapp' | 'telegram';
  phone_number: string;
  session_status: 'connected' | 'disconnected' | 'qr_pending' | 'error';
  qr_code: string | null;
  last_active: string | null;
  supplier_id: string;
  created_at: string;
}

// ==================== VOICE OTP ====================

export interface VoiceOTPConfig {
  id: string;
  language: string;
  language_code: string;
  greeting_text: string;
  retry_text: string;
  audio_file_url: string | null;
  sip_host: string;
  sip_port: number;
  caller_id: string;
  is_active: boolean;
}

export interface VoiceOTPLog {
  id: string;
  call_id: string;
  destination: string;
  otp_code: string;
  language: string;
  duration: number;
  status: 'initiated' | 'ringing' | 'answered' | 'completed' | 'failed' | 'busy' | 'no_answer';
  created_at: string;
}

// ==================== API CONNECTOR ====================

export interface APIConnector {
  id: string;
  name: string;
  provider: string;
  region: string;
  auth_type: 'api_key' | 'basic' | 'oauth2' | 'bearer';
  http_method: 'GET' | 'POST';
  api_key: string;
  send_url_template: string;
  dlr_url_template: string;
  submit_success_pattern: string;
  dlr_success_pattern: string;
  dlr_success_value: string;
  is_active: boolean;
  created_at: string;
}

// ==================== USERS ====================

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  client_id: string | null;
  supplier_id: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

// ==================== DASHBOARD STATS ====================

export interface DashboardStats {
  total_clients: number;
  active_clients: number;
  total_suppliers: number;
  active_suppliers: number;
  total_sms_today: number;
  total_sms_month: number;
  delivered_percentage: number;
  failed_percentage: number;
  revenue_today: number;
  revenue_month: number;
  cost_today: number;
  cost_month: number;
  profit_today: number;
  profit_month: number;
  active_binds: number;
  total_binds: number;
}

// ==================== RESIDENTIAL PROXIES ====================
export interface ResidentialProxy {
  id: string;
  name: string;
  proxy_type: 'residential' | 'datacenter' | 'isp' | 'socks5';
  host: string;
  port: number;
  username: string;
  password: string;
  public_ip: string;
  is_active: boolean;
  is_online: boolean;
  last_heartbeat: string | null;
  created_at: string;
  updated_at: string;
}

// ==================== SOCIAL API SUPPLIERS ====================
export interface SocialAPISupplier {
  id: string;
  name: string;
  platform: 'whatsapp_cloud' | 'telegram_bot';
  // WhatsApp Cloud API
  phone_number_id: string;
  business_account_id: string;
  access_token: string;
  webhook_verify_token: string;
  // Telegram Bot API
  bot_token: string;
  bot_username: string;
  // Residential Proxy
  proxy_enabled: boolean;
  proxy_host: string;
  proxy_port: number;
  proxy_username: string;
  proxy_password: string;
  proxy_type: 'residential' | 'datacenter' | 'isp';
  // Status
  is_active: boolean;
  connection_status: 'connected' | 'disconnected' | 'error' | 'untested';
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
}

// ==================== CAMPAIGN ====================

export interface Campaign {
  id: string;
  campaign_name: string;
  client_id: string;
  sender_id: string;
  message_template: string;
  recipients_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}
