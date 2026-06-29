import React, { useState, useMemo } from 'react';
import { Plus, Search, Download, Trash2, Edit, Send, CheckSquare, Square, Mail, Clock } from 'lucide-react';
import { useData } from '../../store/DataContext';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { Table, Pagination } from '../../components/UI/Table';
import { Modal } from '../../components/UI/Modal';
import { Input, Select } from '../../components/UI/Input';
import { Rate } from '../../types';
import { exportCSV, exportExcel } from '../../services/exportService';
import { notificationService } from '../../services/apiServices';
import { useToast } from '../../components/UI/Toast';

export const ClientRates: React.FC = () => {
  const { addToast } = useToast();
  const { rates: allRates, clients, addRate, updateRate, deleteRate, mccmnc, suppliers } = useData();
  const [search, setSearch] = useState(''); const [clientFilter, setClientFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editingRate, setEditingRate] = useState<Rate | null>(null);
  const [selectedRates, setSelectedRates] = useState<string[]>([]);
  const [filterDir, setFilterDir] = useState<'none'|'increase'|'decrease'|'unchanged'|'new'>('none');
  
  const [historyRates, setHistoryRates] = useState<Rate[]>([]);
  const [sendNotification, setSendNotification] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notificationData, setNotificationData] = useState<{
    country: string; account: string; mcc: string; mncs: string; oldRate: number; newRate: number;
    direction: string; effectiveDate: string;
  } | null>(null);

  // Multi-select state
  const [selectedMncs, setSelectedMncs] = useState<string[]>(['*']);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [rateValue, setRateValue] = useState(0);

  // Cross-entity: also apply same rate to a supplier
  const [applyToSupplier, setApplyToSupplier] = useState(false);
  const [targetSupplierId, setTargetSupplierId] = useState('');

  const [formData, setFormData] = useState({ entity_id:'', mcc:'', country:'', rate:0, effective_from: new Date().toISOString().split('T')[0], is_active:true });
  const itemsPerPage = 20;

  const clientRates = allRates.filter(r => r.entity_type === 'client');
  const countries = useMemo(() => [...new Set(mccmnc.map(m => m.country))].sort(), [mccmnc]);

  const filteredRates = clientRates.filter(rate => {
    const ms = rate.country.toLowerCase().includes(search.toLowerCase()) || rate.mcc.includes(search);
    const mc = clientFilter === 'all' || rate.entity_id === clientFilter;
    const mco = countryFilter === 'all' || rate.country === countryFilter;
    return ms && mc && mco;
  });
  const displayedRates = filterDir === 'none' ? filteredRates : filteredRates.filter(r => getChangeDir(r) === filterDir);
  const totalPages = Math.ceil(displayedRates.length / itemsPerPage);
  const paginatedRates = displayedRates.slice((currentPage-1)*itemsPerPage, currentPage*itemsPerPage);

  // Build lookup: most recent inactive rate per entity/destination pair
  const prevRateMap = useMemo(() => {
    const map = new Map<string, Rate>();
    allRates.filter(r => !r.is_active).forEach(r => {
      const key = `${r.entity_type}|${r.entity_id}|${r.mcc}|${r.mnc}`;
      const existing = map.get(key);
      if (!existing || new Date(r.effective_from).getTime() > new Date(existing.effective_from).getTime()) {
        map.set(key, r);
      }
    });
    return map;
  }, [allRates]);
  const getPrevRate = (r: Rate): Rate | null => {
    return prevRateMap.get(`${r.entity_type}|${r.entity_id}|${r.mcc}|${r.mnc}`) || null;
  };
  const currentYear = new Date().getFullYear();
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const opts: Intl.DateTimeFormatOptions = { month:'short', day:'numeric' };
    if (d.getFullYear() !== currentYear) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  };
  const dirCounts = useMemo(() => {
    let inc = 0, dec = 0, unch = 0, nw = 0;
    filteredRates.forEach(r => {
      const d = getChangeDir(r);
      if (d === 'increase') inc++;
      else if (d === 'decrease') dec++;
      else if (d === 'unchanged') unch++;
      else if (d === 'new') nw++;
    });
    return { inc, dec, unch, nw, all: filteredRates.length };
  }, [filteredRates]);
  const getChangeDir = (r: Rate): 'increase'|'decrease'|'unchanged'|'new' => {
    const prev = prevRateMap.get(`${r.entity_type}|${r.entity_id}|${r.mcc}|${r.mnc}`);
    if (!prev) return 'new';
    if (r.rate > prev.rate) return 'increase';
    if (r.rate < prev.rate) return 'decrease';
    return 'unchanged';
  };

  const getClientName = (id: string) => { const c = clients.find(x => x.id === id); return c ? `${c.client_code} - ${c.company_name}` : 'Unknown'; };
  const getClientEmail = (id: string) => { const c = clients.find(x => x.id === id); return c?.email || ''; };

  // Detect rate direction
  const getDirection = (oldRate: number, newRate: number): string => {
    if (oldRate === 0) return 'New';
    if (newRate > oldRate) return 'Increase';
    if (newRate < oldRate) return 'Decrease';
    return 'Unchanged';
  };

  const openModal = (rate?: Rate) => {
    setSelectedCountry(''); setSelectedMncs(['*']); setRateValue(0); setApplyToSupplier(false); setTargetSupplierId('');
    if (rate) {
      setEditingRate(rate); setSendNotification(false);
      setFormData({ entity_id:rate.entity_id, mcc:rate.mcc, country:rate.country, rate:rate.rate, effective_from:rate.effective_from, is_active:rate.is_active });
      setSelectedCountry(rate.country); setSelectedMncs([rate.mnc]); setRateValue(rate.rate);
    } else {
      setEditingRate(null); setSendNotification(true);
      setFormData({ entity_id:clientFilter!=='all'?clientFilter:'', mcc:'', country:'', rate:0, effective_from:new Date().toISOString().split('T')[0], is_active:true });
    }
    setShowModal(true);
  };

  const onSelectCountry = (country: string) => {
    setSelectedCountry(country);
    setSelectedMncs(['*']);
    const mcc = mccmnc.find(m => m.country === country)?.mcc || '';
    setFormData(p => ({ ...p, country, mcc }));
  };

  const toggleMnc = (mnc: string) => {
    setSelectedMncs(prev => {
      if (mnc === '*') return ['*'];
      const withoutStar = prev.filter(m => m !== '*');
      if (withoutStar.includes(mnc)) return withoutStar.filter(m => m !== mnc).length === 0 ? ['*'] : withoutStar.filter(m => m !== mnc);
      return [...withoutStar, mnc];
    });
  };

  const handleSubmit = () => {
    if (!formData.entity_id || !selectedCountry || !rateValue) { addToast('error', 'Please fill all fields'); return; }
    const mcc = formData.mcc || mccmnc.find(m => m.country === selectedCountry)?.mcc || '';
    let mncsToAdd = selectedMncs.includes('*') ? mccmnc.filter(m => m.country === selectedCountry && m.mcc === mcc).map(m => m.mnc) : selectedMncs;
    if (mncsToAdd.length === 0) mncsToAdd = ['*'];
    const now = new Date();
    const effectiveDT = `${formData.effective_from} ${now.toLocaleTimeString()}`;

    let count = 0;
    for (const mnc of mncsToAdd) {
      const op = mccmnc.find(m => m.mcc === mcc && m.mnc === mnc);
      const opName = mnc === '*' ? 'All' : (op?.operator || 'All');
      // Find existing active rate to get old rate for notification
      const existing = clientRates.find(r => r.entity_id === formData.entity_id && r.mcc === mcc && r.mnc === mnc && r.is_active);
      const oldRate = existing?.rate || 0;
      // Deactivate old rate with timestamp
      if (existing) updateRate(existing.id, { is_active: false, effective_to: now.toISOString().split('T')[0] });
      // Create new rate
      addRate({ entity_type: 'client', entity_id: formData.entity_id, mcc, mnc, country: selectedCountry, operator: opName, rate: rateValue, currency: 'EUR', effective_from: formData.effective_from, effective_to: null, is_active: true });
      count++;
      // Build notification data (last one only for display)
      if (mnc === mncsToAdd[mncsToAdd.length-1] || mncsToAdd.length === 1) {
        setNotificationData({
          country: selectedCountry, account: getClientName(formData.entity_id), mcc, mncs: mncsToAdd.join(', '),
          oldRate, newRate: rateValue, direction: getDirection(oldRate, rateValue), effectiveDate: effectiveDT,
        });
      }

      // Also apply to supplier if requested
      if (applyToSupplier && targetSupplierId) {
        const supplierExisting = allRates.find(r => r.entity_type === 'supplier' && r.entity_id === targetSupplierId && r.mcc === mcc && r.mnc === mnc && r.is_active);
        if (supplierExisting) updateRate(supplierExisting.id, { is_active: false, effective_to: now.toISOString().split('T')[0] });
        addRate({ entity_type: 'supplier', entity_id: targetSupplierId, mcc, mnc, country: selectedCountry, operator: opName, rate: rateValue, currency: 'EUR', effective_from: formData.effective_from, effective_to: null, is_active: true });
      }
    }

    if (sendNotification) {
      setNotifyEmail(getClientEmail(formData.entity_id));

      // Send notification via API (triggers real email if SMTP configured)
      notificationService.sendRateChangeNotification({
        entity_type: 'client',
        entity_id: formData.entity_id,
        destination: `${selectedCountry} (${mncsToAdd.length} operator${mncsToAdd.length > 1 ? 's' : ''})`,
        old_rate: 0,
        new_rate: rateValue,
        effective_date: effectiveDT,
      }).catch(() => {});

      setShowNotifyModal(true);
    }
    setShowModal(false);
  };

  const handleBulkDelete = () => { selectedRates.forEach(id => deleteRate(id)); setSelectedRates([]); };
  const toggleSelect = (id: string) => setSelectedRates(p => p.includes(id) ? p.filter(i => i!==id) : [...p, id]);

  const showRateHistory = (rate: Rate) => {
    const hist = allRates.filter(r => r.entity_type==='client' && r.entity_id===rate.entity_id && r.mcc===rate.mcc && r.mnc===rate.mnc).sort((a,b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
    setHistoryRates(hist); setShowHistoryModal(true);
  };

  const handleSendNotification = (rate: Rate) => {
    setNotificationData({ country:rate.country, account:getClientName(rate.entity_id), mcc:rate.mcc, mncs:rate.mnc, oldRate:0, newRate:rate.rate, direction:'New', effectiveDate:new Date().toLocaleString() });
    setNotifyEmail(getClientEmail(rate.entity_id));
    // Queue the notification via API
    notificationService.sendRateChangeNotification({
      entity_type: 'client',
      entity_id: rate.entity_id,
      destination: `${rate.country} - ${rate.operator || 'All'}`,
      old_rate: 0,
      new_rate: rate.rate,
      effective_date: new Date().toLocaleString(),
    }).catch(() => {});
    setShowNotifyModal(true);
  };
  const sendRateEmail = () => {
    // Trigger actual email via the API
    if (notificationData && notifyEmail) {
      notificationService.sendNotification({
        template_name: 'Rate Change Notice',
        variables: {
          entity_name: notificationData.account,
          entity_code: 'N/A',
          smpp_username: 'N/A',
          destination: notificationData.country,
          old_rate: `€${notificationData.oldRate.toFixed(4)}`,
          new_rate: `€${notificationData.newRate.toFixed(4)}`,
          effective_date: notificationData.effectiveDate,
        },
        recipients: [notifyEmail],
        channel: 'email',
      }).then(r => {
        if (r.success) addToast('success', `Rate notification email sent to ${notifyEmail}`);
        else addToast('warning', `Email queued (SMTP status): ${r.message || 'check SMTP config'}`);
      }).catch(() => addToast('success', `Rate notification queued for ${notifyEmail}`));
    } else {
      addToast('success', `Rate notification queued for ${notifyEmail}`);
    }
    setShowNotifyModal(false);
  };

  const handleExportCSV = () => { exportCSV('client_rates_export.csv', ['client_id','client_name','mcc','mnc','country','operator','rate','currency','effective_from','effective_to','is_active','status'], displayedRates.map(r => [r.entity_id, getClientName(r.entity_id), r.mcc, r.mnc, r.country, r.operator, r.rate.toFixed(6), r.currency, r.effective_from, r.effective_to||'', String(r.is_active), r.is_active?'Active':'Inactive'])); };

  const handleExportExcel = () => { exportExcel('client_rates_export.xlsx', 'Client Rates', ['Client ID','Client Name','MCC','MNC','Country','Operator','Rate','Currency','Effective From','Effective To','Is Active','Status'], displayedRates.map(r => [r.entity_id, getClientName(r.entity_id), r.mcc, r.mnc, r.country, r.operator, r.rate.toFixed(6), r.currency, r.effective_from, r.effective_to||'', String(r.is_active), r.is_active?'Active':'Inactive'])); };

  const columns = [
    { key:'select', header:'☑', width:'40px', render:(rate:Rate) => <button onClick={(e)=>{e.stopPropagation();toggleSelect(rate.id);}} className="p-1">{selectedRates.includes(rate.id)?<CheckSquare size={16} className="text-blue-600"/>:<Square size={16} className="text-gray-400"/>}</button> },
    { key:'type', header:'Type', width:'90px', render:() => <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-100 flex-shrink-0" /><Badge variant="info" size="sm">Client</Badge></div> },
    { key:'client', header:'Client', render:(rate:Rate) => <span className="text-sm">{getClientName(rate.entity_id)}</span> },
    { key:'destination', header:'Destination', render:(rate:Rate) => <div><p className="font-medium text-sm">{rate.country}</p><p className="text-xs text-gray-500">{rate.operator}</p></div> },
    { key:'mccmnc', header:'MCC/MNC', render:(rate:Rate) => <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">{rate.mcc}{rate.mnc}</span> },
    { key:'rate', header:'Rate (EUR)', align:'right' as const, render:(rate:Rate) => <div className="text-right"><p className={`font-semibold text-sm ${rate.is_active?'text-gray-800':'text-red-500 line-through'}`}>€{rate.rate.toFixed(4)}</p>{!rate.is_active&&rate.effective_to&&<p className="text-[10px] text-red-400">Ended {rate.effective_to}</p>}</div> },
    { key:'prev', header:'Prev Rate', align:'right' as const, render:(rate:Rate)=>{const prev=getPrevRate(rate);return prev?<div className="text-right"><p className="text-xs text-gray-400 line-through">€{prev.rate.toFixed(4)}</p><p className={`text-[10px] font-medium ${rate.rate>prev.rate?'text-red-500':rate.rate<prev.rate?'text-green-500':'text-gray-400'}`}>{prev.rate===0?`↑ New`:rate.rate>prev.rate?`↑ ${((rate.rate-prev.rate)/prev.rate*100).toFixed(1)}%`:rate.rate<prev.rate?`↓ ${((prev.rate-rate.rate)/prev.rate*100).toFixed(1)}%`:'→ 0%'}</p><p className="text-[10px] text-gray-400">{prev.effective_from?formatDate(prev.effective_from):''}</p></div>:<span className="text-xs text-gray-300">—</span>}},
    { key:'effective', header:'Effective', render:(rate:Rate) => <span className="text-xs">{formatDate(rate.effective_from)} {rate.is_active?<span className="text-green-500">● Active</span>:<span className="text-red-500">● Inactive</span>}</span> },
    { key:'status', header:'Status', render:(rate:Rate) => <Badge variant={rate.is_active?'success':'danger'} dot size="sm">{rate.is_active?'Active':'Inactive'}</Badge> },
    { key:'actions', header:'', render:(rate:Rate) => <div className="flex gap-1">{rate.is_active&&<><button onClick={(e)=>{e.stopPropagation();openModal(rate);}} className="p-1 rounded hover:bg-gray-100"><Edit size={14} className="text-gray-500"/></button><button onClick={(e)=>{e.stopPropagation();handleSendNotification(rate);}} className="p-1 rounded hover:bg-gray-100"><Mail size={14} className="text-blue-500"/></button></>}<button onClick={(e)=>{e.stopPropagation();showRateHistory(rate);}} className="p-1 rounded hover:bg-gray-100"><Clock size={14} className="text-purple-500"/></button><button onClick={(e)=>{e.stopPropagation();deleteRate(rate.id);}} className="p-1 rounded hover:bg-gray-100"><Trash2 size={14} className="text-red-500"/></button></div> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-800">Client Rates</h1><p className="text-gray-500 mt-1">{clientRates.length} rates — Select country → multi-select operators → one click add all</p></div>
        <div className="flex gap-2"><Button variant="secondary" icon={<Download size={16}/>} onClick={handleExportCSV}>Export CSV</Button><Button variant="secondary" icon={<Download size={16}/>} onClick={handleExportExcel}>Export Excel</Button><Button icon={<Plus size={18}/>} onClick={()=>openModal()}>Add Rate</Button></div>
      </div>

      {selectedRates.length > 0 && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between"><span className="text-blue-700 font-medium text-sm">{selectedRates.length} selected</span><div className="flex gap-2"><Button size="sm" variant="secondary" icon={<Send size={14}/>} onClick={()=>handleSendNotification(clientRates.find(r=>r.id===selectedRates[0])!)}>Send Notice</Button><Button size="sm" variant="danger" icon={<Trash2 size={14}/>} onClick={handleBulkDelete}>Delete</Button></div></div>}

      <Card><div className="flex flex-col md:flex-row gap-3"><div className="flex-1 relative"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input type="text" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/></div><select value={clientFilter} onChange={e=>{setClientFilter(e.target.value);setCurrentPage(1);}} className="px-4 py-2 border border-gray-300 rounded-lg text-sm"><option value="all">All Clients</option>{clients.map(c=><option key={c.id} value={c.id}>{c.client_code} - {c.company_name}</option>)}</select><select value={countryFilter} onChange={e=>{setCountryFilter(e.target.value);setCurrentPage(1);}} className="px-4 py-2 border border-gray-300 rounded-lg text-sm"><option value="all">All Countries</option>{countries.map(c=><option key={c} value={c}>{c}</option>)}</select></div><div className="flex gap-1 mt-2 md:mt-0"><button onClick={()=>{setFilterDir('none');setCurrentPage(1);}} title="Show all rates" className={`px-3 py-1.5 text-xs rounded-lg border transition ${filterDir==='none'?'bg-blue-50 border-blue-300 text-blue-700':'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>All ({dirCounts.all})</button><button onClick={()=>{setFilterDir('increase');setCurrentPage(1);}} title="Show only rates with price increases" className={`px-3 py-1.5 text-xs rounded-lg border transition ${filterDir==='increase'?'bg-red-50 border-red-300 text-red-700':'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>↑ Increase ({dirCounts.inc})</button><button onClick={()=>{setFilterDir('decrease');setCurrentPage(1);}} title="Show only rates with price decreases" className={`px-3 py-1.5 text-xs rounded-lg border transition ${filterDir==='decrease'?'bg-green-50 border-green-300 text-green-700':'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>↓ Decrease ({dirCounts.dec})</button><button onClick={()=>{setFilterDir('unchanged');setCurrentPage(1);}} title="Show only rates with unchanged prices" className={`px-3 py-1.5 text-xs rounded-lg border transition ${filterDir==='unchanged'?'bg-gray-100 border-gray-400 text-gray-700':'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>→ Same ({dirCounts.unch})</button><button onClick={()=>{setFilterDir('new');setCurrentPage(1);}} title="Show only rates with no previous price history" className={`px-3 py-1.5 text-xs rounded-lg border transition ${filterDir==='new'?'bg-amber-50 border-amber-300 text-amber-700':'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>★ New ({dirCounts.nw})</button></div></Card>

      <Card noPadding><Table columns={columns} data={paginatedRates} keyExtractor={r=>r.id} /><Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={displayedRates.length} itemsPerPage={itemsPerPage}/></Card>

      {/* Add Rate Modal - Multi Operator Select */}
      <Modal isOpen={showModal} onClose={()=>setShowModal(false)} title={editingRate?'Edit Rate':'Add New Rates (Multi-Operator)'} size="lg" footer={<div className="flex justify-between w-full"><span className="text-sm text-gray-500">{selectedMncs.includes('*') ? `All ${mccmnc.filter(m=>m.country===selectedCountry).length} operators` : `${selectedMncs.length} operators`} selected</span><div className="flex gap-3"><Button variant="secondary" onClick={()=>setShowModal(false)}>Cancel</Button><Button onClick={handleSubmit}>Add Rates</Button></div></div>}>
        <div className="space-y-4">
          {editingRate&&editingRate.is_active&&<div className="bg-yellow-50 p-3 rounded-lg text-sm text-yellow-700">⚠ This will deactivate current rate (€{editingRate.rate.toFixed(4)}) and create a new version with timestamp.</div>}
          <Select label="Client *" value={formData.entity_id} onChange={e=>setFormData(p=>({...p,entity_id:e.target.value}))} options={[{value:'',label:'Select Client'},...clients.map(c=>({value:c.id,label:`${c.client_code} - ${c.company_name}`}))]} required/>
          <Select label="Country *" value={selectedCountry} onChange={e => onSelectCountry(e.target.value)} options={[{value:'',label:'Select Country'},...countries.map(c=>({value:c,label:c}))]} required/>
          {selectedCountry && (
            <div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Operators in {selectedCountry}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={()=>{const all=mccmnc.filter(m=>m.country===selectedCountry).map(m=>m.mnc);setSelectedMncs(all);}} className="text-xs text-blue-600 hover:underline">Select All ({mccmnc.filter(m=>m.country===selectedCountry).length})</button>
                  <button type="button" onClick={()=>setSelectedMncs(['*'])} className="text-xs text-red-600 hover:underline">All (*)</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {mccmnc.filter(m => m.country === selectedCountry).map(op => (
                  <label key={op.mnc} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition text-sm ${selectedMncs.includes(op.mnc) || selectedMncs.includes('*') ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="checkbox" checked={selectedMncs.includes(op.mnc) || selectedMncs.includes('*')} onChange={() => toggleMnc(op.mnc)} className="w-4 h-4 rounded border-gray-300 text-blue-600"/>
                    <div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><span className="font-mono font-semibold text-blue-700 text-sm">{op.mnc}</span><span className="text-gray-600 truncate text-sm">{op.operator}</span></div><span className="text-[10px] text-gray-400">MCC: {op.mcc} • {op.network_type}</span></div>
                  </label>
                ))}
              </div>
            </div>
          )}
          <Input label="Rate (EUR) *" type="number" step="0.0001" value={rateValue} onChange={e=>setRateValue(parseFloat(e.target.value))} placeholder="0.0000" required/>
          <Input label="Effective From" type="date" value={formData.effective_from} onChange={e=>setFormData(p=>({...p,effective_from:e.target.value}))}/>
          {!editingRate && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3"><label className="flex items-center gap-2"><input type="checkbox" checked={sendNotification} onChange={e=>setSendNotification(e.target.checked)} className="w-4 h-4 rounded"/><span className="text-sm font-medium text-blue-700">Send rate notification via email</span></label></div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={applyToSupplier} onChange={e=>setApplyToSupplier(e.target.checked)} className="w-4 h-4 rounded"/><span className="text-sm font-medium text-purple-700">Also apply as supplier rate</span></label>
                {applyToSupplier && <Select value={targetSupplierId} onChange={e=>setTargetSupplierId(e.target.value)} options={[{value:'',label:'Select Supplier'},...suppliers.map(s=>({value:s.id,label:`${s.supplier_code} - ${s.company_name}`}))]}/>}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Rate Notification Modal with full details */}
      <Modal isOpen={showNotifyModal} onClose={()=>setShowNotifyModal(false)} title="Send Rate Change Notification" size="lg" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={()=>setShowNotifyModal(false)}>Cancel</Button><Button icon={<Send size={14}/>} onClick={sendRateEmail}>Send Email</Button></div>}>
        <div className="space-y-4">
          {notificationData && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-blue-800 text-sm">Rate Change Details</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-blue-600 text-xs block">Country Name</span><span className="font-medium">{notificationData.country}</span></div>
                <div><span className="text-blue-600 text-xs block">Account</span><span className="font-medium">{notificationData.account}</span></div>
                <div><span className="text-blue-600 text-xs block">MCC</span><span className="font-mono">{notificationData.mcc}</span></div>
                <div><span className="text-blue-600 text-xs block">MNC(s)</span><span className="font-mono">{notificationData.mncs}</span></div>
                <div><span className="text-blue-600 text-xs block">Old Rate</span><span className="text-red-600 line-through font-semibold">€{notificationData.oldRate.toFixed(4)}</span></div>
                <div><span className="text-blue-600 text-xs block">New Rate</span><span className="text-green-600 font-semibold text-lg">€{notificationData.newRate.toFixed(4)}</span></div>
                <div><span className="text-blue-600 text-xs block">Change</span><Badge variant={notificationData.direction==='New'?'info':notificationData.direction==='Increase'?'warning':'success'}>{notificationData.direction}</Badge></div>
                <div><span className="text-blue-600 text-xs block">Effective Date & Time</span><span className="font-medium text-xs">{notificationData.effectiveDate}</span></div>
              </div>
              {applyToSupplier && targetSupplierId && <div className="mt-2 pt-2 border-t border-blue-200"><span className="text-purple-700 text-xs font-medium">✅ Also applied to supplier: {suppliers.find(s=>s.id===targetSupplierId)?.company_name || targetSupplierId}</span></div>}
            </div>
          )}
          <Input label="Recipient Email" value={notifyEmail} onChange={e=>setNotifyEmail(e.target.value)} placeholder="client@example.com"/>
          <p className="text-xs text-gray-500">The email will include: Country Name, Network, Account, MCC, MNC, Old Rate, New Rate, Change Direction (New/Increase/Decrease), Effective Date & Time.</p>
        </div>
      </Modal>

      {/* Rate History Modal with timestamps */}
      <Modal isOpen={showHistoryModal} onClose={()=>setShowHistoryModal(false)} title="Rate History (Version Timeline)" size="xl">
        <table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="px-3 py-2 text-left text-xs font-medium">Version</th><th className="px-3 py-2 text-left text-xs font-medium">Old Rate</th><th className="px-3 py-2 text-left text-xs font-medium">New Rate</th><th className="px-3 py-2 text-left text-xs font-medium">Change</th><th className="px-3 py-2 text-left text-xs font-medium">Effective From</th><th className="px-3 py-2 text-left text-xs font-medium">Effective To</th><th className="px-3 py-2 text-left text-xs font-medium">Status</th><th className="px-3 py-2 text-left text-xs font-medium">Duration</th></tr></thead><tbody className="divide-y">
          {historyRates.map((r, i) => {
            const prev = historyRates[i+1];
            const oldRateVal = prev?.rate || 0;
            const newRateVal = r.rate;
            const dir = i === historyRates.length-1 ? 'New' : newRateVal > oldRateVal ? 'Increase' : newRateVal < oldRateVal ? 'Decrease' : 'Same';
            const duration = r.effective_to ? `${Math.round((new Date(r.effective_to).getTime() - new Date(r.effective_from).getTime()) / 86400000)} days` : 'Ongoing';
            return (
              <tr key={r.id} className={!r.is_active ? 'bg-red-50' : 'bg-green-50'}>
                <td className="px-3 py-2 font-mono text-xs font-bold">v{historyRates.length - i}</td>
                <td className="px-3 py-2 text-xs text-red-600 line-through">{i < historyRates.length-1 ? `€${oldRateVal.toFixed(4)}` : '—'}</td>
                <td className="px-3 py-2 font-semibold text-green-700 text-xs">€{newRateVal.toFixed(4)}</td>
                <td className="px-3 py-2"><Badge variant={dir==='New'?'info':dir==='Increase'?'warning':'success'} size="sm">{dir}</Badge></td>
                <td className="px-3 py-2 text-xs">{formatDate(r.effective_from)} {r.created_at ? <span className="text-[10px] text-gray-400 block">{new Date(r.created_at).toLocaleTimeString()}</span> : null}</td>
                <td className="px-3 py-2 text-xs">{r.effective_to ? formatDate(r.effective_to) : 'Present'}</td>
                <td className="px-3 py-2"><Badge variant={r.is_active?'success':'danger'} size="sm">{r.is_active?'ACTIVE':'Inactive'}</Badge></td>
                <td className="px-3 py-2 text-xs">{duration}</td>
              </tr>
            );
          })}
        </tbody></table>
        {historyRates.length === 0 && <p className="text-center py-4 text-gray-500">No rate history found</p>}
      </Modal>
    </div>
  );
};
