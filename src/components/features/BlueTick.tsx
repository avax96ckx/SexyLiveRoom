import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BLUE_TICK_STYLES } from '@/types';

interface BlueTickProps {
  tickId?: string;
  size?: number;
  // If true, reads size from app_settings (for global setting)
  useGlobalSize?: boolean;
  // If set, bypasses ALL global settings and uses this size directly (for admin preview)
  forceSize?: number;
}

// Shared global settings cache - fetched once, invalidated when admin saves
let _globalSettings: Record<string, string> | null = null;
let _settingsFetchPromise: Promise<void> | null = null;
let _settingsListeners: Array<() => void> = [];

async function fetchGlobalSettings() {
  if (_globalSettings) return;
  if (_settingsFetchPromise) return _settingsFetchPromise;
  _settingsFetchPromise = supabase.from('app_settings').select('key,value').then(({ data }) => {
    _globalSettings = {};
    (data || []).forEach((r: any) => { _globalSettings![r.key] = r.value; });
    // Notify listeners
    _settingsListeners.forEach(fn => { try { fn(); } catch {} });
  });
  return _settingsFetchPromise;
}

// Called from admin save - forces all BlueTick components to re-render
export function invalidateBlueTickCache() {
  _globalSettings = null;
  _settingsFetchPromise = null;
  _settingsListeners.forEach(fn => { try { fn(); } catch {} });
}

// Export helper to get current global settings (for external use)
export function getGlobalSettings() { return _globalSettings; }

// Exact starburst badge matching reference images - varying spike counts and sharpness
function StarburstBadge({ color, size, spikes = 12, inner = 0.72, gradient2 }: {
  color: string; size: number; spikes?: number; inner?: number; gradient2?: string;
}) {
  const cx = 12, cy = 12, outerR = 10.5, innerR = outerR * inner;
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(3)},${(cy + r * Math.sin(angle)).toFixed(3)}`);
  }
  const pathD = 'M' + pts.join('L') + 'Z';
  const gradId = `sg_${color.replace('#', '')}_${spikes}`;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }}>
      <defs>
        {gradient2 ? (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={gradient2} />
          </linearGradient>
        ) : null}
      </defs>
      <path d={pathD} fill={gradient2 ? `url(#${gradId})` : color}
        style={{ filter: `drop-shadow(0 0 2.5px ${color}bb)` }} />
      {/* Checkmark - bold and centered */}
      <path d="M8.2 12.3L10.8 15L15.8 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// Config per tick type
const TICK_CONFIG: Record<string, { spikes: number; inner: number; gradient2?: string }> = {
  blue:     { spikes: 12, inner: 0.76 },
  gold:     { spikes: 10, inner: 0.70 },
  pink:     { spikes: 14, inner: 0.79 },
  green:    { spikes: 8,  inner: 0.68 },
  purple:   { spikes: 12, inner: 0.72 },
  red:      { spikes: 10, inner: 0.65, gradient2: '#FF6B6B' },
  orange:   { spikes: 16, inner: 0.80 },
  silver:   { spikes: 12, inner: 0.77, gradient2: '#E8E8E8' },
  diamond:  { spikes: 8,  inner: 0.60, gradient2: '#00BFFF' },
  rainbow:  { spikes: 14, inner: 0.73, gradient2: '#FF69B4' },
  teal:     { spikes: 10, inner: 0.74, gradient2: '#00CED1' },
  crimson:  { spikes: 12, inner: 0.68, gradient2: '#DC143C' },
  white:    { spikes: 12, inner: 0.74, gradient2: '#BDBDBD' },
  black:    { spikes: 10, inner: 0.70, gradient2: '#616161' },
  cyan:     { spikes: 14, inner: 0.78, gradient2: '#00ACC1' },
  lime:     { spikes: 8,  inner: 0.68, gradient2: '#AEEA00' },
  amber:    { spikes: 12, inner: 0.72, gradient2: '#FF8F00' },
  indigo:   { spikes: 10, inner: 0.71, gradient2: '#283593' },
  rose:     { spikes: 14, inner: 0.77, gradient2: '#C2185B' },
  emerald:  { spikes: 8,  inner: 0.66, gradient2: '#2E7D32' },
  sunset:   { spikes: 12, inner: 0.73, gradient2: '#F7C59F' },
  ocean:    { spikes: 10, inner: 0.74, gradient2: '#0097A7' },
  galaxy:   { spikes: 14, inner: 0.74, gradient2: '#0288D1' },
  fire:     { spikes: 16, inner: 0.72, gradient2: '#FFD740' },
};

export default function BlueTick({ tickId, size = 16, useGlobalSize = false, forceSize }: BlueTickProps) {
  const [effectiveSize, setEffectiveSize] = useState(size);
  const [negMargin, setNegMargin] = useState(0);
  const [position, setPosition] = useState<'left'|'right'|'inside'>('right');
  const [, setRev] = useState(0);

  const applySettingsNow = () => {
    if (_globalSettings) {
      if (_globalSettings.blue_tick_size) {
        const s = parseInt(_globalSettings.blue_tick_size);
        if (s > 0) setEffectiveSize(s);
      }
      if (_globalSettings.blue_tick_offset !== undefined) {
        const offset = parseInt(_globalSettings.blue_tick_offset || '0');
        setNegMargin(offset);
      }
      if (_globalSettings.blue_tick_position) {
        setPosition(_globalSettings.blue_tick_position as 'left'|'right'|'inside');
      }
    }
  };

  useEffect(() => {
    // ALWAYS read global size from DB on mount (applies to ALL BlueTick instances)
    fetchGlobalSettings().then(() => {
      applySettingsNow();
    });

    const cacheListener = () => {
      setRev(r => r + 1);
      if (_globalSettings === null) {
        fetchGlobalSettings().then(applySettingsNow);
      } else {
        applySettingsNow();
      }
    };
    _settingsListeners.push(cacheListener);

    // Listen to global settings-updated DOM event fired by Admin on save
    const domListener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.blue_tick_size) {
        const s = parseInt(detail.blue_tick_size);
        if (s > 0) setEffectiveSize(s);
      }
      if (detail?.blue_tick_offset !== undefined) {
        const offset = parseInt(detail.blue_tick_offset || '0');
        setNegMargin(offset);
      }
      // Update cache immediately with all new settings
      if (detail && typeof detail === 'object') {
        if (!_globalSettings) _globalSettings = {};
        Object.assign(_globalSettings, detail);
      }
      setRev(r => r + 1);
    };
    window.addEventListener('app-settings-updated', domListener);

    // Also listen to localStorage changes (cross-tab settings update)
    const storageListener = (e: StorageEvent) => {
      if (e.key === 'slr_settings_ts') {
        // Settings updated in another context - refresh
        _globalSettings = null;
        _settingsFetchPromise = null;
        fetchGlobalSettings().then(applySettingsNow);
      }
    };
    window.addEventListener('storage', storageListener);

    return () => {
      _settingsListeners = _settingsListeners.filter(l => l !== cacheListener);
      window.removeEventListener('app-settings-updated', domListener);
      window.removeEventListener('storage', storageListener);
    };
  }, []);

  if (!tickId) return null;
  const style = BLUE_TICK_STYLES.find(s => s.id === tickId);
  if (!style) return null;
  const config = TICK_CONFIG[tickId] || { spikes: 12, inner: 0.74 };
  const displaySize = forceSize ? forceSize : (effectiveSize > 0 ? effectiveSize : size);

  // Position-based margin
  let marginStyle: React.CSSProperties = {};
  if (position === 'inside' && negMargin > 0) {
    marginStyle = { marginLeft: `-${Math.min(negMargin, 20)}px` };
  } else if (negMargin > 0) {
    marginStyle = { marginLeft: `-${Math.min(negMargin, 20)}px`, marginRight: `-${Math.min(negMargin, 20)}px` };
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, flexShrink: 0, ...marginStyle }} title={`${style.label} Verified`}>
      <StarburstBadge color={style.color} size={displaySize} spikes={config.spikes} inner={config.inner} gradient2={config.gradient2} />
    </span>
  );
}
