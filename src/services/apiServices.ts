import { api } from './api';

// ==================== REAL SMS SENDING ====================
export const smsService = {
  sendSMS: async (data: { client_id?: string; destination: string; sender_id: string; message: string; route_id?: string; force_route?: boolean; test_mode?: boolean; }) => {
    return api.post('/sms/send', { ...data, timestamp: new Date().toISOString() });
  },
  validateSending: async (client_id: string, destination: string) => {
    return api.post('/sms/validate', { client_id, destination });
  },
  getDLR: async (message_id: string) => {
    return api.get(`/sms/dlr/${message_id}`);
  },
  batchDLR: async (message_ids: string[]) => {
    return api.post('/sms/dlr/batch', { message_ids });
  },
};

// ==================== RATE MANAGEMENT ====================
export const rateService = {
  createRate: async (data: { entity_type: 'client' | 'supplier'; entity_id: string; mcc: string; mnc: string; country: string; operator: string; rate: number; currency: string; effective_from: string; send_notification?: boolean; }) => {
    const response = await api.post('/rates', data);
    if (data.send_notification && response.success) {
      await api.post('/rates/notify', { entity_type: data.entity_type, entity_id: data.entity_id, rate_ids: [response.data?.id] });
    }
    return response;
  },
  bulkCreateRates: async (rates: Array<{ entity_type: 'client' | 'supplier'; entity_id: string; mcc: string; mnc: string; country: string; operator: string; rate: number; currency: string; }>) => {
    const rateKeys = rates.map(r => ({ entity_type: r.entity_type, entity_id: r.entity_id, mcc: r.mcc, mnc: r.mnc }));
    await api.post('/rates/deactivate-old', { rates: rateKeys });
    return api.post('/rates/bulk', { rates });
  },
  getRateHistory: async (entity_type: string, entity_id: string, mcc: string, mnc: string) => {
    return api.get(`/rates/history?entity_type=${entity_type}&entity_id=${entity_id}&mcc=${mcc}&mnc=${mnc}`);
  },
  sendRateNotification: async (entity_type: string, entity_id: string, rate_ids: string[]) => {
    return api.post('/rates/notify', { entity_type, entity_id, rate_ids });
  },
  getDestinationRates: async (entity_type: string, entity_id: string, mcc: string) => {
    return api.get(`/rates/destination?entity_type=${entity_type}&entity_id=${entity_id}&mcc=${mcc}`);
  },
  updateDestinationRates: async (data: { entity_type: string; entity_id: string; mcc: string; new_rate: number; mnc_list?: string[]; send_notification?: boolean; }) => {
    return api.post('/rates/update-destination', data);
  },
};

// ==================== BILLING ====================
export const invoiceService = {
  generateInvoice: async (data: { entity_type: 'client' | 'supplier'; entity_id: string; period_start: string; period_end: string; due_days?: number; notes?: string; auto_send?: boolean; }) => {
    const response = await api.post('/invoices/generate', data);
    if (data.auto_send && response.success) {
      await api.post(`/invoices/${response.data?.id}/send`, {});
    }
    return response;
  },
  getInvoiceDetail: async (id: string) => {
    return api.get(`/invoices/${id}`);
  },
  getInvoiceBreakdown: async (id: string) => {
    return api.get(`/invoices/${id}/breakdown`);
  },
  sendInvoice: async (id: string, additional_emails?: string[]) => {
    return api.post(`/invoices/${id}/send`, { additional_emails });
  },
  markInvoicePaid: async (id: string, data: { payment_method: string; reference: string }) => {
    return api.post(`/invoices/${id}/mark-paid`, data);
  },
  getInvoicePDF: async (id: string) => {
    return api.get(`/invoices/${id}/pdf`);
  },
  generateBulkInvoices: async (data: { entity_type: 'client' | 'supplier'; entity_ids: string[]; period_start: string; period_end: string; }) => {
    return api.post('/invoices/bulk-generate', data);
  },
};

// ==================== PAYMENT SERVICE ====================
export const paymentService = {
  addPayment: async (data: { entity_type: 'client' | 'supplier'; entity_id: string; amount: number; currency: string; payment_method: string; reference: string; notes?: string; update_balance?: boolean; }) => {
    const response = await api.post('/payments', data);
    if (data.update_balance && response.success) {
      const endpoint = data.entity_type === 'client' ? `/clients/${data.entity_id}/balance` : `/suppliers/${data.entity_id}/balance`;
      await api.post(endpoint, { amount: data.amount, type: 'credit', reference: data.reference });
    }
    return response;
  },
  getPaymentHistory: async (entity_type: string, entity_id: string) => {
    return api.get(`/payments/history?entity_type=${entity_type}&entity_id=${entity_id}`);
  },
  getPayments: async (filters?: { entity_type?: string; status?: string; date_from?: string; date_to?: string; }) => {
    return api.post('/payments/list', filters || {});
  },
  updatePaymentStatus: async (id: string, status: string) => {
    return api.put(`/payments/${id}/status`, { status });
  },
};

// ==================== VOICE OTP SERVICE ====================
export const voiceOtpService = {
  sendVoiceOTP: async (data: { destination: string; otp_code: string; language: string; caller_id?: string; max_retries?: number; retry_interval?: number; }) => {
    return api.post('/voice-otp/send', { ...data, max_retries: data.max_retries || 4, retry_interval: data.retry_interval || 30 });
  },
  getCallStatus: async (call_id: string) => {
    return api.get(`/voice-otp/calls/${call_id}`);
  },
  getCallLogs: async (filters: { date_from?: string; date_to?: string; status?: string; language?: string; }) => {
    return api.post('/voice-otp/logs', filters);
  },
  testCall: async (data: { destination: string; language: string }) => {
    return api.post('/voice-otp/test', data);
  },
  getLanguages: async () => {
    return api.get('/voice-otp/languages');
  },
  updateSIPSettings: async (data: { host: string; port: number; username: string; password: string; caller_id: string; }) => {
    return api.put('/voice-otp/sip-settings', data);
  },
};

// ==================== TRANSLATION SERVICE ====================
export const translationService = {
  applyTranslation: async (data: { client_id?: string; supplier_id?: string; route_id?: string; sender_id: string; destination: string; message: string; }) => {
    return api.post('/translations/apply', data);
  },
  createTranslation: async (data: { translation_type: 'sender_id' | 'destination' | 'content' | 'origination'; source_pattern: string; target_value: string; client_id?: string; supplier_id?: string; route_id?: string; }) => {
    return api.post('/translations', data);
  },
  testTranslation: async (data: { translation_type: string; source_pattern: string; target_value: string; test_input: string; }) => {
    return api.post('/translations/test', data);
  },
  getTranslations: async (filters?: { type?: string; entity_type?: string }) => {
    return api.post('/translations/list', filters || {});
  },
};

// ==================== API CONNECTORS ====================
export const connectorService = {
  testConnector: async (connector_id: string) => {
    return api.post(`/api-connectors/${connector_id}/test`, {});
  },
  sendViaConnector: async (connector_id: string, data: { to: string; from: string; text: string; }) => {
    return api.post(`/api-connectors/${connector_id}/send`, data);
  },
  getConnectors: async () => {
    return api.get('/api-connectors');
  },
  saveConnector: async (data: any) => {
    return api.post('/api-connectors', data);
  },
  updateConnector: async (id: string, data: any) => {
    return api.put(`/api-connectors/${id}`, data);
  },
  deleteConnector: async (id: string) => {
    return api.delete(`/api-connectors/${id}`);
  },
};

// ==================== NOTIFICATION SERVICE ====================
export const notificationService = {
  sendNotification: async (data: { template_name: string; variables: Record<string, string>; recipients: string[]; channel?: 'email' | 'sms' | 'dashboard' | 'all'; }) => {
    return api.post('/notifications/send', data);
  },
  getNotifications: async (filters?: { type?: string; read?: boolean }) => {
    return api.post('/notifications/list', filters || {});
  },
  markAsRead: async (id: string) => {
    return api.post(`/notifications/${id}/read`, {});
  },
  markAllAsRead: async () => {
    return api.post('/notifications/read-all', {});
  },
  sendRateChangeNotification: async (data: { entity_type: string; entity_id: string; destination: string; old_rate: number; new_rate: number; effective_date: string; }) => {
    return api.post('/notifications/rate-change', data);
  },
  sendLowBalanceAlert: async (data: { entity_type: string; entity_id: string; balance: number; threshold: number; }) => {
    return api.post('/notifications/low-balance', data);
  },
  sendDLRFailureAlert: async (data: { route_name: string; supplier_name: string; failure_count: number; action_taken: string; }) => {
    return api.post('/notifications/dlr-failure', data);
  },
};

// ==================== BILLING MODE SERVICE ====================
export const billingModeService = {
  setBillingMode: async (data: { entity_type: 'client' | 'supplier'; entity_id: string; billing_mode: 'submit' | 'dlr'; force_dlr?: boolean; dlr_timeout?: number; force_dlr_timeout_mode?: 'fixed' | 'random_0_5' | 'random_0_10'; }) => {
    return api.put('/billing/mode', data);
  },
  chargeOnSubmit: async (data: { entity_type: string; entity_id: string; message_id: string; amount: number; }) => {
    return api.post('/billing/charge/submit', data);
  },
  chargeOnDLR: async (data: { entity_type: string; entity_id: string; message_id: string; amount: number; dlr_status: string; }) => {
    return api.post('/billing/charge/dlr', data);
  },
  processForceDLR: async (data: { message_id: string; timeout_seconds: number; }) => {
    return api.post('/billing/force-dlr', data);
  },
};

// ==================== BIND STATUS ====================
export const bindService = {
  getAllBindStatus: async () => {
    return api.get('/bind/status');
  },
  getSupplierBindStatus: async (supplier_id: string) => {
    return api.get(`/bind/status/${supplier_id}`);
  },
  bindSMPP: async (supplier_id: string) => {
    return api.post(`/bind/${supplier_id}/connect`, {});
  },
  unbindSMPP: async (supplier_id: string) => {
    return api.post(`/bind/${supplier_id}/disconnect`, {});
  },
  reconnect: async (supplier_id: string) => {
    return api.post(`/bind/${supplier_id}/reconnect`, {});
  },
  testSMPP: async (data: { host: string; port: number; username: string; password: string; interface_version?: number | null; supplier_id?: string }) => {
    return api.post('/bind/test', data);
  },
  getBindHistory: async (supplier_id: string) => {
    return api.get(`/bind/${supplier_id}/history`);
  },
};
