import { useState, useEffect, useCallback } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';
import { useAlerts } from '../../contexts/AlertContext';
import { useAuth } from '../../contexts/AuthContext';
import { useContextMenu, type MenuEntry } from './ContextMenu';
import { supabase } from '../../lib/supabase';
import { Bell } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';

interface TaskbarProps {
  onOpenLauncher: () => void;
}

export function Taskbar({ onOpenLauncher }: TaskbarProps) {
  const desktop = useDesktop();
  const { unreadCount } = useAlerts();
  const { user } = useAuth();
  const { showContextMenu } = useContextMenu();
  const [time, setTime] = useState(new Date());
  const [agentStatus, setAgentStatus] = useState({ x: false, y: false, z: false });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    const checkAgents = async () => {
      const { data } = await supabase
        .from('user_api_keys')
        .select('service')
        .eq('user_id', user.id)
        .in('service', ['anthropic_key', 'openai_key', 'gemini_key']);
      const services = (data || []).map(k => k.service);
      setAgentStatus({
        x: services.includes('anthropic_key'),
        y: services.includes('openai_key'),
        z: services.includes('gemini_key'),
      });
    };
    checkAgents();
  }, [user]);

  const openWindows = Object.values(desktop.windows).filter(
    w => w.workspaceId === desktop.activeWorkspace || w.pinned
  );

  const agents = [
    { key: 'x', label: 'X (Claude)', color: palette.agentX, online: agentStatus.x },
    { key: 'y', label: 'Y (GPT)', color: palette.agentY, online: agentStatus.y },
    { key: 'z', label: 'Z (Gemini)', color: palette.agentZ, online: agentStatus.z },
  ];

  return (
    <div
      data-taskbar="true"
      className="fixed bottom-0 left-0 right-0 h-11 flex items-center justify-between px-3 gap-3 backdrop-blur-xl z-50"
      style={{
        backgroundColor: `${palette.base}cc`,
        borderTop: `1px solid ${palette.borderSubtle}`,
        fontFamily: typography.ui,
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenLauncher}
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
          style={{ color: palette.cyan }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${palette.cyan}10`; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          aria-label="Open App Launcher"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
          </svg>
        </button>

        <div className="flex items-center gap-1">
          {[1, 2, 3, 4].map(num => (
            <button
              key={num}
              onClick={() => desktop.switchWorkspace(num)}
              className="flex items-center justify-center w-7 h-7 rounded-md text-xs font-medium transition-all"
              style={{
                backgroundColor: desktop.activeWorkspace === num ? `${palette.cyan}15` : 'transparent',
                color: desktop.activeWorkspace === num ? palette.cyan : palette.textTertiary,
                border: desktop.activeWorkspace === num ? `1px solid ${palette.cyan}30` : '1px solid transparent',
              }}
              aria-label={`Switch to workspace ${num}`}
            >
              {num}
            </button>
          ))}
        </div>

        <div className="w-px h-5" style={{ backgroundColor: palette.borderDefault }} />

        <div className="flex items-center gap-1.5 overflow-x-auto max-w-2xl">
          {openWindows.map(win => (
            <button
              key={win.id}
              onClick={() => {
                if (win.minimized) {
                  desktop.restoreWindow(win.id);
                } else {
                  desktop.focusWindow(win.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                const items: MenuEntry[] = [
                  win.minimized
                    ? { label: 'Restore', icon: '\u2B1C', action: () => desktop.restoreWindow(win.id) }
                    : { label: 'Minimize', icon: '\u2500', action: () => desktop.minimizeWindow(win.id) },
                  { label: win.pinned ? 'Unpin' : 'Pin to All Workspaces', icon: '\uD83D\uDCCC', action: () => desktop.togglePinWindow(win.id) },
                  { type: 'divider' },
                  { label: 'Close', icon: '\u2717', action: () => desktop.closeWindow(win.id), danger: true },
                ];
                showContextMenu(e.clientX, e.clientY, items);
              }}
              className="flex items-center gap-2 px-2.5 h-7 rounded-md text-xs font-medium transition-all whitespace-nowrap"
              style={{
                backgroundColor: desktop.activeWindowId === win.id ? `${win.accentColor}15` : 'transparent',
                color: desktop.activeWindowId === win.id ? win.accentColor : palette.textTertiary,
                border: `1px solid ${desktop.activeWindowId === win.id ? win.accentColor + '30' : 'transparent'}`,
                opacity: win.minimized ? 0.5 : 1,
              }}
              aria-label={`Focus ${win.title}`}
            >
              <span className="text-xs">{win.icon}</span>
              <span className="max-w-[100px] truncate">{win.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5" title="Agent Status">
            {agents.map(agent => (
              <div key={agent.key} className="relative group">
                <div
                  className="w-2 h-2 rounded-full transition-all"
                  style={{
                    backgroundColor: agent.online ? agent.color : palette.textDisabled,
                    boxShadow: agent.online ? `0 0 6px ${agent.color}60` : 'none',
                  }}
                />
                <span
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{
                    fontSize: '10px',
                    fontFamily: typography.mono,
                    backgroundColor: palette.elevated,
                    border: `1px solid ${palette.borderDefault}`,
                    color: palette.textSecondary,
                  }}
                >
                  {agent.label}: {agent.online ? 'ONLINE' : 'NO KEY'}
                </span>
              </div>
            ))}
          </div>

          <div className="w-px h-4" style={{ backgroundColor: palette.borderDefault }} />

          <div className="relative">
            <button
              onClick={() => {
                desktop.openWindow({
                  appId: 'intel',
                  title: 'Intel Dashboard',
                  icon: '\u{1F4E1}',
                  accentColor: palette.cyan,
                });
              }}
              className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
              style={{ color: palette.amber }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${palette.amber}10`; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              aria-label="Notifications"
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold"
                  style={{ backgroundColor: palette.rose, color: '#fff' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div
          className="tabular-nums"
          style={{
            fontSize: '12px',
            fontFamily: typography.mono,
            color: palette.textTertiary,
            fontWeight: 500,
          }}
        >
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </div>
      </div>
    </div>
  );
}
