import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Client, Supplier, Trunk, Route, RoutePlan, RouteMap, Rate, MCCMNC, Invoice, Payment, SMSLog, EmailTemplate, OTTDevice, APIConnector, User, DashboardStats, Notification, Campaign, Translation, VoiceOTPConfig, SMTPConfig, SocialAPISupplier, ResidentialProxy } from '../types';
import { api } from '../services/api';
// mockData intentionally NOT imported — every list now sourced from the DB via the API.

// ============================================================
// DATA CONTEXT - All data loaded from PostgreSQL via API
// No localStorage usage whatsoever
// ============================================================

interface DataContextType {
  // Loading states
  isLoading: boolean;
  // Data
  clients: Client[]; suppliers: Supplier[]; trunks: Trunk[]; routes: Route[]; routePlans: RoutePlan[]; routeMaps: RouteMap[];
  rates: Rate[]; mccmnc: MCCMNC[]; invoices: Invoice[]; payments: Payment[];  smsLogs: SMSLog[]; ottDevices: OTTDevice[]; apiConnectors: APIConnector[]; users: User[];
  emailTemplates: EmailTemplate[]; notifications: Notification[]; campaigns: Campaign[];
  translations: Translation[]; voiceOTPConfigs: VoiceOTPConfig[];
  socialApiSuppliers: SocialAPISupplier[];
  residentialProxies: ResidentialProxy[];
  dashboardStats: DashboardStats; hourlyTraffic: Array<{ hour: string; count: number }>; dailyRevenue: Array<{ date: string; amount: number }>; topDest: Array<{ destination: string; count: number; revenue: number }>;
  // CRUD operations (async - go through API)
  addClient:(c:Omit<Client,'id'|'created_at'|'updated_at'>)=>Promise<void>; updateClient:(id:string,c:Partial<Client>)=>Promise<void>; deleteClient:(id:string)=>Promise<void>;
  addSupplier:(s:Omit<Supplier,'id'|'created_at'|'updated_at'>)=>Promise<void>; updateSupplier:(id:string,s:Partial<Supplier>)=>Promise<void>; deleteSupplier:(id:string)=>Promise<void>;
  addSMSLog:(log:Omit<SMSLog,'id'|'created_at'|'submit_time'>)=>Promise<void>;
  addTrunk:(t:Omit<Trunk,'id'|'created_at'>)=>Promise<void>; updateTrunk:(id:string,t:Partial<Trunk>)=>Promise<void>; deleteTrunk:(id:string)=>Promise<void>;
  addRoute:(r:Omit<Route,'id'|'created_at'>)=>Promise<void>; updateRoute:(id:string,r:Partial<Route>)=>Promise<void>; deleteRoute:(id:string)=>Promise<void>;
  addRoutePlan:(p:Omit<RoutePlan,'id'|'created_at'>)=>Promise<void>; updateRoutePlan:(id:string,p:Partial<RoutePlan>)=>Promise<void>; deleteRoutePlan:(id:string)=>Promise<void>;
  addRouteMap:(p:Omit<RouteMap,'id'|'created_at'>)=>Promise<void>; updateRouteMap:(id:string,p:Partial<RouteMap>)=>Promise<void>; deleteRouteMap:(id:string)=>Promise<void>;
  addRate:(r:Omit<Rate,'id'>)=>Promise<void>; updateRate:(id:string,r:Partial<Rate>)=>Promise<void>; deleteRate:(id:string)=>Promise<void>;
  addMCCMNC:(m:Omit<MCCMNC,'id'>)=>Promise<void>; updateMCCMNC:(id:string,m:Partial<MCCMNC>)=>Promise<void>; deleteMCCMNC:(id:string)=>Promise<void>;
  addInvoice:(i:Omit<Invoice,'id'|'created_at'>)=>Promise<void>; updateInvoice:(id:string,i:Partial<Invoice>)=>Promise<void>;
  addPayment:(p:Omit<Payment,'id'|'created_at'>)=>Promise<void>;
  addOTTDevice:(d:Omit<OTTDevice,'id'|'created_at'>)=>Promise<void>; updateOTTDevice:(id:string,d:Partial<OTTDevice>)=>Promise<void>; deleteOTTDevice:(id:string)=>Promise<void>;
  markNotificationRead:(id:string)=>void;
  addCampaign:(c:Omit<Campaign,'id'|'created_at'>)=>Promise<void>; updateCampaign:(id:string,c:Partial<Campaign>)=>Promise<void>; deleteCampaign:(id:string)=>Promise<void>;
  addTranslation:(t:Omit<Translation,'id'|'created_at'>)=>Promise<void>; updateTranslation:(id:string,t:Partial<Translation>)=>Promise<void>; deleteTranslation:(id:string)=>Promise<void>;
  addSocialAPISupplier:(s:Omit<SocialAPISupplier,'id'|'created_at'|'updated_at'>)=>Promise<void>; updateSocialAPISupplier:(id:string,s:Partial<SocialAPISupplier>)=>Promise<void>; deleteSocialAPISupplier:(id:string)=>Promise<void>;
  reloadResidentialProxies: ()=>Promise<void>;
  getClientById:(id:string)=>Client|undefined; getSupplierById:(id:string)=>Supplier|undefined; getTrunkById:(id:string)=>Trunk|undefined;
  updateEmailTemplate:(id:string,data:Partial<EmailTemplate>)=>Promise<void>;
  platformSettings:Record<string,string>; updatePlatformSetting:(key:string,value:string)=>Promise<void>;
  smtpConfig: SMTPConfig;
  updateSMTPConfig: (data: Partial<SMTPConfig>) => Promise<void>;
  // Reload functions
  reloadClients: ()=>Promise<void>; reloadSuppliers: ()=>Promise<void>; reloadSMSLogs: ()=>Promise<void>;      reloadTrunks: ()=>Promise<void>; reloadRoutes: ()=>Promise<void>; reloadRoutePlans: ()=>Promise<void>; reloadRouteMaps: ()=>Promise<void>;
      reloadRates: ()=>Promise<void>; reloadMCCMNC: ()=>Promise<void>;
      reloadInvoices: ()=>Promise<void>; reloadPayments: ()=>Promise<void>;
  reloadUsers: ()=>Promise<void>;
  reloadSocialAPISuppliers: ()=>Promise<void>;
}

const DataContext = createContext<DataContextType|undefined>(undefined);

// Generic API response helper
async function fetchList(endpoint: string): Promise<any[]> {
  try {
    const res = await api.get(endpoint);
    if (res.success && Array.isArray(res.data)) return res.data;
    if (Array.isArray(res)) return res;
    return [];
  } catch (e) {
    console.error(`Failed to fetch ${endpoint}:`, e);
    return [];
  }
}

async function apiPost(endpoint: string, data: any): Promise<any> {
  return api.post(endpoint, data);
}

async function apiPut(endpoint: string, data: any): Promise<any> {
  return api.put(endpoint, data);
}

async function apiDelete(endpoint: string): Promise<any> {
  return api.delete(endpoint);
}

// PostgreSQL's pg driver returns DECIMAL/NUMERIC columns as strings.
// Normalize them to numbers so arithmetic (e.g. balance + topupAmount) works.
const normalizeClient = (c: any) => ({
  ...c,
  smpp_port: Number(c.smpp_port) || 0,
  max_tps: Number(c.max_tps) || 0,
  balance: Number(c.balance) || 0,
  credit_limit: Number(c.credit_limit) || 0,
  dlr_timeout: Number(c.dlr_timeout) || 0,
});

const normalizeSupplier = (s: any) => ({
  ...s,
  smpp_port: Number(s.smpp_port) || 0,
  balance: Number(s.balance) || 0,
  credit_limit: Number(s.credit_limit) || 0,
  dlr_timeout: Number(s.dlr_timeout) || 0,
  consecutive_failures: Number(s.consecutive_failures) || 0,
});

const normalizeInvoice = (i: any) => ({
  ...i,
  total_sms: Number(i.total_sms) || 0,
  total_amount: Number(i.total_amount) || 0,
  tax_amount: Number(i.tax_amount) || 0,
  grand_total: Number(i.grand_total) || 0,
});

const normalizePayment = (p: any) => ({
  ...p,
  amount: Number(p.amount) || 0,
});

const normalizeSMSLog = (l: any) => ({
  ...l,
  message_parts: Number(l.message_parts) || 0,
  client_rate: Number(l.client_rate) || 0,
  supplier_rate: Number(l.supplier_rate) || 0,
  profit: Number(l.profit) || 0,
  dlr_response_time: l.dlr_response_time != null ? Number(l.dlr_response_time) : null,
  dlr_duration: l.dlr_duration != null ? Number(l.dlr_duration) : null,
});

const normalizeTrunk = (t: any) => ({
  ...t,
  priority: Number(t.priority) || 0,
  percentage: Number(t.percentage) || 0,
});

const normalizeRouteMap = (rm: any) => ({
  ...rm,
  priority: Number(rm.priority) || 0,
  percentage: Number(rm.percentage) || 0,
});

export const DataProvider:React.FC<{children:ReactNode}> = ({children}) => {
  const [isLoading, setIsLoading] = useState(true);
  // State initialized empty - loaded from API
  const [clients, setClients] = useState<Client[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [trunks, setTrunks] = useState<Trunk[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routePlans, setRoutePlans] = useState<RoutePlan[]>([]);
  const [routeMaps, setRouteMaps] = useState<RouteMap[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [mccmnc, setMCCMNC] = useState<MCCMNC[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [smsLogs, setSMSLogs] = useState<SMSLog[]>([]);
  const [apiConnectors, setAPIConnectors] = useState<APIConnector[]>([]);
  const [ottDevices, setOTTDevices] = useState<OTTDevice[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [voiceOTPConfigs] = useState<VoiceOTPConfig[]>([]);
  const [socialApiSuppliers, setSocialApiSuppliers] = useState<SocialAPISupplier[]>([]);
  const [residentialProxies, setResidentialProxies] = useState<ResidentialProxy[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [platformSettings, setPlatformSettings] = useState<Record<string,string>>({platform_name:'NET2APP Hub',currency:'EUR',default_tax_rate:'19.00'});
  const [smtpConfig, setSMTPConfig] = useState<SMTPConfig>({host:'smtp.gmail.com',port:587,encryption:'tls',username:'',password:'',from_email:'',from_name:''});
  const [emailTemplates] = useState<EmailTemplate[]>([]);

  // ==================== RELOAD FUNCTIONS ====================
  const reloadClients = useCallback(async () => { const data = await fetchList('/clients'); setClients(Array.isArray(data) ? data.map(normalizeClient) : []); }, []);
  const reloadSuppliers = useCallback(async () => { const data = await fetchList('/suppliers'); setSuppliers(Array.isArray(data) ? data.map(normalizeSupplier) : []); }, []);
  const reloadSMSLogs = useCallback(async () => { try { const res = await api.post('/sms/logs', { limit: 500, offset: 0 }); if (res.success && Array.isArray(res.data)) setSMSLogs(res.data.map(normalizeSMSLog)); } catch {} }, []);
  const reloadTrunks = useCallback(async () => { const data = await fetchList('/trunks'); setTrunks(Array.isArray(data) ? data.map(normalizeTrunk) : []); }, []);
  const reloadRoutes = useCallback(async () => { const data = await fetchList('/routes'); setRoutes(data); }, []);
  const reloadRoutePlans = useCallback(async () => { const data = await fetchList('/route_plans'); setRoutePlans(data); }, []);
  const reloadRouteMaps = useCallback(async () => { const data = await fetchList('/route_maps'); setRouteMaps(Array.isArray(data) ? data.map(normalizeRouteMap) : []); }, []);
  const reloadRates = useCallback(async () => { const data = await fetchList('/rates'); const norm = Array.isArray(data) ? data.map((r: any) => ({ ...r, rate: Number(r.rate) || 0 })) : []; setRates(norm); }, []);      const reloadMCCMNC = useCallback(async () => {
        try {
          const data = await fetchList('/mccmnc');
          // Defensive: validate entries before setting state (same filter as reloadAll)
          const valid = Array.isArray(data)
            ? data.filter((entry: any) => entry && typeof entry.country === 'string' && entry.country && typeof entry.mcc === 'string' && entry.mcc && typeof entry.mnc === 'string' && entry.mnc)
            : [];
          setMCCMNC(valid);
        } catch (e) {
          console.error('reloadMCCMNC failed:', e);
          // Keep existing state; don't wipe on transient failure
        }
      }, []);
  const reloadInvoices = useCallback(async () => { const data = await fetchList('/billing/invoices'); setInvoices(Array.isArray(data) ? data.map(normalizeInvoice) : []); }, []);
  const reloadPayments = useCallback(async () => { const data = await fetchList('/payments'); setPayments(Array.isArray(data) ? data.map(normalizePayment) : []); }, []);
  const reloadUsers = useCallback(async () => { const data = await fetchList('/users'); setUsers(data); }, []);
  const reloadSocialAPISuppliers = useCallback(async () => { const data = await fetchList('/social_api_suppliers'); setSocialApiSuppliers(data); }, []);
  const reloadResidentialProxies = useCallback(async () => { const data = await fetchList('/residential_proxies'); setResidentialProxies(data); }, []);

  // ==================== RELOAD ALL (called on login + on demand) ====================
  const reloadAll = useCallback(async () => {
    // Token-pinning: if there is no bearer token yet (pre-login), bail immediately.
    // Without this, the initial mount-time load retries with 401 and clears state.
    const startingToken = api.getToken();
    if (!startingToken) return;
    setIsLoading(true);
    try {
      // Pre-flight auth check: validate the token with a single lightweight
      // call before firing 17 parallel fetches.  Without this, a stale token
      // in localStorage causes all 17 to 401 in parallel, flooding the
      // console with indistinguishable errors.  One controlled 401 is
      // infinitely more maintainable than 17.
      const authCheck = await api.get('/auth/me').catch(() => null);
      if (!authCheck?.success || startingToken !== api.getToken()) {
        setIsLoading(false);
        return;
      }
      const [c, s, t, r, rp, rm, rt, mRaw, i, p, sms, o, n, cmp, tr, ac, ps, usr, sas, rpx] = await Promise.all([
        fetchList('/clients'),
        fetchList('/suppliers'),
        fetchList('/trunks'),
        fetchList('/routes'),
        fetchList('/route_plans'),
        fetchList('/route_maps'),
        fetchList('/rates'),
        fetchList('/mccmnc'),
        fetchList('/billing/invoices'),
        fetchList('/payments'),
        api.post('/sms/logs', { limit: 500, offset: 0 }).then((res: any) => (res?.success && Array.isArray(res.data)) ? res.data : []).catch(() => []),
        fetchList('/ott_devices'),
        fetchList('/notifications'),
        fetchList('/campaigns'),
        fetchList('/translations'),
        fetchList('/api_connectors'),
        fetchList('/platform_settings'),
        fetchList('/users'),
        fetchList('/social_api_suppliers'),
        fetchList('/residential_proxies'),
      ]);
      // Defensive: validate mccmnc entries — filter out any rows missing required fields
      // to prevent crashes in rates pages that depend on mccmnc.map(m => m.country), etc.
      const m = Array.isArray(mRaw)
        ? mRaw.filter((entry: any) => entry && typeof entry.country === 'string' && entry.country && typeof entry.mcc === 'string' && entry.mcc && typeof entry.mnc === 'string' && entry.mnc)
        : [];
      // Token-pinning on resolve: if the user logged out (or switched accounts)
      // while the fetches were in flight, abort silently so a stale response
      // doesn't re-populate slots we just cleared with clearAll().
      if (startingToken !== api.getToken()) return;
      // 'usr' is the users slot from the Promise.all destructure above
      const normClients = Array.isArray(c) ? c.map(normalizeClient) : [];
      if (normClients.length) setClients(normClients);
      const normSuppliers = Array.isArray(s) ? s.map(normalizeSupplier) : [];
      if (normSuppliers.length) setSuppliers(normSuppliers);
      const normTrunks = Array.isArray(t) ? t.map(normalizeTrunk) : [];
      if (normTrunks.length) setTrunks(normTrunks);
      if (r.length) setRoutes(r);
      if (rp.length) setRoutePlans(rp);
      const normRouteMaps = Array.isArray(rm) ? rm.map(normalizeRouteMap) : [];
      if (normRouteMaps.length) setRouteMaps(normRouteMaps);
      // Normalize rates: PostgreSQL may return numeric columns as strings.
      // Coerce 'rate' to Number so every downstream .toFixed() call is safe.
      const normRates = Array.isArray(rt)
        ? rt.map((r: any) => ({ ...r, rate: Number(r.rate) || 0 }))
        : [];
      if (normRates.length) setRates(normRates);
      // Always set mccmnc — validated entries or fallback to empty array
      setMCCMNC(m.length ? m : []);
      const normInvoices = Array.isArray(i) ? i.map(normalizeInvoice) : [];
      if (normInvoices.length) setInvoices(normInvoices);
      const normPayments = Array.isArray(p) ? p.map(normalizePayment) : [];
      if (normPayments.length) setPayments(normPayments);
      const normSMSLogs = Array.isArray(sms) ? sms.map(normalizeSMSLog) : [];
      if (normSMSLogs.length) setSMSLogs(normSMSLogs);
      if (o.length) setOTTDevices(o);
      if (n.length) setNotifications(n);
      if (cmp.length) setCampaigns(cmp);
      if (tr.length) setTranslations(tr);
      if (ac.length) setAPIConnectors(ac);
      if (Array.isArray(usr) && usr.length) setUsers(usr);
      if (Array.isArray(sas) && sas.length) setSocialApiSuppliers(sas);
      if (Array.isArray(rpx) && rpx.length) setResidentialProxies(rpx);
      // Platform settings as key-value
      if (ps && ps.length) {
        const settingsMap: Record<string,string> = {};
        ps.forEach((s: any) => { settingsMap[s.key] = s.value; });
        setPlatformSettings((prev: Record<string,string>) => ({...prev, ...settingsMap}));
      }
    } catch (e) {
      console.error('Failed to load data from API:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ==================== CLEAR ALL (called on logout) ====================
  const clearAll = useCallback(() => {
    setClients([]); setSuppliers([]); setTrunks([]); setRoutes([]);
    setRoutePlans([]); setRouteMaps([]); setRates([]); setMCCMNC([]); setInvoices([]);
    setPayments([]); setSMSLogs([]); setOTTDevices([]); setNotifications([]);
    setCampaigns([]); setTranslations([]); setAPIConnectors([]); setSocialApiSuppliers([]); setResidentialProxies([]); setUsers([]);
    setPlatformSettings({platform_name:'NET2APP Hub',currency:'EUR',default_tax_rate:'19.00'});
    setSMTPConfig({host:'smtp.gmail.com',port:587,encryption:'tls',username:'',password:'',from_email:'',from_name:''});
    setIsLoading(false);
  }, []);

  // ==================== LOAD TRIGGERED BY LOGIN TRANSITION ====================
  // On mount: if a token already exists in memory, refetch (covers re-mounts).
  // Subscribe to api.onTokenChange: fire reloadAll on login (null -> token),
  // fire clearAll on logout (token -> null). This is the only place the
  // DataContext knows the user just authenticated — without it, the initial
  // mount-time fetch goes out with no Bearer header and silently 401s.
  useEffect(() => {
    if (api.getToken()) reloadAll();
    const unsub = api.onTokenChange((tok) => {
      if (tok) reloadAll();
      else { clearAll(); }
    });
    return unsub;
  }, [reloadAll, clearAll]);

  // ==================== CLIENT CRUD ====================
  const addClient = useCallback(async (c: Omit<Client,'id'|'created_at'|'updated_at'>) => {
    try {
      const res = await apiPost('/clients', c);
      if (res.success) await reloadClients();
    } catch (e: any) { console.error('addClient failed:', e); throw e; }
  }, [reloadClients]);
  const updateClient = useCallback(async (id: string, c: Partial<Client>) => {
    try {
      await apiPut(`/clients/${id}`, c);
      await reloadClients();
    } catch (e: any) { console.error('updateClient failed:', e); throw e; }
  }, [reloadClients]);
  const deleteClient = useCallback(async (id: string) => {
    try {
      await apiDelete(`/clients/${id}`);
      await reloadClients();
    } catch (e: any) { console.error('deleteClient failed:', e); throw e; }
  }, [reloadClients]);

  // ==================== SUPPLIER CRUD ====================
  const addSupplier = useCallback(async (s: Omit<Supplier,'id'|'created_at'|'updated_at'>) => {
    try {
      const res = await apiPost('/suppliers', s);
      if (res.success) await reloadSuppliers();
    } catch (e: any) { console.error('addSupplier failed:', e); throw e; }
  }, [reloadSuppliers]);
  const updateSupplier = useCallback(async (id: string, s: Partial<Supplier>) => {
    try {
      await apiPut(`/suppliers/${id}`, s);
      await reloadSuppliers();
    } catch (e: any) { console.error('updateSupplier failed:', e); throw e; }
  }, [reloadSuppliers]);
  const deleteSupplier = useCallback(async (id: string) => {
    try {
      await apiDelete(`/suppliers/${id}`);
      await reloadSuppliers();
    } catch (e: any) { console.error('deleteSupplier failed:', e); throw e; }
  }, [reloadSuppliers]);

  // ==================== SMS LOGS ====================
  const addSMSLog = useCallback(async (log: Omit<SMSLog,'id'|'created_at'|'submit_time'>) => {
    try {
      await apiPost('/sms/test', log);
      await reloadSMSLogs();
    } catch (e: any) { console.error('addSMSLog failed:', e); throw e; }
  }, [reloadSMSLogs]);

  // ==================== TRUNKS CRUD ====================
  const addTrunk = useCallback(async (t: Omit<Trunk,'id'|'created_at'>) => {
    try {
      await apiPost('/trunks', t);
      await reloadTrunks();
    } catch (e: any) { console.error('addTrunk failed:', e); throw e; }
  }, [reloadTrunks]);
  const updateTrunk = useCallback(async (id: string, t: Partial<Trunk>) => {
    try {
      await apiPut(`/trunks/${id}`, t);
      await reloadTrunks();
    } catch (e: any) { console.error('updateTrunk failed:', e); throw e; }
  }, [reloadTrunks]);
  const deleteTrunk = useCallback(async (id: string) => {
    try {
      await apiDelete(`/trunks/${id}`);
      await reloadTrunks();
    } catch (e: any) { console.error('deleteTrunk failed:', e); throw e; }
  }, [reloadTrunks]);

  // ==================== ROUTES CRUD ====================
  const addRoute = useCallback(async (r: Omit<Route,'id'|'created_at'>) => {
    try {
      await apiPost('/routes', r);
      await reloadRoutes();
    } catch (e: any) { console.error('addRoute failed:', e); throw e; }
  }, [reloadRoutes]);
  const updateRoute = useCallback(async (id: string, r: Partial<Route>) => {
    try {
      await apiPut(`/routes/${id}`, r);
      await reloadRoutes();
    } catch (e: any) { console.error('updateRoute failed:', e); throw e; }
  }, [reloadRoutes]);
  const deleteRoute = useCallback(async (id: string) => {
    try {
      await apiDelete(`/routes/${id}`);
      await reloadRoutes();
    } catch (e: any) { console.error('deleteRoute failed:', e); throw e; }
  }, [reloadRoutes]);

  // ==================== ROUTE PLANS CRUD ====================
  const addRoutePlan = useCallback(async (p: Omit<RoutePlan,'id'|'created_at'>) => {
    try {
      await apiPost('/route_plans', p);
      await reloadRoutePlans();
    } catch (e: any) { console.error('addRoutePlan failed:', e); throw e; }
  }, [reloadRoutePlans]);
  const updateRoutePlan = useCallback(async (id: string, p: Partial<RoutePlan>) => {
    try {
      await apiPut(`/route_plans/${id}`, p);
      await reloadRoutePlans();
    } catch (e: any) { console.error('updateRoutePlan failed:', e); throw e; }
  }, [reloadRoutePlans]);
  const deleteRoutePlan = useCallback(async (id: string) => {
    try {
      await apiDelete(`/route_plans/${id}`);
      await reloadRoutePlans();
    } catch (e: any) { console.error('deleteRoutePlan failed:', e); throw e; }
  }, [reloadRoutePlans]);

  // ==================== ROUTE MAPS CRUD ====================
  const addRouteMap = useCallback(async (p: Omit<RouteMap,'id'|'created_at'>) => {
    try {
      await apiPost('/route_maps', p);
      await reloadRouteMaps();
    } catch (e: any) { console.error('addRouteMap failed:', e); throw e; }
  }, [reloadRouteMaps]);
  const updateRouteMap = useCallback(async (id: string, p: Partial<RouteMap>) => {
    try {
      await apiPut(`/route_maps/${id}`, p);
      await reloadRouteMaps();
    } catch (e: any) { console.error('updateRouteMap failed:', e); throw e; }
  }, [reloadRouteMaps]);
  const deleteRouteMap = useCallback(async (id: string) => {
    try {
      await apiDelete(`/route_maps/${id}`);
      await reloadRouteMaps();
    } catch (e: any) { console.error('deleteRouteMap failed:', e); throw e; }
  }, [reloadRouteMaps]);

  // ==================== RATES CRUD ====================
  const addRate = useCallback(async (r: Omit<Rate,'id'>) => {
    try {
      await apiPost('/rates', r);
      await reloadRates();
    } catch (e: any) { console.error('addRate failed:', e); throw e; }
  }, [reloadRates]);
  const updateRate = useCallback(async (id: string, r: Partial<Rate>) => {
    try {
      await apiPut(`/rates/${id}`, r);
      await reloadRates();
    } catch (e: any) { console.error('updateRate failed:', e); throw e; }
  }, [reloadRates]);
  const deleteRate = useCallback(async (id: string) => {
    try {
      await apiDelete(`/rates/${id}`);
      await reloadRates();
    } catch (e: any) { console.error('deleteRate failed:', e); throw e; }
  }, [reloadRates]);

  // ==================== MCCMNC CRUD ====================
  const addMCCMNC = useCallback(async (m: Omit<MCCMNC,'id'>) => {
    try {
      await apiPost('/mccmnc', m);
      await reloadMCCMNC();
    } catch (e: any) { console.error('addMCCMNC failed:', e); throw e; }
  }, [reloadMCCMNC]);
  const updateMCCMNC = useCallback(async (id: string, m: Partial<MCCMNC>) => {
    try {
      await apiPut(`/mccmnc/${id}`, m);
      await reloadMCCMNC();
    } catch (e: any) { console.error('updateMCCMNC failed:', e); throw e; }
  }, [reloadMCCMNC]);
  const deleteMCCMNC = useCallback(async (id: string) => {
    try {
      await apiDelete(`/mccmnc/${id}`);
      await reloadMCCMNC();
    } catch (e: any) { console.error('deleteMCCMNC failed:', e); throw e; }
  }, [reloadMCCMNC]);

  // ==================== INVOICES / PAYMENTS ====================
  const addInvoice = useCallback(async (i: Omit<Invoice,'id'|'created_at'>) => {
    try {
      await apiPost('/billing/invoices', i);
      await reloadInvoices();
    } catch (e: any) { console.error('addInvoice failed:', e); throw e; }
  }, [reloadInvoices]);
  const updateInvoice = useCallback(async (id: string, i: Partial<Invoice>) => {
    try {
      await apiPut(`/billing/invoices/${id}`, i);
      await reloadInvoices();
    } catch (e: any) { console.error('updateInvoice failed:', e); throw e; }
  }, [reloadInvoices]);
  const addPayment = useCallback(async (p: Omit<Payment,'id'|'created_at'>) => {
    try {
      await apiPost('/payments', p);
      await reloadPayments();
    } catch (e: any) { console.error('addPayment failed:', e); throw e; }
  }, [reloadPayments]);

  // ==================== OTT DEVICES ====================
  const addOTTDevice = useCallback(async (d: Omit<OTTDevice,'id'|'created_at'>) => {
    try {
      await apiPost('/ott_devices', d);
      const data = await fetchList('/ott_devices');
      setOTTDevices(data);
    } catch (e: any) { console.error('addOTTDevice failed:', e); throw e; }
  }, []);
  const updateOTTDevice = useCallback(async (id: string, d: Partial<OTTDevice>) => {
    try {
      await apiPut(`/ott_devices/${id}`, d);
      const data = await fetchList('/ott_devices');
      setOTTDevices(data);
    } catch (e: any) { console.error('updateOTTDevice failed:', e); throw e; }
  }, []);
  const deleteOTTDevice = useCallback(async (id: string) => {
    try {
      await apiDelete(`/ott_devices/${id}`);
      const data = await fetchList('/ott_devices');
      setOTTDevices(data);
    } catch (e: any) { console.error('deleteOTTDevice failed:', e); throw e; }
  }, []);

  // ==================== NOTIFICATIONS ====================
  const markNotificationRead = useCallback(async (id: string) => {
    try {
      await apiPost(`/notifications/${id}/read`, {});
      setNotifications(prev => prev.map(x => x.id === id ? {...x, is_read: true} : x));
    } catch (e: any) { console.error('markNotificationRead failed:', e); }
  }, []);

  // ==================== CAMPAIGNS ====================
  const addCampaign = useCallback(async (c: Omit<Campaign,'id'|'created_at'>) => {
    try {
      await apiPost('/campaigns', c);
      const data = await fetchList('/campaigns');
      setCampaigns(data);
    } catch (e: any) { console.error('addCampaign failed:', e); throw e; }
  }, []);
  const updateCampaign = useCallback(async (id: string, c: Partial<Campaign>) => {
    try {
      await apiPut(`/campaigns/${id}`, c);
      const data = await fetchList('/campaigns');
      setCampaigns(data);
    } catch (e: any) { console.error('updateCampaign failed:', e); throw e; }
  }, []);
  const deleteCampaign = useCallback(async (id: string) => {
    try {
      await apiDelete(`/campaigns/${id}`);
      const data = await fetchList('/campaigns');
      setCampaigns(data);
    } catch (e: any) { console.error('deleteCampaign failed:', e); throw e; }
  }, []);

  // ==================== TRANSLATIONS ====================
  const addTranslation = useCallback(async (t: Omit<Translation,'id'|'created_at'>) => {
    try {
      await apiPost('/translations', t);
      const data = await fetchList('/translations');
      setTranslations(data);
    } catch (e: any) { console.error('addTranslation failed:', e); throw e; }
  }, []);
  const updateTranslation = useCallback(async (id: string, t: Partial<Translation>) => {
    try {
      await apiPut(`/translations/${id}`, t);
      const data = await fetchList('/translations');
      setTranslations(data);
    } catch (e: any) { console.error('updateTranslation failed:', e); throw e; }
  }, []);
  const deleteTranslation = useCallback(async (id: string) => {
    try {
      await apiDelete(`/translations/${id}`);
      const data = await fetchList('/translations');
      setTranslations(data);
    } catch (e: any) { console.error('deleteTranslation failed:', e); throw e; }
  }, []);

  // ==================== SOCIAL API SUPPLIERS ====================
  const addSocialAPISupplier = useCallback(async (s: Omit<SocialAPISupplier,'id'|'created_at'|'updated_at'>) => {
    try {
      await apiPost('/social_api_suppliers', s);
      await reloadSocialAPISuppliers();
    } catch (e: any) { console.error('addSocialAPISupplier failed:', e); throw e; }
  }, [reloadSocialAPISuppliers]);
  const updateSocialAPISupplier = useCallback(async (id: string, s: Partial<SocialAPISupplier>) => {
    try {
      await apiPut(`/social_api_suppliers/${id}`, s);
      await reloadSocialAPISuppliers();
    } catch (e: any) { console.error('updateSocialAPISupplier failed:', e); throw e; }
  }, [reloadSocialAPISuppliers]);
  const deleteSocialAPISupplier = useCallback(async (id: string) => {
    try {
      await apiDelete(`/social_api_suppliers/${id}`);
      await reloadSocialAPISuppliers();
    } catch (e: any) { console.error('deleteSocialAPISupplier failed:', e); throw e; }
  }, [reloadSocialAPISuppliers]);

  // ==================== SETTINGS ====================
  const updatePlatformSetting = useCallback(async (key: string, value: string) => {
    try {
      await apiPost('/platform_settings', { key, value });
      setPlatformSettings((prev: Record<string,string>) => ({...prev, [key]: value}));
    } catch (e: any) { console.error('updatePlatformSetting failed:', e); }
  }, []);
  const updateSMTPConfig = useCallback(async (data: Partial<SMTPConfig>) => {
    try {
      await apiPost('/smtp_config', data);
      setSMTPConfig(prev => ({...prev, ...data}));
    } catch (e: any) { console.error('updateSMTPConfig failed:', e); }
  }, []);
  const updateEmailTemplate = useCallback(async (id: string, data: Partial<EmailTemplate>) => {
    try {
      await apiPut(`/notification_templates/${id}`, data);
    } catch (e: any) { console.error('updateEmailTemplate failed:', e); }
  }, []);

  // ==================== GETTERS ====================
  const getClientById = useCallback((id: string) => clients.find(c => String(c.id) === String(id)), [clients]);
  const getSupplierById = useCallback((id: string) => suppliers.find(s => String(s.id) === String(id)), [suppliers]);
  const getTrunkById = useCallback((id: string) => trunks.find(t => String(t.id) === String(id)), [trunks]);

  // ==================== DASHBOARD STATS ====================
  const dashboardStats: DashboardStats = {
    total_clients: clients.length, active_clients: clients.filter(c => c.status === 'active').length,
    total_suppliers: suppliers.length, active_suppliers: suppliers.filter(s => s.status === 'active').length,
    total_sms_today: smsLogs.length, total_sms_month: smsLogs.length,
    delivered_percentage: smsLogs.length>0 ? (smsLogs.filter(l => l.status === 'delivered').length/smsLogs.length)*100 : 0,
    failed_percentage: smsLogs.length>0 ? (smsLogs.filter(l => l.status === 'failed').length/smsLogs.length)*100 : 0,
    revenue_today: smsLogs.reduce((s,l) => s+((l.client_rate||0)*(l.message_parts||1)),0),
    revenue_month: smsLogs.reduce((s,l) => s+((l.client_rate||0)*(l.message_parts||1)),0)*30,
    cost_today: smsLogs.reduce((s,l) => s+((l.supplier_rate||0)*(l.message_parts||1)),0),
    cost_month: smsLogs.reduce((s,l) => s+((l.supplier_rate||0)*(l.message_parts||1)),0)*30,
    profit_today: smsLogs.reduce((s,l) => s+(l.profit||0),0),
    profit_month: smsLogs.reduce((s,l) => s+(l.profit||0),0)*30,
    active_binds: suppliers.filter(s => s.bind_status === 'bound').length, total_binds: suppliers.length,
  };

  return (
    <DataContext.Provider value={{
      isLoading,
      clients, suppliers, trunks, routes, routePlans, routeMaps, rates, mccmnc, invoices, payments, smsLogs,
      ottDevices, apiConnectors, users, socialApiSuppliers, residentialProxies,
      emailTemplates, notifications, campaigns, translations, voiceOTPConfigs,
      dashboardStats, hourlyTraffic: [], dailyRevenue: [], topDest: [],
      addClient, updateClient, deleteClient,
      addSupplier, updateSupplier, deleteSupplier,
      addSMSLog, addTrunk, updateTrunk, deleteTrunk,
      addRoute, updateRoute, deleteRoute,
      addRoutePlan, updateRoutePlan, deleteRoutePlan,
      addRouteMap, updateRouteMap, deleteRouteMap,
      addRate, updateRate, deleteRate,
      addMCCMNC, updateMCCMNC, deleteMCCMNC,
      addInvoice, updateInvoice, addPayment,
      addOTTDevice, updateOTTDevice, deleteOTTDevice,
      addSocialAPISupplier, updateSocialAPISupplier, deleteSocialAPISupplier,
      markNotificationRead,
      addCampaign, updateCampaign, deleteCampaign,
      addTranslation, updateTranslation, deleteTranslation,
      getClientById, getSupplierById, getTrunkById,
      updateEmailTemplate,
      platformSettings, updatePlatformSetting,
      smtpConfig, updateSMTPConfig,
      reloadClients, reloadSuppliers, reloadSMSLogs,
      reloadTrunks, reloadRoutes, reloadRoutePlans, reloadRouteMaps,
      reloadRates, reloadMCCMNC, reloadInvoices, reloadPayments, reloadUsers, reloadSocialAPISuppliers, reloadResidentialProxies,
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const c = useContext(DataContext);
  if (!c) throw new Error('useData must be used within DataProvider');
  return c;
};
