import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import type { IconProps } from '../design-system/icons';
import { getApp } from '../design-system/appRegistry';

export type AppId =
  | 'terminal'
  | 'vps-terminal'
  | 'scanner'
  | 'browser'
  | 'workshop'
  | 'intel'
  | 'cases'
  | 'files'
  | 'editor'
  | 'monitor'
  | 'settings'
  | 'topdesk'
  | 'ip-result'
  | 'url-result'
  | 'domain-result'
  | 'hash-result'
  | 'extension-result'
  | 'cve-result'
  | 'wallet-result'
  | 'email-result'
  | 'decoder'
  | 'defang'
  | 'email-analyzer'
  | 'ioc-extractor'
  | 'bulk-lookup'
  | 'extension-scanner';

export interface WindowInstance {
  id: string;
  appId: AppId;
  title: string;
  icon: React.FC<IconProps>;
  accentColor: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  workspaceId: number;
  pinned: boolean;
  data?: any;
}

interface DesktopState {
  windows: Record<string, WindowInstance>;
  activeWindowId: string | null;
  activeWorkspace: number;
  maxZIndex: number;
  bootComplete: boolean;
}

interface DesktopContextType {
  windows: Record<string, WindowInstance>;
  activeWindowId: string | null;
  activeWorkspace: number;
  bootComplete: boolean;
  openWindow: (config: Partial<WindowInstance> & { appId: AppId; title: string }) => string;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  updateWindowPosition: (id: string, position: { x: number; y: number }) => void;
  updateWindowSize: (id: string, size: { width: number; height: number }) => void;
  moveToWorkspace: (id: string, workspaceId: number) => void;
  switchWorkspace: (workspaceId: number) => void;
  togglePinWindow: (id: string) => void;
  updateWindowData: (id: string, data: any) => void;
  setBootComplete: () => void;
  getVisibleWindows: () => WindowInstance[];
  restoreSavedLayout: () => boolean;
}

const DesktopContext = createContext<DesktopContextType | undefined>(undefined);

import { SearchResultIcon } from '../design-system/icons';
const FALLBACK_DEFAULTS = { icon: SearchResultIcon, accentColor: '#00d9ff', defaultSize: { width: 800, height: 600 } };
const LAYOUT_STORAGE_KEY = 'thamos6-desktop-layout';

interface SavedLayout {
  windows: Array<{
    appId: AppId;
    title: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    workspaceId: number;
    pinned: boolean;
    maximized: boolean;
  }>;
  activeWorkspace: number;
}

function loadSavedLayout(): SavedLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.windows)) return parsed;
  } catch {}
  return null;
}

function saveLayout(state: DesktopState) {
  try {
    const layout: SavedLayout = {
      windows: Object.values(state.windows).map(w => ({
        appId: w.appId,
        title: w.title,
        position: w.position,
        size: w.size,
        workspaceId: w.workspaceId,
        pinned: w.pinned,
        maximized: w.maximized,
      })),
      activeWorkspace: state.activeWorkspace,
    };
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {}
}

export function DesktopProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DesktopState>({
    windows: {},
    activeWindowId: null,
    activeWorkspace: 1,
    maxZIndex: 100,
    bootComplete: false,
  });
  const layoutRestoredRef = useRef(false);

  const openWindow = useCallback((config: Partial<WindowInstance> & { appId: AppId; title: string }): string => {
    const id = config.id || `${config.appId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const registryApp = getApp(config.appId);
    const defaults = registryApp
      ? { icon: registryApp.icon, accentColor: registryApp.accentColor, defaultSize: registryApp.defaultSize }
      : FALLBACK_DEFAULTS;

    const existingWindows = Object.values(state.windows);
    const offset = (existingWindows.length % 5) * 30;

    const newWindow: WindowInstance = {
      id,
      appId: config.appId,
      title: config.title,
      icon: config.icon || defaults.icon,
      accentColor: config.accentColor || defaults.accentColor,
      position: config.position || { x: 100 + offset, y: 80 + offset },
      size: config.size || defaults.defaultSize,
      minimized: false,
      maximized: false,
      zIndex: state.maxZIndex + 1,
      workspaceId: config.workspaceId || state.activeWorkspace,
      pinned: config.pinned || false,
      data: config.data,
    };

    setState(prev => ({
      ...prev,
      windows: { ...prev.windows, [id]: newWindow },
      activeWindowId: id,
      maxZIndex: prev.maxZIndex + 1,
    }));

    return id;
  }, [state.windows, state.maxZIndex, state.activeWorkspace]);

  const closeWindow = useCallback((id: string) => {
    setState(prev => {
      const newWindows = { ...prev.windows };
      delete newWindows[id];

      const newActiveId = prev.activeWindowId === id
        ? Object.keys(newWindows)[Object.keys(newWindows).length - 1] || null
        : prev.activeWindowId;

      return {
        ...prev,
        windows: newWindows,
        activeWindowId: newActiveId,
      };
    });
  }, []);

  const minimizeWindow = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      windows: {
        ...prev.windows,
        [id]: { ...prev.windows[id], minimized: true },
      },
      activeWindowId: prev.activeWindowId === id ? null : prev.activeWindowId,
    }));
  }, []);

  const maximizeWindow = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      windows: {
        ...prev.windows,
        [id]: { ...prev.windows[id], maximized: true, minimized: false },
      },
    }));
  }, []);

  const restoreWindow = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      windows: {
        ...prev.windows,
        [id]: { ...prev.windows[id], maximized: false, minimized: false },
      },
      activeWindowId: id,
    }));
  }, []);

  const focusWindow = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      windows: {
        ...prev.windows,
        [id]: { ...prev.windows[id], zIndex: prev.maxZIndex + 1, minimized: false },
      },
      activeWindowId: id,
      maxZIndex: prev.maxZIndex + 1,
    }));
  }, []);

  const updateWindowPosition = useCallback((id: string, position: { x: number; y: number }) => {
    setState(prev => ({
      ...prev,
      windows: {
        ...prev.windows,
        [id]: { ...prev.windows[id], position },
      },
    }));
  }, []);

  const updateWindowSize = useCallback((id: string, size: { width: number; height: number }) => {
    setState(prev => ({
      ...prev,
      windows: {
        ...prev.windows,
        [id]: { ...prev.windows[id], size },
      },
    }));
  }, []);

  const moveToWorkspace = useCallback((id: string, workspaceId: number) => {
    setState(prev => ({
      ...prev,
      windows: {
        ...prev.windows,
        [id]: { ...prev.windows[id], workspaceId },
      },
    }));
  }, []);

  const switchWorkspace = useCallback((workspaceId: number) => {
    setState(prev => ({
      ...prev,
      activeWorkspace: workspaceId,
    }));
  }, []);

  const togglePinWindow = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      windows: {
        ...prev.windows,
        [id]: { ...prev.windows[id], pinned: !prev.windows[id].pinned },
      },
    }));
  }, []);

  const updateWindowData = useCallback((id: string, data: any) => {
    setState(prev => ({
      ...prev,
      windows: {
        ...prev.windows,
        [id]: { ...prev.windows[id], data },
      },
    }));
  }, []);

  const setBootComplete = useCallback(() => {
    setState(prev => ({ ...prev, bootComplete: true }));
  }, []);

  const restoreSavedLayout = useCallback(() => {
    if (layoutRestoredRef.current) return false;
    layoutRestoredRef.current = true;
    const saved = loadSavedLayout();
    if (!saved || saved.windows.length === 0) return false;

    setState(prev => {
      let zIndex = prev.maxZIndex;
      const windows: Record<string, WindowInstance> = {};

      saved.windows.forEach((w, i) => {
        const registryApp = getApp(w.appId);
        const defaults = registryApp
          ? { icon: registryApp.icon, accentColor: registryApp.accentColor }
          : { icon: FALLBACK_DEFAULTS.icon, accentColor: FALLBACK_DEFAULTS.accentColor };
        const id = `${w.appId}-restored-${i}`;
        zIndex++;
        windows[id] = {
          id,
          appId: w.appId,
          title: w.title,
          icon: defaults.icon,
          accentColor: defaults.accentColor,
          position: w.position,
          size: w.size,
          minimized: false,
          maximized: w.maximized,
          zIndex,
          workspaceId: w.workspaceId,
          pinned: w.pinned,
        };
      });

      const lastId = Object.keys(windows).pop() || null;
      return {
        ...prev,
        windows,
        activeWindowId: lastId,
        activeWorkspace: saved.activeWorkspace || 1,
        maxZIndex: zIndex,
      };
    });
    return true;
  }, []);

  // Persist layout on every window/workspace change (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state.bootComplete || Object.keys(state.windows).length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveLayout(state), 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state.windows, state.activeWorkspace, state.bootComplete]);

  const getVisibleWindows = useCallback((): WindowInstance[] => {
    return Object.values(state.windows)
      .filter(w => w.pinned || w.workspaceId === state.activeWorkspace)
      .sort((a, b) => a.zIndex - b.zIndex);
  }, [state.windows, state.activeWorkspace]);

  return (
    <DesktopContext.Provider
      value={{
        windows: state.windows,
        activeWindowId: state.activeWindowId,
        activeWorkspace: state.activeWorkspace,
        bootComplete: state.bootComplete,
        openWindow,
        closeWindow,
        minimizeWindow,
        maximizeWindow,
        restoreWindow,
        focusWindow,
        updateWindowPosition,
        updateWindowSize,
        moveToWorkspace,
        switchWorkspace,
        togglePinWindow,
        updateWindowData,
        setBootComplete,
        getVisibleWindows,
        restoreSavedLayout,
      }}
    >
      {children}
    </DesktopContext.Provider>
  );
}

export function useDesktop() {
  const context = useContext(DesktopContext);
  if (!context) {
    throw new Error('useDesktop must be used within DesktopProvider');
  }
  return context;
}
