import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
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
  | 'ip-result'
  | 'url-result'
  | 'domain-result'
  | 'hash-result';

export interface WindowInstance {
  id: string;
  appId: AppId;
  title: string;
  icon: string;
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
}

const DesktopContext = createContext<DesktopContextType | undefined>(undefined);

const FALLBACK_DEFAULTS = { icon: '\uD83D\uDD0D', accentColor: '#00d9ff', defaultSize: { width: 800, height: 600 } };

export function DesktopProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DesktopState>({
    windows: {},
    activeWindowId: null,
    activeWorkspace: 1,
    maxZIndex: 100,
    bootComplete: false,
  });

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
