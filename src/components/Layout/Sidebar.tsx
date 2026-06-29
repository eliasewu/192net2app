import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Building2, GitBranch, DollarSign, CreditCard,
  MessageSquare, BarChart3, Megaphone, Radio, FlaskConical, Languages,
  Bell, UserCog, Settings, ChevronDown, Smartphone,
  Mic, Globe, FileText, Database, Plug, Send, Server, Shield, MapPin, Mail, Wifi, Hash
} from 'lucide-react';

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: MenuItem[];
}

const menuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
  {
    label: 'Clients',
    icon: <Users size={20} />,
    children: [
      { label: 'All Clients', icon: <Users size={16} />, path: '/clients' },
      { label: 'Add Client', icon: <Users size={16} />, path: '/clients/add' },
      { label: 'Client Rates', icon: <DollarSign size={16} />, path: '/clients/rates' },
    ]
  },
  {
    label: 'Suppliers',
    icon: <Building2 size={20} />,
    children: [
      { label: 'All Suppliers', icon: <Building2 size={16} />, path: '/suppliers' },
      { label: 'Add Supplier', icon: <Building2 size={16} />, path: '/suppliers/add' },
      { label: 'Supplier Rates', icon: <DollarSign size={16} />, path: '/suppliers/rates' },
      { label: 'API Connectors', icon: <Plug size={16} />, path: '/suppliers/api-connectors' },
      { label: 'OTT Devices', icon: <Smartphone size={16} />, path: '/suppliers/ott-devices' },
      { label: 'Voice OTP', icon: <Mic size={16} />, path: '/suppliers/voice-otp' },
      { label: 'Social API (WA/TG)', icon: <Globe size={16} />, path: '/suppliers/social-api' },
      { label: 'Business API Connect', icon: <Globe size={16} />, path: '/business-api-connect' },
    ]
  },
  {
    label: 'Routing',
    icon: <GitBranch size={20} />,
    children: [
      { label: 'Trunks', icon: <GitBranch size={16} />, path: '/routing/trunks' },
      { label: 'Routes', icon: <GitBranch size={16} />, path: '/routing/routes' },
      { label: 'Route Maps', icon: <GitBranch size={16} />, path: '/routing/maps' },
      { label: 'Route Plans', icon: <GitBranch size={16} />, path: '/routing/plans' },
    ]
  },
  {
    label: 'Rates',
    icon: <DollarSign size={20} />,
    children: [
      { label: 'Rate Management', icon: <DollarSign size={16} />, path: '/rates' },
      { label: 'Bulk Upload', icon: <FileText size={16} />, path: '/rates/upload' },
      { label: 'MCC/MNC Database', icon: <Database size={16} />, path: '/rates/mccmnc' },
    ]
  },
  {
    label: 'Billing',
    icon: <CreditCard size={20} />,
    children: [
      { label: 'Overview', icon: <CreditCard size={16} />, path: '/billing' },
      { label: 'Invoices', icon: <FileText size={16} />, path: '/billing/invoices' },
      { label: 'Payments', icon: <CreditCard size={16} />, path: '/billing/payments' },
    ]
  },
  { label: 'SMS Logs', icon: <MessageSquare size={20} />, path: '/sms-logs' },
  { label: 'SMS Inbox (MO)', icon: <MessageSquare size={20} />, path: '/sms-inbox' },
  {
    label: 'Reports',
    icon: <BarChart3 size={20} />,
    children: [
      { label: 'Real-time', icon: <BarChart3 size={16} />, path: '/reports/realtime' },
      { label: 'Hourly', icon: <BarChart3 size={16} />, path: '/reports/hourly' },
      { label: 'Daily', icon: <BarChart3 size={16} />, path: '/reports/daily' },
      { label: 'Monthly', icon: <BarChart3 size={16} />, path: '/reports/monthly' },
    ]
  },
  { label: 'Campaigns', icon: <Megaphone size={20} />, path: '/campaigns' },
  { label: 'Bind Status', icon: <Radio size={20} />, path: '/bind-status' },
  { label: 'Number Validation', icon: <Shield size={20} />, path: '/number-validation' },
  { label: 'IP List', icon: <Wifi size={20} />, path: '/ip-list' },
  {
    label: 'Email',
    icon: <Mail size={20} />,
    children: [
      { label: 'SMTP Configuration', icon: <Server size={16} />, path: '/suppliers/email/smtp' },
      { label: 'Email Suppliers', icon: <Mail size={16} />, path: '/suppliers/email' },
    ]
  },
  {
    label: 'Testing',
    icon: <FlaskConical size={20} />,
    children: [
      { label: 'Test SMS', icon: <Send size={16} />, path: '/testing/sms' },
      { label: 'Test SMPP Bind', icon: <Radio size={16} />, path: '/testing/smpp' },
      { label: 'Test HTTP API', icon: <Globe size={16} />, path: '/testing/http' },
    ]
  },
  { label: 'Translations', icon: <Languages size={20} />, path: '/translations' },
  {
    label: 'Notifications',
    icon: <Bell size={20} />,
    children: [
      { label: 'Alerts', icon: <Bell size={16} />, path: '/notifications/alerts' },
      { label: 'Email Templates', icon: <FileText size={16} />, path: '/notifications/templates' },
      { label: 'Teams Integration', icon: <MessageSquare size={16} />, path: '/notifications/teams' },
      { label: 'Slack Integration', icon: <Hash size={16} />, path: '/notifications/slack' },
    ]
  },
  {
    label: 'Users',
    icon: <UserCog size={20} />,
    children: [
      { label: 'User Management', icon: <UserCog size={16} />, path: '/users' },
      { label: 'Roles & Permissions', icon: <UserCog size={16} />, path: '/users/roles' },
    ]
  },
  {
    label: 'System',
    icon: <Settings size={20} />,
    children: [
      { label: 'Platform Settings', icon: <Settings size={16} />, path: '/system/settings' },
      { label: 'License', icon: <Settings size={16} />, path: '/system/license' },
      { label: 'Database', icon: <Database size={16} />, path: '/system/database' },
      { label: 'Backup', icon: <Settings size={16} />, path: '/system/backup' },
      { label: 'Asterisk / SIP', icon: <Server size={16} />, path: '/system/asterisk' },
      { label: 'Server Destinations', icon: <MapPin size={16} />, path: '/system/asterisk-destinations' },
    ]
  },
];

/**
 * Animated submenu wrapper — measures content height and transitions
 * max-height so expand/collapse feels smooth instead of snapping.
 */
const AnimatedSubmenu: React.FC<{
  isOpen: boolean;
  children: React.ReactNode;
}> = ({ isOpen, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen) {
      // Measure the natural height, then switch to auto once fully open
      const el = ref.current;
      if (el) setHeight(el.scrollHeight);
      const t = setTimeout(() => setHeight('auto'), 220);
      return () => { clearTimeout(t); cancelAnimationFrame(rafRef.current); };
    } else {
      // Snapshot current height then collapse to 0
      const el = ref.current;
      if (el) setHeight(el.scrollHeight);
      rafRef.current = requestAnimationFrame(() => setHeight(0));
      return () => cancelAnimationFrame(rafRef.current);
    }
  }, [isOpen]);

  return (
    <div
      ref={ref}
      className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
      style={{ maxHeight: height === 'auto' ? '2000px' : height }}
    >
      {children}
    </div>
  );
};

interface SidebarProps {
  isCollapsed: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed }) => {
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<string[]>(['Clients', 'Suppliers', 'Routing']);

  // Auto-expand parent menus whose children contain the active route
  useEffect(() => {
    const parentsToExpand: string[] = [];
    for (const item of menuItems) {
      if (item.children?.some(child => location.pathname === child.path)) {
        parentsToExpand.push(item.label);
      }
    }
    if (parentsToExpand.length) {
      setExpandedItems(prev => Array.from(new Set([...prev, ...parentsToExpand])));
    }
  }, [location.pathname]);

  const toggleExpand = (label: string) => {
    setExpandedItems(prev =>
      prev.includes(label) ? prev.filter(item => item !== label) : [...prev, label]
    );
  };

  const isActive = (path?: string) => path && location.pathname === path;
  const hasActiveChild = (children?: MenuItem[]) =>
    children?.some(child => location.pathname === child.path);

  const renderMenuItem = (item: MenuItem, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.label);
    const parentActive = hasActiveChild(item.children);

    if (hasChildren) {
      return (
        <div key={item.label}>
          <button
            onClick={() => toggleExpand(item.label)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 group
              ${parentActive ? 'bg-blue-600/15 text-blue-200' : 'text-gray-300 hover:bg-white/5 hover:text-white'}
              ${isCollapsed ? 'justify-center px-2' : ''}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={`flex-shrink-0 transition-colors duration-200 ${parentActive ? 'text-blue-400' : 'text-gray-400 group-hover:text-gray-200'}`}>
                {item.icon}
              </span>
              {!isCollapsed && <span className="font-medium text-sm truncate">{item.label}</span>}
            </div>
            {!isCollapsed && (
              <span className={`flex-shrink-0 transition-transform duration-200 text-gray-500 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                <ChevronDown size={16} />
              </span>
            )}
          </button>
          {!isCollapsed && (
            <AnimatedSubmenu isOpen={isExpanded}>
              <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-blue-500/20 pl-3">
                {item.children!.map(child => renderMenuItem(child, depth + 1))}
              </div>
            </AnimatedSubmenu>
          )}
        </div>
      );
    }

    const childIsActive = isActive(item.path);

    return (
      <Link
        key={item.path}
        to={item.path!}
        className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150
          ${childIsActive
            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}
          ${isCollapsed ? 'justify-center px-2' : ''}`}
      >
        {/* Active indicator dot */}
        {childIsActive && !isCollapsed && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-400 rounded-r-full" />
        )}
        <span className={`flex-shrink-0 ${childIsActive ? 'text-white' : ''}`}>{item.icon}</span>
        {!isCollapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-[#0f1d3a] border-r border-[#1a3055] shadow-xl shadow-black/20 transition-all duration-300 z-40 overflow-hidden
        ${isCollapsed ? 'w-16' : 'w-64'}`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-[#1a3055] bg-gradient-to-r from-blue-600 to-blue-800">
        {isCollapsed ? (
          <span className="text-2xl">📡</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-2xl">📡</span>
            <span className="text-xl font-bold text-white">NET2APP Hub</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="p-3 space-y-1 h-[calc(100vh-4rem)] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#1a3055_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#1a3055] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-[#243d6a]">
        {menuItems.map(item => renderMenuItem(item))}
      </nav>
    </aside>
  );
};
