import { describe, it, expect } from 'vitest';

// ============================================================
// Pure function extractions from AddSupplier.tsx
// These mirror the component's internal logic.
// ============================================================

// ---- DEFAULT FORM ----
const defaultForm = (): SupplierFormData => ({
  supplier_code: '',
  company_name: '',
  contact_person: '',
  email: '',
  phone: '',
  is_inbound: false,
  connection_type: 'smpp',
  smpp_host: '',
  smpp_port: 2775,
  smpp_username: '',
  smpp_password: '',
  system_id: '',
  smpp_version: 'auto' as 'auto' | '3.3' | '3.4' | '5.0',
  api_url: '',
  api_key: '',
  api_method: 'POST' as 'GET' | 'POST',
  balance: 0,
  credit_limit: 0,
  currency: 'EUR' as 'EUR' | 'USD' | 'GBP',
  status: 'active',
  bind_status: 'unbound',
  consecutive_failures: 0,
  force_dlr: false,
  force_dlr_timeout_mode: 'fixed' as 'fixed' | 'random_0_5' | 'random_0_10',
  dlr_timeout: 150,
});

type SupplierFormData = {
  supplier_code: string; company_name: string; contact_person: string;
  email: string; phone: string;
  is_inbound: boolean;
  connection_type: string;
  smpp_host: string; smpp_port: number; smpp_username: string; smpp_password: string;
  system_id: string;
  smpp_version: 'auto' | '3.3' | '3.4' | '5.0';
  api_url: string; api_key: string; api_method: 'GET' | 'POST';
  balance: number; credit_limit: number;
  currency: 'EUR' | 'USD' | 'GBP';
  status: string; bind_status: string; consecutive_failures: number;
  force_dlr: boolean;
  force_dlr_timeout_mode: 'fixed' | 'random_0_5' | 'random_0_10';
  dlr_timeout: number;
};

// ---- VALIDATE ----
const validate = (formData: SupplierFormData): { errors: Record<string, string>; valid: boolean } => {
  const newErrors: Record<string, string> = {};

  if (!formData.supplier_code) newErrors.supplier_code = 'Supplier code is required';
  if (!formData.company_name) newErrors.company_name = 'Company name is required';
  if (!formData.email) newErrors.email = 'Email is required';

  if (formData.connection_type === 'smpp') {
    if (!formData.is_inbound && !formData.smpp_host) newErrors.smpp_host = 'SMPP host is required';
    if (!formData.smpp_username) newErrors.smpp_username = 'SMPP username is required';
  }

  if (formData.connection_type === 'http') {
    if (!formData.api_url) newErrors.api_url = 'API URL is required';
  }

  if (formData.connection_type === 'email') {
    if (!formData.smpp_host) newErrors.smpp_host = 'SMTP host is required';
    if (!formData.smpp_username) newErrors.smpp_username = 'SMTP username is required';
  }

  return { errors: newErrors, valid: Object.keys(newErrors).length === 0 };
};

// ---- GENERATE CODE ----
const generateCode = (): string => {
  return 'SUP' + String(Math.floor(Math.random() * 9000) + 1000);
};

// ---- GENERATE PASSWORD ----
const generatePassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// ---- UPDATE FIELD ----
const updateField = (
  formData: SupplierFormData,
  errors: Record<string, string>,
  field: string,
  value: any
): { formData: SupplierFormData; errors: Record<string, string> } => {
  const newForm = { ...formData, [field]: value };
  const newErrors = { ...errors };
  if (newErrors[field]) {
    newErrors[field] = '';
  }
  return { formData: newForm, errors: newErrors };
};

// ---- MAP EXISTING TO FORM ----
const mapExistingToForm = (existing: Partial<SupplierFormData> | null): SupplierFormData => {
  const def = defaultForm();
  if (!existing || !existing.supplier_code) return def;
  return {
    supplier_code: existing.supplier_code ?? def.supplier_code,
    company_name: existing.company_name ?? def.company_name,
    contact_person: existing.contact_person ?? def.contact_person,
    email: existing.email ?? def.email,
    phone: existing.phone ?? def.phone,
    is_inbound: existing.is_inbound ?? def.is_inbound,
    connection_type: existing.connection_type ?? def.connection_type,
    smpp_host: existing.smpp_host ?? def.smpp_host,
    smpp_port: existing.smpp_port ?? def.smpp_port,
    smpp_username: existing.smpp_username ?? def.smpp_username,
    smpp_password: existing.smpp_password ?? def.smpp_password,
    system_id: existing.system_id ?? def.system_id,
    smpp_version: existing.smpp_version ?? def.smpp_version,
    api_url: existing.api_url ?? def.api_url,
    api_key: existing.api_key ?? def.api_key,
    api_method: existing.api_method ?? def.api_method,
    balance: existing.balance ?? def.balance,
    credit_limit: existing.credit_limit ?? def.credit_limit,
    currency: existing.currency ?? def.currency,
    status: existing.status ?? def.status,
    bind_status: existing.bind_status ?? def.bind_status,
    consecutive_failures: existing.consecutive_failures ?? def.consecutive_failures,
    force_dlr: existing.force_dlr ?? def.force_dlr,
    force_dlr_timeout_mode: existing.force_dlr_timeout_mode || def.force_dlr_timeout_mode,
    dlr_timeout: existing.dlr_timeout || def.dlr_timeout,
  };
};

// ---- SMPP VERSION OPTIONS ----
const SMPP_VERSION_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: '5.0', label: 'SMPP v5.0' },
  { value: '3.4', label: 'SMPP v3.4' },
  { value: '3.3', label: 'SMPP v3.3' },
];

// ---- CONNECTION TYPES ----
const CONNECTION_TYPES = [
  'smpp', 'http', 'email', 'ott_whatsapp', 'ott_telegram',
  'voice_otp', 'local_bypass', 'rcs', 'flash_sms',
];

// ============================================================
// TESTS
// ============================================================

describe('AddSupplier - defaultForm', () => {
  it('has empty supplier_code, company_name, email', () => {
    const f = defaultForm();
    expect(f.supplier_code).toBe('');
    expect(f.company_name).toBe('');
    expect(f.email).toBe('');
  });

  it('has smpp as default connection_type', () => {
    expect(defaultForm().connection_type).toBe('smpp');
  });

  it('has smpp_version defaulting to auto', () => {
    expect(defaultForm().smpp_version).toBe('auto');
  });

  it('has smpp_port default of 2775', () => {
    expect(defaultForm().smpp_port).toBe(2775);
  });

  it('has balance and credit_limit default to 0', () => {
    const f = defaultForm();
    expect(f.balance).toBe(0);
    expect(f.credit_limit).toBe(0);
  });

  it('has currency default to EUR', () => {
    expect(defaultForm().currency).toBe('EUR');
  });

  it('has status default to active and bind_status to unbound', () => {
    const f = defaultForm();
    expect(f.status).toBe('active');
    expect(f.bind_status).toBe('unbound');
  });

  it('has force_dlr default to false', () => {
    expect(defaultForm().force_dlr).toBe(false);
  });

  it('has force_dlr_timeout_mode default to fixed', () => {
    expect(defaultForm().force_dlr_timeout_mode).toBe('fixed');
  });

  it('has dlr_timeout default to 150', () => {
    expect(defaultForm().dlr_timeout).toBe(150);
  });

  it('has api_method default to POST', () => {
    expect(defaultForm().api_method).toBe('POST');
  });

  it('has consecutive_failures default to 0', () => {
    expect(defaultForm().consecutive_failures).toBe(0);
  });
});

describe('AddSupplier - validate', () => {
  it('rejects empty form', () => {
    const { errors, valid } = validate(defaultForm());
    expect(valid).toBe(false);
    expect(errors.supplier_code).toBeDefined();
    expect(errors.company_name).toBeDefined();
    expect(errors.email).toBeDefined();
  });

  it('accepts fully filled smpp form', () => {
    const f = {
      ...defaultForm(),
      supplier_code: 'SUP001',
      company_name: 'Test Provider',
      email: 'test@provider.com',
      smpp_host: 'smpp.provider.com',
      smpp_username: 'testuser',
    };
    const { valid } = validate(f);
    expect(valid).toBe(true);
  });

  it('requires supplier_code', () => {
    const f = { ...defaultForm(), company_name: 'A', email: 'a@b.com' };
    const { errors, valid } = validate(f);
    expect(valid).toBe(false);
    expect(errors.supplier_code).toBe('Supplier code is required');
  });

  it('requires company_name', () => {
    const f = { ...defaultForm(), supplier_code: 'SUP001', email: 'a@b.com' };
    const { errors, valid } = validate(f);
    expect(valid).toBe(false);
    expect(errors.company_name).toBe('Company name is required');
  });

  it('requires email', () => {
    const f = { ...defaultForm(), supplier_code: 'SUP001', company_name: 'A' };
    const { errors, valid } = validate(f);
    expect(valid).toBe(false);
    expect(errors.email).toBe('Email is required');
  });

  it('requires smpp_host for smpp outbound connections', () => {
    const f = {
      ...defaultForm(),
      supplier_code: 'SUP001', company_name: 'A', email: 'a@b.com',
      connection_type: 'smpp', is_inbound: false, smpp_host: '',
      smpp_username: 'user',
    };
    const { errors, valid } = validate(f);
    expect(valid).toBe(false);
    expect(errors.smpp_host).toBe('SMPP host is required');
  });

  it('does NOT require smpp_host for smpp inbound connections', () => {
    const f = {
      ...defaultForm(),
      supplier_code: 'SUP001', company_name: 'A', email: 'a@b.com',
      connection_type: 'smpp', is_inbound: true, smpp_host: '',
      smpp_username: 'user',
    };
    const { valid } = validate(f);
    expect(valid).toBe(true);
  });

  it('requires smpp_username for smpp connections', () => {
    const f = {
      ...defaultForm(),
      supplier_code: 'SUP001', company_name: 'A', email: 'a@b.com',
      connection_type: 'smpp', smpp_host: 'host', smpp_username: '',
    };
    const { errors, valid } = validate(f);
    expect(valid).toBe(false);
    expect(errors.smpp_username).toBe('SMPP username is required');
  });

  it('requires api_url for http connections', () => {
    const f = {
      ...defaultForm(),
      supplier_code: 'SUP001', company_name: 'A', email: 'a@b.com',
      connection_type: 'http', api_url: '',
    };
    const { errors, valid } = validate(f);
    expect(valid).toBe(false);
    expect(errors.api_url).toBe('API URL is required');
  });

  it('requires smpp_host for email connections', () => {
    const f = {
      ...defaultForm(),
      supplier_code: 'SUP001', company_name: 'A', email: 'a@b.com',
      connection_type: 'email', smpp_host: '',
    };
    const { errors, valid } = validate(f);
    expect(valid).toBe(false);
    expect(errors.smpp_host).toBe('SMTP host is required');
  });

  it('requires smpp_username for email connections', () => {
    const f = {
      ...defaultForm(),
      supplier_code: 'SUP001', company_name: 'A', email: 'a@b.com',
      connection_type: 'email', smpp_host: 'smtp.host', smpp_username: '',
    };
    const { errors, valid } = validate(f);
    expect(valid).toBe(false);
    expect(errors.smpp_username).toBe('SMTP username is required');
  });

  it('accepts http form with api_url filled', () => {
    const f = {
      ...defaultForm(),
      supplier_code: 'SUP002', company_name: 'B', email: 'b@b.com',
      connection_type: 'http', api_url: 'https://api.example.com/sms',
    };
    const { valid } = validate(f);
    expect(valid).toBe(true);
  });

  it('accepts email form with host and username filled', () => {
    const f = {
      ...defaultForm(),
      supplier_code: 'SUP003', company_name: 'C', email: 'c@c.com',
      connection_type: 'email', smpp_host: 'smtp.test.com', smpp_username: 'test',
    };
    const { valid } = validate(f);
    expect(valid).toBe(true);
  });

  it('returns multiple errors at once', () => {
    const f = { ...defaultForm(), connection_type: 'smpp', is_inbound: false };
    const { errors, valid } = validate(f);
    expect(valid).toBe(false);
    expect(errors.supplier_code).toBeDefined();
    expect(errors.company_name).toBeDefined();
    expect(errors.email).toBeDefined();
    expect(errors.smpp_host).toBeDefined();
    expect(errors.smpp_username).toBeDefined();
  });

  it('does not require smpp host/username for non-smpp/email types', () => {
    const f = {
      ...defaultForm(),
      supplier_code: 'SUP004', company_name: 'D', email: 'd@d.com',
      connection_type: 'ott_whatsapp', smpp_host: '', smpp_username: '',
    };
    const { valid } = validate(f);
    expect(valid).toBe(true);
  });
});

describe('AddSupplier - generateCode', () => {
  it('starts with SUP', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateCode()).toMatch(/^SUP/);
    }
  });

  it('produces 7 characters', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateCode().length).toBe(7);
    }
  });

  it('last 4 chars are digits 1000-9999', () => {
    for (let i = 0; i < 10; i++) {
      const num = parseInt(generateCode().slice(3), 10);
      expect(num).toBeGreaterThanOrEqual(1000);
      expect(num).toBeLessThanOrEqual(9999);
    }
  });


});

describe('AddSupplier - generatePassword', () => {
  it('produces 12 characters', () => {
    for (let i = 0; i < 10; i++) {
      expect(generatePassword().length).toBe(12);
    }
  });

  it('uses only allowed charset', () => {
    const allowed = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    for (let i = 0; i < 10; i++) {
      const pw = generatePassword();
      for (const ch of pw) {
        expect(allowed).toContain(ch);
      }
    }
  });
});

describe('AddSupplier - updateField', () => {
  it('updates a field value', () => {
    const f = defaultForm();
    const { formData } = updateField(f, {}, 'company_name', 'NewCo');
    expect(formData.company_name).toBe('NewCo');
  });

  it('does not mutate other fields', () => {
    const f = defaultForm();
    const { formData } = updateField(f, {}, 'company_name', 'NewCo');
    expect(formData.supplier_code).toBe('');
    expect(formData.email).toBe('');
    expect(formData.smpp_version).toBe('auto');
  });

  it('clears error for updated field', () => {
    const errors = { company_name: 'Required!' };
    const { errors: newErrors } = updateField(defaultForm(), errors, 'company_name', 'X');
    expect(newErrors.company_name).toBe('');
  });

  it('preserves errors for other fields', () => {
    const errors = { company_name: 'Required!', email: 'Required!' };
    const { errors: newErrors } = updateField(defaultForm(), errors, 'company_name', 'X');
    expect(newErrors.company_name).toBe('');
    expect(newErrors.email).toBe('Required!');
  });

  it('updates smpp_version field', () => {
    const f = defaultForm();
    const { formData } = updateField(f, {}, 'smpp_version', '5.0');
    expect(formData.smpp_version).toBe('5.0');
  });

  it('updates is_inbound field', () => {
    const f = defaultForm();
    const { formData } = updateField(f, {}, 'is_inbound', true);
    expect(formData.is_inbound).toBe(true);
  });

  it('updates connection_type field', () => {
    const f = defaultForm();
    const { formData } = updateField(f, {}, 'connection_type', 'http');
    expect(formData.connection_type).toBe('http');
  });
});

describe('AddSupplier - mapExistingToForm', () => {
  it('returns default form when null', () => {
    const result = mapExistingToForm(null);
    expect(result.supplier_code).toBe('');
    expect(result.smpp_version).toBe('auto');
  });

  it('returns default form when no supplier_code', () => {
    const result = mapExistingToForm({ company_name: 'SomeCo' });
    expect(result.supplier_code).toBe('');
    expect(result.company_name).toBe('');
  });

  it('maps all fields from existing supplier', () => {
    const existing: Partial<SupplierFormData> = {
      supplier_code: 'SUP9999',
      company_name: 'Test Provider',
      contact_person: 'John',
      email: 'john@test.com',
      phone: '+123',
      is_inbound: true,
      connection_type: 'smpp',
      smpp_host: '10.0.0.1',
      smpp_port: 3010,
      smpp_username: 'smppuser',
      smpp_password: 'secret',
      system_id: 'SYS1',
      smpp_version: '3.4',
      api_url: 'https://api.test.com',
      api_key: 'key123',
      api_method: 'GET',
      balance: 500,
      credit_limit: 2000,
      currency: 'USD',
      status: 'inactive',
      bind_status: 'bound',
      consecutive_failures: 3,
      force_dlr: true,
      force_dlr_timeout_mode: 'random_0_5',
      dlr_timeout: 60,
    };
    const result = mapExistingToForm(existing);
    expect(result.supplier_code).toBe('SUP9999');
    expect(result.company_name).toBe('Test Provider');
    expect(result.contact_person).toBe('John');
    expect(result.email).toBe('john@test.com');
    expect(result.phone).toBe('+123');
    expect(result.is_inbound).toBe(true);
    expect(result.connection_type).toBe('smpp');
    expect(result.smpp_host).toBe('10.0.0.1');
    expect(result.smpp_port).toBe(3010);
    expect(result.smpp_username).toBe('smppuser');
    expect(result.smpp_password).toBe('secret');
    expect(result.system_id).toBe('SYS1');
    expect(result.smpp_version).toBe('3.4');
    expect(result.api_url).toBe('https://api.test.com');
    expect(result.api_key).toBe('key123');
    expect(result.api_method).toBe('GET');
    expect(result.balance).toBe(500);
    expect(result.credit_limit).toBe(2000);
    expect(result.currency).toBe('USD');
    expect(result.status).toBe('inactive');
    expect(result.bind_status).toBe('bound');
    expect(result.consecutive_failures).toBe(3);
    expect(result.force_dlr).toBe(true);
    expect(result.force_dlr_timeout_mode).toBe('random_0_5');
    expect(result.dlr_timeout).toBe(60);
  });

  it('keeps defaults for missing fields', () => {
    const existing: Partial<SupplierFormData> = {
      supplier_code: 'SUP0001',
      company_name: 'Partial',
    };
    const result = mapExistingToForm(existing);
    expect(result.supplier_code).toBe('SUP0001');
    expect(result.company_name).toBe('Partial');
    expect(result.smpp_version).toBe('auto'); // default preserved
    expect(result.balance).toBe(0);
    expect(result.currency).toBe('EUR');
    expect(result.connection_type).toBe('smpp');
    expect(result.is_inbound).toBe(false);
  });

  it('preserves smpp_version from existing', () => {
    const existing = { supplier_code: 'SUP8888', smpp_version: '5.0' as const };
    const result = mapExistingToForm(existing);
    expect(result.smpp_version).toBe('5.0');
  });

  it('defaults smpp_version to auto when missing', () => {
    const existing = { supplier_code: 'SUP7777' };
    const result = mapExistingToForm(existing);
    expect(result.smpp_version).toBe('auto');
  });

  it('handles zero values for balance/credit_limit/consecutive_failures', () => {
    const existing = {
      supplier_code: 'SUP0000',
      balance: 0,
      credit_limit: 0,
      consecutive_failures: 0,
    };
    const result = mapExistingToForm(existing);
    expect(result.balance).toBe(0);
    expect(result.credit_limit).toBe(0);
    expect(result.consecutive_failures).toBe(0);
  });

  it('dlr_timeout of 0 falls back to default 150 due to || semantics', () => {
    const existing = {
      supplier_code: 'SUP0000',
      dlr_timeout: 0,
    };
    const result = mapExistingToForm(existing);
    expect(result.dlr_timeout).toBe(150);
  });
});

describe('AddSupplier - smpp_version options', () => {
  it('has exactly 4 version options', () => {
    expect(SMPP_VERSION_OPTIONS).toHaveLength(4);
  });

  it('includes auto-detect', () => {
    const auto = SMPP_VERSION_OPTIONS.find(o => o.value === 'auto');
    expect(auto).toBeDefined();
    expect(auto!.label).toBe('Auto-detect');
  });

  it('includes v5.0', () => {
    const v5 = SMPP_VERSION_OPTIONS.find(o => o.value === '5.0');
    expect(v5).toBeDefined();
    expect(v5!.label).toBe('SMPP v5.0');
  });

  it('includes v3.4', () => {
    const v34 = SMPP_VERSION_OPTIONS.find(o => o.value === '3.4');
    expect(v34).toBeDefined();
    expect(v34!.label).toBe('SMPP v3.4');
  });

  it('includes v3.3', () => {
    const v33 = SMPP_VERSION_OPTIONS.find(o => o.value === '3.3');
    expect(v33).toBeDefined();
    expect(v33!.label).toBe('SMPP v3.3');
  });

  it('all values are unique', () => {
    const values = SMPP_VERSION_OPTIONS.map(o => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('AddSupplier - connection types', () => {
  it('has all 9 connection types', () => {
    expect(CONNECTION_TYPES).toHaveLength(9);
  });

  it('includes smpp', () => expect(CONNECTION_TYPES).toContain('smpp'));
  it('includes http', () => expect(CONNECTION_TYPES).toContain('http'));
  it('includes email', () => expect(CONNECTION_TYPES).toContain('email'));
  it('includes ott_whatsapp', () => expect(CONNECTION_TYPES).toContain('ott_whatsapp'));
  it('includes ott_telegram', () => expect(CONNECTION_TYPES).toContain('ott_telegram'));
  it('includes voice_otp', () => expect(CONNECTION_TYPES).toContain('voice_otp'));
  it('includes local_bypass', () => expect(CONNECTION_TYPES).toContain('local_bypass'));
  it('includes rcs', () => expect(CONNECTION_TYPES).toContain('rcs'));
  it('includes flash_sms', () => expect(CONNECTION_TYPES).toContain('flash_sms'));
});

describe('AddSupplier - edge cases', () => {
  it('validate clears errors on re-validation', () => {
    const f = { ...defaultForm(), supplier_code: 'SUP001', company_name: 'A', email: 'a@b.com', smpp_host: 'host', smpp_username: 'user' };
    let { valid } = validate(f);
    expect(valid).toBe(true);
    // Change smpp_host to empty
    const f2 = { ...f, smpp_host: '' };
    const result2 = validate(f2);
    expect(result2.valid).toBe(false);
    expect(result2.errors.smpp_host).toBeDefined();
    // Restore - should be valid again
    const result3 = validate(f);
    expect(result3.valid).toBe(true);
  });

  it('updateField clears only the exact field error, not related fields', () => {
    const f = { ...defaultForm(), connection_type: 'smpp', is_inbound: false };
    const init = validate(f);
    const errs = init.errors;
    // Change connection_type from 'smpp' to 'http'
    const { errors: newErr } = updateField(f, errs, 'connection_type', 'http');
    // Only 'connection_type' error is cleared; 'smpp_host' error persists
    expect(newErr.smpp_host).toBe('SMPP host is required');
    // But the new connection_type would trigger validate() again on submit
    // which would produce api_url error instead
  });

  it('smpp_port is numeric', () => {
    const f = defaultForm();
    expect(typeof f.smpp_port).toBe('number');
  });

  it('balance and credit_limit are numeric', () => {
    const f = defaultForm();
    expect(typeof f.balance).toBe('number');
    expect(typeof f.credit_limit).toBe('number');
  });

  it('dlr_timeout is numeric', () => {
    const f = defaultForm();
    expect(typeof f.dlr_timeout).toBe('number');
  });

  it('consecutive_failures is numeric', () => {
    const f = defaultForm();
    expect(typeof f.consecutive_failures).toBe('number');
  });
});
