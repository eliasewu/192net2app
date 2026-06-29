import React, { useState } from 'react';
import { Plus, Search, Edit, Trash2, Play, Regex, Phone, Hash, Type, Code2, Shield, Globe, ArrowRight, RefreshCw, Download } from 'lucide-react';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { exportCSV, exportExcel } from '../services/exportService';
import { Table, Pagination } from '../components/UI/Table';
import { Modal } from '../components/UI/Modal';
import { Input, Select, Textarea } from '../components/UI/Input';

// ============================================================
// TYPES OF TRANSLATIONS
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

interface Translation {
  id: string;
  name: string;
  type: TranslationType;
  priority: number;
  apply_to: 'client' | 'supplier' | 'both';
  apply_entity_id: string;      // client_id or supplier_id or 'all'
  match_pattern: string;         // JavaScript regex
  replace_pattern: string;       // Replacement template
  description: string;
  is_active: boolean;
  created_at: string;
  test_input?: string;
  test_output?: string;
}

// Sample translations matching the spec
const defaultTranslations: Translation[] = [
  {
    id: '1', name: 'OTP Extraction - Standard', type: 'content_otp_extract', priority: 1,
    apply_to: 'client', apply_entity_id: 'all',
    match_pattern: '\\b(\\d{4,8})\\b',
    replace_pattern: '{{OTP}}',
    description: 'Replace 4-8 digit OTP codes with placeholder for security',
    is_active: true, created_at: '2024-01-15',
    test_input: 'Your verification code is 123456. Do not share.',
    test_output: 'Your verification code is {{OTP}}. Do not share.',
  },
  {
    id: '2', name: 'OTP with Context', type: 'content_regex_replace', priority: 2,
    apply_to: 'client', apply_entity_id: 'all',
    match_pattern: '\\d{4,8}',
    replace_pattern: 'Your code: {{OTP}}|Verification: {{OTP}}|Enter {{OTP}} to continue|Code {{OTP}} expires in 5 min',
    description: 'Random OTP message templates for anti-spam detection',
    is_active: true, created_at: '2024-01-20',
    test_input: '789012 is your login code',
    test_output: 'Enter 789012 to continue',
  },
  {
    id: '3', name: 'TechCorp SID Masking', type: 'sender_id_masking', priority: 1,
    apply_to: 'client', apply_entity_id: '1',
    match_pattern: 'TECHCORP',
    replace_pattern: 'TC-MSG',
    description: 'Mask TechCorp sender ID for specific routes',
    is_active: true, created_at: '2024-01-15',
    test_input: 'TECHCORP',
    test_output: 'TC-MSG',
  },
  {
    id: '4', name: 'E.164 Format UK Numbers', type: 'destination_format', priority: 1,
    apply_to: 'supplier', apply_entity_id: 'all',
    match_pattern: '^(\\+44|0044|44)',
    replace_pattern: '+44',
    description: 'Convert all UK prefix variations to standard +44 E.164 format',
    is_active: true, created_at: '2024-02-01',
    test_input: '00447900123456',
    test_output: '+447900123456',
  },
  {
    id: '5', name: 'Leading Zero Removal', type: 'destination_prefix', priority: 2,
    apply_to: 'supplier', apply_entity_id: '2',
    match_pattern: '^0(?=[1-9])',
    replace_pattern: '',
    description: 'Remove leading zero from local numbers before sending to supplier',
    is_active: true, created_at: '2024-02-05',
    test_input: '07900123456',
    test_output: '7900123456',
  },
  {
    id: '6', name: 'Strip Emoji', type: 'content_strip_emoji', priority: 5,
    apply_to: 'both', apply_entity_id: 'all',
    match_pattern: '[\\u{1F600}-\\u{1F64F}\\u{1F300}-\\u{1F5FF}\\u{1F680}-\\u{1F6FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]',
    replace_pattern: '',
    description: 'Remove all emoji characters from message body',
    is_active: true, created_at: '2024-03-01',
    test_input: 'Hello 😀 how are you? 🎉',
    test_output: 'Hello  how are you? ',
  },
  {
    id: '7', name: 'Smart Quotes Fix', type: 'content_smart_quotes', priority: 3,
    apply_to: 'both', apply_entity_id: 'all',
    match_pattern: '[\u2018\u2019\u201C\u201D]',
    replace_pattern: "'",
    description: 'Replace smart/curly quotes with straight quotes for SMPP compatibility',
    is_active: true, created_at: '2024-03-05',
    test_input: 'It\u2019s a \u201Ctest\u201D message',
    test_output: "It's a 'test' message",
  },
  {
    id: '8', name: 'Remove Plus Sign', type: 'destination_prefix', priority: 3,
    apply_to: 'supplier', apply_entity_id: '3',
    match_pattern: '^\\+',
    replace_pattern: '00',
    description: 'Convert + prefix to 00 for some supplier requirements',
    is_active: true, created_at: '2024-02-10',
    test_input: '+1234567890',
    test_output: '001234567890',
  },
  {
    id: '9', name: 'URL Shortener', type: 'content_url_shorten', priority: 4,
    apply_to: 'client', apply_entity_id: 'all',
    match_pattern: 'https?://[^\\s]+',
    replace_pattern: 'bit.ly/{{SHORT}}',
    description: 'Shorten URLs in message body to save characters',
    is_active: false, created_at: '2024-03-10',
    test_input: 'Visit https://example.com/long/path/page for details',
    test_output: 'Visit bit.ly/x9F2a for details',
  },
  {
    id: '10', name: 'Accent Removal', type: 'content_accent_remove', priority: 5,
    apply_to: 'both', apply_entity_id: 'all',
    match_pattern: '[àáâãäåèéêëìíîïòóôõöùúûüýÿñç]',
    replace_pattern: '',
    description: 'Remove diacritics/accent marks for GSM compatibility',
    is_active: false, created_at: '2024-03-12',
    test_input: 'crème brûlée café',
    test_output: 'creme brulee cafe',
  },
];

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
  const [translations, setTranslations] = useState<Translation[]>(defaultTranslations);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Translation | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testResult, setTestResult] = useState<{ input: string; output: string } | null>(null);
  const [selectedType, setSelectedType] = useState<TranslationType>('content_otp_extract');

  const [form, setForm] = useState({
    name: '', type: 'content_otp_extract' as TranslationType, priority: 1,
    apply_to: 'client' as 'client' | 'supplier' | 'both', apply_entity_id: 'all',
    match_pattern: '', replace_pattern: '', description: '', is_active: true,
  });

  const itemsPerPage = 10;
  const filtered = translations.filter(t => {
    const ms = t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
    const mt = typeFilter === 'all' || t.type === typeFilter;
    return ms && mt;
  });
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
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

  const openModal = (t?: Translation) => {
    if (t) {
      setEditing(t);
      setForm({ name: t.name, type: t.type, priority: t.priority, apply_to: t.apply_to, apply_entity_id: t.apply_entity_id, match_pattern: t.match_pattern, replace_pattern: t.replace_pattern, description: t.description, is_active: t.is_active });
    } else {
      setEditing(null);
      setForm({ name: '', type: selectedType, priority: translations.length + 1, apply_to: 'client', apply_entity_id: 'all', match_pattern: '', replace_pattern: '', description: '', is_active: true });
    }
    setShowModal(true);
  };

  const handleSave = () => {
    if (editing) {
      setTranslations(prev => prev.map(t => t.id === editing.id ? { ...t, ...form } : t));
    } else {
      setTranslations(prev => [{ ...form, id: Date.now().toString(), created_at: new Date().toISOString(), test_input: undefined, test_output: undefined }, ...prev]);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => setTranslations(prev => prev.filter(t => t.id !== id));

  const handleTest = (t: Translation) => {
    const testInput = t.test_input || prompt('Enter test input:') || '';
    const output = applyTranslation(testInput, t.match_pattern, t.replace_pattern, t.type);
    setTranslations(prev => prev.map(x => x.id === t.id ? { ...x, test_input: testInput, test_output: output } : x));
    setTestResult({ input: testInput, output });
    setShowTestModal(true);
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
          { label: '4-8 Digit OTP', match: '\\b(\\d{4,8})\\b', replace: '{{OTP}}', desc: 'Replace any 4-8 digit code with OTP placeholder' },
          { label: 'OTP with prefix', match: 'is\\s+(\\d{4,8})', replace: 'is {{OTP}}', desc: 'Extract OTP after "is"' },
          { label: 'Code pattern', match: 'code[:\\s]*(\\d{4,8})', replace: 'code: {{OTP}}', desc: 'Extract after "code:"' },
        ];
      case 'content_regex_replace':
        return [
          { label: 'Random OTP Templates', match: '\\d{4,8}', replace: 'Your code: {{OTP}}|Verification: {{OTP}}|Enter {{OTP}} to continue|Code {{OTP}} expires in 5 min', desc: 'Multiple templates separated by |' },
        ];
      case 'destination_format':
        return [
          { label: 'E.164 Format', match: '^(\\+44|0044|44)', replace: '+44', desc: 'Standardize UK numbers' },
          { label: 'Add Plus', match: '^(\\d{10,})', replace: '+$1', desc: 'Add + to international numbers' },
        ];
      case 'destination_prefix':
        return [
          { label: 'Strip leading 0', match: '^0(?=[1-9])', replace: '', desc: 'Remove leading zero' },
          { label: 'Add country code', match: '^(\\d{10})', replace: '1$1', desc: 'Add +1 to 10-digit numbers' },
          { label: 'Remove +', match: '^\\+', replace: '00', desc: 'Replace + with 00' },
          { label: 'Add +', match: '^(\\d+)', replace: '+$1', desc: 'Add + prefix' },
        ];
      case 'sender_id_masking':
        return [
          { label: 'Alpha to Numeric', match: 'COMPANY', replace: '12345', desc: 'Convert alpha SID to numeric' },
          { label: 'Numeric to Alpha', match: '12345', replace: 'BRAND', desc: 'Convert numeric to alpha SID' },
          { label: 'Local Short Code', match: '.*', replace: 'SHORT', desc: 'Mask any SID as short code' },
        ];
      default:
        return [];
    }
  };

  const columns = [
    { key: 'name', header: 'Translation', render: (t: Translation) => <div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${t.is_active ? 'bg-blue-50' : 'bg-gray-50'}`}>{typeLabels[t.type]?.icon || <Code2 size={14} />}</div><div><p className="font-medium text-gray-800">{t.name}</p><p className="text-xs text-gray-500">{t.description}</p></div></div> },
    { key: 'type', header: 'Type', render: (t: Translation) => <div><Badge variant={typeLabels[t.type]?.color || 'default'} size="sm">{typeLabels[t.type]?.label || t.type}</Badge><p className="text-[10px] text-gray-400 mt-0.5">{typeCategoryLabels[t.type]}</p></div> },
    { key: 'pattern', header: 'Pattern', render: (t: Translation) => <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono max-w-[150px] truncate block">{t.match_pattern}</code> },
    { key: 'replace', header: 'Replace', render: (t: Translation) => <code className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-mono max-w-[120px] truncate block">{t.replace_pattern}</code> },
    { key: 'apply', header: 'Apply To', render: (t: Translation) => <Badge variant={t.apply_to === 'client' ? 'info' : t.apply_to === 'supplier' ? 'purple' : 'warning'}>{t.apply_to === 'both' ? 'All' : t.apply_to}</Badge> },
    { key: 'priority', header: 'Pri', align: 'center' as const, render: (t: Translation) => <span className="font-bold text-gray-700">{t.priority}</span> },
    { key: 'active', header: 'Status', render: (t: Translation) => <Badge variant={t.is_active ? 'success' : 'danger'} dot>{t.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: '', render: (t: Translation) => <div className="flex gap-1"><button onClick={() => handleTest(t)} className="p-1.5 rounded hover:bg-gray-100" title="Test"><Play size={14} className="text-green-500" /></button><button onClick={() => openModal(t)} className="p-1.5 rounded hover:bg-gray-100"><Edit size={14} className="text-gray-500" /></button><button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-gray-100"><Trash2 size={14} className="text-red-500" /></button></div> },
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
          <div className="flex gap-3"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>{editing ? 'Update' : 'Create'}</Button></div>
        </div>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="OTP Extraction - Standard" required />
            <Select label="Type *" value={form.type} onChange={e => { setForm(p => ({ ...p, type: e.target.value as TranslationType })); setSelectedType(e.target.value as TranslationType); }} options={Object.entries(typeLabels).map(([k, v]) => ({ value: k, label: v.label }))} required />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select label="Apply To *" value={form.apply_to} onChange={e => setForm(p => ({ ...p, apply_to: e.target.value as 'client' | 'supplier' | 'both' }))} options={[{ value: 'client', label: 'Client Only' }, { value: 'supplier', label: 'Supplier Only' }, { value: 'both', label: 'Both' }]} />
            <Select label="Entity" value={form.apply_entity_id} onChange={e => setForm(p => ({ ...p, apply_entity_id: e.target.value }))} options={[{ value: 'all', label: 'All' }, { value: '1', label: 'TechCorp Global' }, { value: '2', label: 'MegaBank Ltd' }]} />
            <Input label="Priority" type="number" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: parseInt(e.target.value) }))} min={1} />
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2"><Regex size={14} className="text-purple-500" /><span className="text-sm font-medium">Match Pattern (JavaScript Regex)</span></div>
            <Textarea value={form.match_pattern} onChange={e => setForm(p => ({ ...p, match_pattern: e.target.value }))} rows={3} placeholder="\b(\d{4,8})\b" className="font-mono text-sm" />
            <p className="text-xs text-gray-500 mt-1">Use capturing groups like (\d+) to capture parts for replacement.</p>
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
