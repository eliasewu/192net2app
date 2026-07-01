import React, { useState } from 'react';
import { Plus, Search, Edit, Trash2, Play, Regex, Phone, Hash, Type, Code2, Shield, Globe, ArrowRight, RefreshCw, Download, Upload } from 'lucide-react';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { exportCSV, exportExcel } from '../services/exportService';
import { Table, Pagination } from '../components/UI/Table';
import { Modal } from '../components/UI/Modal';
import { Input, Select, Textarea } from '../components/UI/Input';
import { useToast } from '../components/UI/Toast';
import { useData } from '../store/DataContext';
import { api } from '../services/api';

// ============================================================
// TYPES OF TRANSLATIONS (frontend subtypes)
// ============================================================
type TranslationType = 
  | 'sender_id_masking'       // SID masking: alpha↔numeric, local short code
  | 'origination_translation'  // Origination translation
  | 'destination_prefix'       // Number prefix stripping/insertion  
  | 'destination_format'       // E.164 formatting, leading zero removal, add/remove +
  | 'content_text_replacement' // Text/body replacement
  | 'content_otp_extract'      // Extract OTP from content (4-8 digit)
  | 'content_regex_replace'    // Regex match & replace in body
  | 'content_smart_quotes'     // Fix smart/curly quotes
  | 'content_url_shorten'      // URL shortener
  | 'content_accent_remove'    // Remove accents/diacritics
  | 'content_strip_emoji'      // Strip emojis from message
  | 'content_random_body'      // Random body anti-template detection

// Frontend translation shape (maps to server Translation with extra display fields)
interface TranslationEx {
  id: string;
  name: string;
  type: TranslationType;
  priority: number;
  apply_to: 'client' | 'supplier' | 'both';
  apply_entity_id: string;
  match_pattern: string;
  replace_pattern: string;
  description: string;
  is_active: boolean;
  created_at: string;
  test_input?: string;
  test_output?: string;
}

// ---- Mapping: frontend subtype ↔ server translation_type ----
const subtypeToServerType: Record<TranslationType, 'sender_id' | 'destination' | 'content' | 'origination'> = {
  sender_id_masking: 'sender_id',
  origination_translation: 'origination',
  destination_prefix: 'destination',
  destination_format: 'destination',
  content_text_replacement: 'content',
  content_otp_extract: 'content',
  content_regex_replace: 'content',
  content_smart_quotes: 'content',
  content_url_shorten: 'content',
  content_accent_remove: 'content',
  content_strip_emoji: 'content',
  content_random_body: 'content',
};

// Helper: map server row to frontend TranslationEx
function serverToTranslation(s: any): TranslationEx {
  // Determine the subtype from the 'subtype' column (if set) or guess from translation_type
  let frontendType: TranslationType = (s.subtype && subtypeToServerType[s.subtype as TranslationType] !== undefined) 
    ? s.subtype as TranslationType 
    : s.translation_type === 'sender_id' ? 'sender_id_masking'
    : s.translation_type === 'destination' ? 'destination_format'
    : s.translation_type === 'origination' ? 'origination_translation'
    : 'content_text_replacement';

  let apply_to: 'client' | 'supplier' | 'both' = (s.apply_to as any) || 'client';
  let apply_entity_id = s.apply_entity_id || 'all';

  // Infer from legacy client_id/supplier_id if apply_to/apply_entity_id not set
  if (!s.apply_to) {
    if (s.client_id) { apply_to = 'client'; apply_entity_id = String(s.client_id); }
    else if (s.supplier_id) { apply_to = 'supplier'; apply_entity_id = String(s.supplier_id); }
    else { apply_to = 'client'; apply_entity_id = 'all'; }
  }

  return {
    id: String(s.id),
    name: s.name || `Translation #${s.id}`,
    type: frontendType,
    priority: s.priority || 1,
    apply_to,
    apply_entity_id,
    match_pattern: s.source_pattern || '',
    replace_pattern: s.target_value || '',
    description: s.description || '',
    is_active: s.is_active !== false,
    created_at: s.created_at || new Date().toISOString(),
  };
}

// Helper: apply regex translation
function applyTranslation(input: string, pattern: string, replacement: string, type: TranslationType): string {
  if (!input || !pattern) return input;
  try {
    switch (type) {
      case 'content_otp_extract': {
        const re = new RegExp(pattern, 'gi');
        return input.replace(re, '{{OTP}}');
      }
      case 'content_regex_replace': {
        const re = new RegExp(pattern, 'gi');
        const options = replacement.split('|').map(s => s.trim());
        const match = input.match(re);
        if (match) {
          const randomTemplate = options[Math.floor(Math.random() * options.length)];
          return randomTemplate.replace('{{OTP}}', match[0]);
        }
        return input;
      }
      case 'content_random_body': {
        const options = replacement.split('|').map(s => s.trim());
        return options[Math.floor(Math.random() * options.length)];
      }
      default: {
        const re = new RegExp(pattern, 'gi');
        return input.replace(re, replacement);
      }
    }
  } catch (e) {
    return input;
  }
}

export const TranslationsPage: React.FC = () => {
  const { translations: serverTranslations, clients, suppliers, addTranslation, updateTranslation, deleteTranslation, reloadTranslations } = useData();
  const { addToast } = useToast();

  const [form, setForm] = useState({
    name: '', type: 'content_otp_extract' as TranslationType, priority: 1,
    apply_to: 'client' as 'client' | 'supplier' | 'both', apply_entity_id: 'all',
    match_pattern: '', replace_pattern: '', description: '', is_active: true,
  });

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TranslationEx | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testResult, setTestResult] = useState<{ input: string; output: string } | null>(null);
  const [selectedType, setSelectedType] = useState<TranslationType>('content_otp_extract');
  const [saving, setSaving] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkType, setBulkType] = useState<TranslationType>('content_random_body');
  const [bulkApplyTo, setBulkApplyTo] = useState<'client' | 'supplier' | 'both'>('client');
  const [bulkEntityId, setBulkEntityId] = useState('all');
  const [bulkPreview, setBulkPreview] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<'pool' | 'csv'>('pool');
  const [bulkUploading, setBulkUploading] = useState(false);

  // Convert server rows to frontend shape
  const translations: TranslationEx[] = React.useMemo(
    () => (Array.isArray(serverTranslations) ? serverTranslations : []).map(serverToTranslation),
    [serverTranslations]
  );

  // Build entity options based on apply_to selection
  const entityOptions = React.useMemo(() => {
    const base = [{ value: 'all', label: form.apply_to === 'supplier' ? 'All Suppliers' : form.apply_to === 'both' ? 'Global (All)' : 'All Clients' }];
    if (form.apply_to === 'supplier') {
      return [...base, ...suppliers.map(s => ({ value: String(s.id), label: s.company_name || s.supplier_code }))];
    }
    if (form.apply_to === 'both') {
      return [
        ...base,
        ...clients.map(c => ({ value: `client:${c.id}`, label: `📋 ${c.company_name || c.client_code}` })),
        ...suppliers.map(s => ({ value: `supplier:${s.id}`, label: `📡 ${s.company_name || s.supplier_code}` })),
      ];
    }
    return [...base, ...clients.map(c => ({ value: String(c.id), label: c.company_name || c.client_code }))];
  }, [form.apply_to, clients, suppliers]);

  const itemsPerPage = 10;
  const filtered = translations.filter(t => {
    const ms = t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
    const mt = typeFilter === 'all' || t.type === typeFilter;
    return ms && mt;
  });
  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const typeLabels: Record<TranslationType, { label: string; icon: React.ReactNode; color: 'info' | 'success' | 'warning' | 'purple' | 'default' | 'danger' }> = {
    sender_id_masking: { label: 'SID Masking', icon: <Shield size={14} />, color: 'info' },
    origination_translation: { label: 'Origination', icon: <Phone size={14} />, color: 'purple' },
    destination_prefix: { label: 'Prefix', icon: <Hash size={14} />, color: 'warning' },
    destination_format: { label: 'E.164 Format', icon: <Globe size={14} />, color: 'info' },
    content_text_replacement: { label: 'Text Replace', icon: <Type size={14} />, color: 'success' },
    content_otp_extract: { label: 'OTP Extract', icon: <Code2 size={14} />, color: 'danger' },
    content_regex_replace: { label: 'Regex Replace', icon: <Regex size={14} />, color: 'purple' },
    content_smart_quotes: { label: 'Smart Quotes', icon: <Type size={14} />, color: 'default' },
    content_url_shorten: { label: 'URL Shorten', icon: <Globe size={14} />, color: 'info' },
    content_accent_remove: { label: 'Accent Rem', icon: <Type size={14} />, color: 'default' },
    content_strip_emoji: { label: 'Strip Emoji', icon: <Type size={14} />, color: 'warning' },
    content_random_body: { label: 'Random Body', icon: <RefreshCw size={14} />, color: 'danger' },
  };

  const typeCategoryLabels: Record<string, string> = {
    sender_id_masking: 'Sender ID', origination_translation: 'Sender ID',
    destination_prefix: 'Destination', destination_format: 'Destination',
    content_text_replacement: 'Content', content_otp_extract: 'Content',
    content_regex_replace: 'Content', content_smart_quotes: 'Content',
    content_url_shorten: 'Content', content_accent_remove: 'Content',
    content_strip_emoji: 'Content', content_random_body: 'Content',
  };

  const openModal = (t?: TranslationEx) => {
    if (t) {
      setEditing(t);
      setForm({ name: t.name, type: t.type, priority: t.priority, apply_to: t.apply_to, apply_entity_id: t.apply_entity_id, match_pattern: t.match_pattern, replace_pattern: t.replace_pattern, description: t.description, is_active: t.is_active });
    } else {
      setEditing(null);
      setForm({ name: '', type: selectedType, priority: translations.length + 1, apply_to: 'client', apply_entity_id: 'all', match_pattern: '', replace_pattern: '', description: '', is_active: true });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.match_pattern || form.replace_pattern == null) {
      addToast('error', 'Name, pattern, and replacement are required');
      return;
    }
    setSaving(true);
    try {
      // Map client_id/supplier_id from apply_to + apply_entity_id
      let clientId: any = null;
      let supplierId: any = null;
      if (form.apply_entity_id && form.apply_entity_id !== 'all') {
        if (form.apply_to === 'both' && form.apply_entity_id.startsWith('client:')) {
          const eid = parseInt(form.apply_entity_id.replace('client:', ''), 10);
          if (!isNaN(eid)) clientId = eid;
        } else if (form.apply_to === 'both' && form.apply_entity_id.startsWith('supplier:')) {
          const eid = parseInt(form.apply_entity_id.replace('supplier:', ''), 10);
          if (!isNaN(eid)) supplierId = eid;
        } else {
          const eid = parseInt(form.apply_entity_id, 10);
          if (!isNaN(eid)) {
            if (form.apply_to === 'client') clientId = eid;
            else if (form.apply_to === 'supplier') supplierId = eid;
          }
        }
      }

      const payload = {
        translation_type: subtypeToServerType[form.type],
        source_pattern: form.match_pattern,
        target_value: form.replace_pattern,
        client_id: clientId,
        supplier_id: supplierId,
        name: form.name,
        description: form.description,
        subtype: form.type,
        priority: form.priority,
        apply_to: form.apply_to,
        apply_entity_id: form.apply_entity_id,
        is_active: form.is_active,
      };

      if (editing) {
        await updateTranslation(editing.id, payload as any);
        addToast('success', 'Translation updated');
      } else {
        await addTranslation(payload as any);
        addToast('success', 'Translation created');
      }
      setShowModal(false);
      setEditing(null);
    } catch (e: any) {
      addToast('error', e?.error || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const t = translations.find(x => x.id === id);
    if (!t) return;
    try {
      await deleteTranslation(id);
      addToast('success', `"${t.name}" deleted`);
    } catch (e: any) {
      addToast('error', e?.error || e?.message || 'Delete failed');
    }
  };

  const handleTest = (t: TranslationEx) => {
    const testInput = t.test_input || prompt('Enter test input:') || '';
    const output = applyTranslation(testInput, t.match_pattern, t.replace_pattern, t.type);
    setTestResult({ input: testInput, output });
    setShowTestModal(true);
  };

  // ---- Bulk Upload: parse file for preview ----
  const parseBulkFile = (file: File) => {
    setBulkFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const text = (reader.result as string).trim();
      const lines = text.split(/[\n\r]+/).filter(Boolean);
      if (bulkMode === 'pool') {
        setBulkPreview(lines);
      } else {
        // Show header + data rows
        setBulkPreview(lines.slice(0, 21)); // max 21 lines preview
      }
    };
    reader.readAsText(file);
  };

  // ---- Bulk Upload: submit to server ----
  const handleBulkUpload = async () => {
    if (!bulkFile) return;
    setBulkUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', bulkFile);
      fd.append('type', bulkType);
      fd.append('apply_to', bulkApplyTo);
      fd.append('apply_entity_id', bulkEntityId);

      const token = api.getToken();
      const resp = await fetch('/api/translations/bulk', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd,
      });
      const result = await resp.json();

      if (result.success) {
        const msg = result.mode === 'pool'
          ? `Imported pool with ${result.values_count} values`
          : `Imported ${result.created} translation(s)${result.errors?.length ? ` (${result.errors.length} errors)` : ''}`;
        addToast('success', msg);
        setShowBulkModal(false);
        await reloadTranslations();
        // Show per-row errors if any
        if (result.errors?.length) {
          const errorList = (Array.isArray(result.errors) ? result.errors as any[] : []).slice(0, 5);
          errorList.forEach((err: any) => addToast('error', `Line ${err.line}: ${err.error}`));
          if (result.errors.length > 5) addToast('warning', `...and ${result.errors.length - 5} more errors`);
        }
      } else {
        addToast('error', result.error || 'Upload failed');
      }
    } catch (e: any) {
      addToast('error', e?.message || 'Upload failed');
    } finally {
      setBulkUploading(false);
    }
  };

  const handleTestCurrent = () => {
    const testInput = prompt('Enter test input to preview:') || 'Your code is 123456. Enter to verify.';
    const output = applyTranslation(testInput, form.match_pattern, form.replace_pattern, form.type);
    setTestResult({ input: testInput, output });
    setShowTestModal(true);
  };

  // Quick templates for each translation type
  const getQuickTemplates = (type: TranslationType): { label: string; match: string; replace: string; desc: string }[] => {
    switch (type) {
      case 'content_otp_extract':
        return [
          { label: '4-8 Digit OTP', match: '\\\\b(\\\\d{4,8})\\\\b', replace: '{{OTP}}', desc: 'Replace any 4-8 digit code with OTP placeholder' },
          { label: 'OTP with prefix', match: 'is\\\\s+(\\\\d{4,8})', replace: 'is {{OTP}}', desc: 'Extract OTP after "is"' },
          { label: 'Code pattern', match: 'code[:\\\\s]*(\\\\d{4,8})', replace: 'code: {{OTP}}', desc: 'Extract after "code:"' },
        ];
      case 'content_regex_replace':
        return [
          { label: 'Random OTP Templates', match: '\\\\d{4,8}', replace: 'Your code: {{OTP}}|Verification: {{OTP}}|Enter {{OTP}} to continue|Code {{OTP}} expires in 5 min', desc: 'Multiple templates separated by |' },
        ];
      case 'destination_format':
        return [
          { label: 'E.164 Format', match: '^(\\\\+44|0044|44)', replace: '+44', desc: 'Standardize UK numbers' },
          { label: 'Add Plus', match: '^(\\\\d{10,})', replace: '+$1', desc: 'Add + to international numbers' },
        ];
      case 'destination_prefix':
        return [
          { label: 'Strip leading 0', match: '^0(?=[1-9])', replace: '', desc: 'Remove leading zero' },
          { label: 'Add country code', match: '^(\\\\d{10})', replace: '1$1', desc: 'Add +1 to 10-digit numbers' },
          { label: 'Remove +', match: '^\\\\+', replace: '00', desc: 'Replace + with 00' },
          { label: 'Add +', match: '^(\\\\d+)', replace: '+$1', desc: 'Add + prefix' },
        ];
      case 'sender_id_masking':
        return [
          { label: 'Alpha to Numeric', match: 'COMPANY', replace: '12345', desc: 'Convert alpha SID to numeric' },
          { label: 'Numeric to Alpha', match: '12345', replace: 'BRAND', desc: 'Convert numeric to alpha SID' },
          { label: 'Local Short Code', match: '.*', replace: 'SHORT', desc: 'Mask any SID as short code' },
        ];
      case 'content_random_body':
        return [
          { label: 'Random Body', match: '.*', replace: 'Option A|Option B|Option C', desc: 'Pick random body from pipe-separated options' },
        ];
      default:
        return [];
    }
  };

  const columns = [
    { key: 'name', header: 'Translation', render: (t: TranslationEx) => <div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${t.is_active ? 'bg-blue-50' : 'bg-gray-50'}`}>{typeLabels[t.type]?.icon || <Code2 size={14} />}</div><div><p className="font-medium text-gray-800">{t.name}</p><p className="text-xs text-gray-500">{t.description}</p></div></div> },
    { key: 'type', header: 'Type', render: (t: TranslationEx) => <div><Badge variant={typeLabels[t.type]?.color || 'default'} size="sm">{typeLabels[t.type]?.label || t.type}</Badge><p className="text-[10px] text-gray-400 mt-0.5">{typeCategoryLabels[t.type]}</p></div> },
    { key: 'pattern', header: 'Pattern', render: (t: TranslationEx) => <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono max-w-[150px] truncate block">{t.match_pattern}</code> },
    { key: 'replace', header: 'Replace', render: (t: TranslationEx) => <code className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-mono max-w-[120px] truncate block">{t.replace_pattern}</code> },
    { key: 'apply', header: 'Apply To', render: (t: TranslationEx) => <Badge variant={t.apply_to === 'client' ? 'info' : t.apply_to === 'supplier' ? 'purple' : 'warning'}>{t.apply_to === 'both' ? 'All' : t.apply_to}</Badge> },
    { key: 'priority', header: 'Pri', align: 'center' as const, render: (t: TranslationEx) => <span className="font-bold text-gray-700">{t.priority}</span> },
    { key: 'active', header: 'Status', render: (t: TranslationEx) => <Badge variant={t.is_active ? 'success' : 'danger'} dot>{t.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: '', render: (t: TranslationEx) => <div className="flex gap-1"><button onClick={() => handleTest(t)} className="p-1.5 rounded hover:bg-gray-100" title="Test"><Play size={14} className="text-green-500" /></button><button onClick={() => openModal(t)} className="p-1.5 rounded hover:bg-gray-100"><Edit size={14} className="text-gray-500" /></button><button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-gray-100"><Trash2 size={14} className="text-red-500" /></button></div> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Translations</h1>
          <p className="text-gray-500 mt-1">Number formatting, SID masking, content translation, OTP extraction, regex replacement</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Download size={16}/>} onClick={()=>exportCSV('translations_export.csv',['Name','Type','Priority','Apply To','Entity','Pattern','Replace','Description','Active'],filtered.map(t=>[t.name,typeLabels[t.type]?.label||t.type,String(t.priority),t.apply_to,t.apply_entity_id,t.match_pattern,t.replace_pattern,t.description,t.is_active?'Yes':'No']))}>Export CSV</Button>
          <Button variant="secondary" icon={<Download size={16}/>} onClick={()=>exportExcel('translations_export.xlsx','Translations',['Name','Type','Priority','Apply To','Entity','Pattern','Replace','Description','Active'],filtered.map(t=>[t.name,typeLabels[t.type]?.label||t.type,String(t.priority),t.apply_to,t.apply_entity_id,t.match_pattern,t.replace_pattern,t.description,t.is_active?'Yes':'No']))}>Export Excel</Button>
        <Button icon={<Plus size={18} />} onClick={() => openModal()}>Add Translation</Button>
        <Button variant="secondary" icon={<Upload size={16} />} onClick={() => { setShowBulkModal(true); setBulkFile(null); setBulkPreview([]); setBulkType('content_random_body'); setBulkApplyTo('client'); setBulkEntityId('all'); setBulkMode('pool'); }}>Bulk Upload</Button>
        </div>
      </div>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: <Phone size={20} />, title: 'Number Format', desc: 'Prefix, E.164, +/00' },
          { icon: <Shield size={20} />, title: 'SID Masking', desc: 'Alpha↔Numeric, short code' },
          { icon: <Type size={20} />, title: 'Content', desc: 'Replace, emoji, quotes' },
          { icon: <Regex size={20} />, title: 'OTP & Regex', desc: 'Extract, randomize' },
        ].map((c, i) => (
          <div key={i} className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 mb-2">{c.icon}</div>
            <p className="text-sm font-medium text-gray-800">{c.title}</p>
            <p className="text-xs text-gray-500">{c.desc}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search translations..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="all">All Types</option>
            {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card noPadding>
        <Table columns={columns} data={paginated} keyExtractor={t => t.id}/>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filtered.length} itemsPerPage={itemsPerPage} />
      </Card>

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Translation' : 'Add Translation'} size="lg"
        footer={<div className="flex justify-between gap-3 w-full">
          <Button variant="secondary" icon={<Play size={14} />} onClick={handleTestCurrent}>Test</Button>
          <div className="flex gap-3"><Button variant="secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button></div>
        </div>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="OTP Extraction - Standard" required />
            <Select label="Type *" value={form.type} onChange={e => { setForm(p => ({ ...p, type: e.target.value as TranslationType })); setSelectedType(e.target.value as TranslationType); }} options={Object.entries(typeLabels).map(([k, v]) => ({ value: k, label: v.label }))} required />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select label="Apply To *" value={form.apply_to} onChange={e => setForm(p => ({ ...p, apply_to: e.target.value as 'client' | 'supplier' | 'both', apply_entity_id: 'all' }))} options={[{ value: 'client', label: 'Client Only' }, { value: 'supplier', label: 'Supplier Only' }, { value: 'both', label: 'Both' }]} />
            <Select label="Entity" value={form.apply_entity_id} onChange={e => setForm(p => ({ ...p, apply_entity_id: e.target.value }))} options={entityOptions} />
            <Input label="Priority" type="number" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: parseInt(e.target.value) }))} min={1} />
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2"><Regex size={14} className="text-purple-500" /><span className="text-sm font-medium">Match Pattern (JavaScript Regex)</span></div>
            <Textarea value={form.match_pattern} onChange={e => setForm(p => ({ ...p, match_pattern: e.target.value }))} rows={3} placeholder="\\b(\\d{4,8})\\b" className="font-mono text-sm" />
            <p className="text-xs text-gray-500 mt-1">Use capturing groups like (\\d+) to capture parts for replacement.</p>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2"><ArrowRight size={14} className="text-green-500" /><span className="text-sm font-medium">Replace Pattern</span></div>
            <Textarea value={form.replace_pattern} onChange={e => setForm(p => ({ ...p, replace_pattern: e.target.value }))} rows={3} placeholder="{{OTP}}" className="font-mono text-sm" />
            {(form.type === 'content_regex_replace' || form.type === 'content_random_body') && <p className="text-xs text-blue-600 mt-1">Use | to separate multiple random templates</p>}
          </div>

          {/* Quick Templates */}
          {getQuickTemplates(form.type).length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Quick Templates</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {getQuickTemplates(form.type).map((qt, i) => (
                  <button key={i} type="button" onClick={() => setForm(p => ({ ...p, match_pattern: qt.match, replace_pattern: qt.replace, description: qt.desc }))}
                    className={`text-left p-2.5 rounded-lg border text-xs transition-all ${form.match_pattern === qt.match ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className="font-medium text-gray-700">{qt.label}</p>
                    <code className="text-[10px] text-gray-500 block mt-1">{qt.match} → {qt.replace}</code>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Input label="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What this translation does" />
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-blue-600" /><span className="text-sm">Active</span></label>
        </div>
      </Modal>

      {/* Bulk Upload Modal */}
      <Modal isOpen={showBulkModal} onClose={() => setShowBulkModal(false)} title="Bulk Upload Translations" size="lg"
        footer={<div className="flex gap-3 justify-end w-full">
          <Button variant="secondary" onClick={() => setShowBulkModal(false)} disabled={bulkUploading}>Cancel</Button>
          <Button onClick={handleBulkUpload} disabled={bulkUploading || !bulkFile}>{bulkUploading ? 'Uploading...' : `Import ${bulkMode === 'pool' ? 'as Pool' : 'CSV Rows'}`}</Button>
        </div>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Mode" value={bulkMode} onChange={e => { setBulkMode(e.target.value as any); setBulkType(e.target.value === 'pool' ? 'content_random_body' : 'content_text_replacement'); }} options={[
              { value: 'pool', label: 'Pool (1 rule with pipe-separated values)' },
              { value: 'csv', label: 'CSV (1 rule per row)' },
            ]} />
            <Select label="Type" value={bulkType} onChange={e => setBulkType(e.target.value as TranslationType)} options={
              bulkMode === 'pool'
                ? [{ value: 'content_random_body', label: 'Random Content Pool' }, { value: 'sender_id_masking', label: 'SID Pool' }]
                : Object.entries(typeLabels).map(([k, v]) => ({ value: k, label: v.label }))
            } />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Apply To" value={bulkApplyTo} onChange={e => { setBulkApplyTo(e.target.value as any); setBulkEntityId('all'); }} options={[
              { value: 'client', label: 'Client Only' },
              { value: 'supplier', label: 'Supplier Only' },
              { value: 'both', label: 'Global (All)' },
            ]} />
            {bulkApplyTo !== 'both' && (
              <Select label="Entity" value={bulkEntityId} onChange={e => setBulkEntityId(e.target.value)} options={[
                { value: 'all', label: bulkApplyTo === 'client' ? 'All Clients' : 'All Suppliers' },
                ...(bulkApplyTo === 'client' ? clients : suppliers).map(e => ({ value: String(e.id), label: e.company_name || (bulkApplyTo === 'client' ? (e as any).client_code : (e as any).supplier_code) })),
              ]} />
            )}
          </div>

          {/* File Input */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer"
            onClick={() => document.getElementById('bulk-file-input')?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-blue-400'); }}
            onDragLeave={e => { e.currentTarget.classList.remove('border-blue-400'); }}
            onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-400'); const f = e.dataTransfer.files[0]; if (f) parseBulkFile(f); }}>
            <input id="bulk-file-input" type="file" accept=".csv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parseBulkFile(f); }} />
            {bulkFile ? (
              <div>
                <Upload size={28} className="mx-auto text-blue-500 mb-2" />
                <p className="text-sm font-medium text-gray-700">{bulkFile.name}</p>
                <p className="text-xs text-gray-500">{(bulkFile.size / 1024).toFixed(1)} KB · {bulkPreview.length} {bulkMode === 'pool' ? 'value(s)' : 'row(s)'}</p>
              </div>
            ) : (
              <div>
                <Upload size={28} className="mx-auto text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-600">Drop a CSV or TXT file here, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">
                  {bulkMode === 'pool' ? 'One value per line — all combined into a pipe-separated pool' : 'CSV with columns: name,type,pattern,replacement,priority,description'}
                </p>
              </div>
            )}
          </div>

          {/* Preview */}
          {bulkPreview.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Preview ({bulkPreview.length} {bulkMode === 'pool' ? 'values' : 'rows'})</p>
              <div className="max-h-40 overflow-y-auto border rounded-lg bg-gray-50 p-3">
                {bulkPreview.slice(0, 20).map((line, i) => (
                  <div key={i} className="text-xs font-mono text-gray-700 py-0.5 border-b border-gray-100 last:border-0">
                    {bulkMode === 'pool' ? (
                      <span>{i + 1}. {line}</span>
                    ) : (
                      <span className="text-gray-400">#{i + 1}</span>
                    )}{' '}
                    <span>{line}</span>
                  </div>
                ))}
                {bulkPreview.length > 20 && <p className="text-xs text-gray-400 mt-1">...and {bulkPreview.length - 20} more</p>}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Test Result Modal */}
      <Modal isOpen={showTestModal} onClose={() => setShowTestModal(false)} title="Translation Test Result" size="lg">
        {testResult && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 border rounded-lg">
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Input</p>
              <code className="text-sm text-gray-800 block">{testResult.input}</code>
            </div>
            <div className="flex justify-center"><ArrowRight size={24} className="text-blue-500" /></div>
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs font-medium text-green-600 uppercase mb-1">Output</p>
              <code className="text-sm text-green-800 font-semibold block">{testResult.output}</code>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Length: {testResult.input.length} → {testResult.output.length} chars</span>
              <span>{testResult.input === testResult.output ? '⚠ No change' : '✅ Translation applied'}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
