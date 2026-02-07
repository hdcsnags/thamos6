# Terminal Theme Implementation Guide

## 📁 Files Created

1. **TerminalLayout.tsx** - Main layout wrapper with CRT effects, boot sequence, header
2. **TerminalScanner.tsx** - Interactive CLI scanner with command parsing
3. **TerminalIPResult.tsx** - Terminal-styled IP scan results
4. **ThemeContext.tsx** - Theme switching context provider

## 🚀 Implementation Steps

### Step 1: Add Theme Provider to App

In your `main.tsx` or `App.tsx`, wrap your app with the ThemeProvider:

```tsx
import { ThemeProvider } from './contexts/ThemeContext';

root.render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>
);
```

### Step 2: Modify App.tsx to Support Theme Switching

```tsx
import { useTheme } from './contexts/ThemeContext';
import Layout from './components/Layout'; // Your current tactical layout
import TerminalLayout from './components/TerminalLayout';
import Scanner from './pages/Scanner'; // Your current scanner
import TerminalScanner from './components/TerminalScanner';
import IPResult from './pages/results/IPResult'; // Your current IP result
import TerminalIPResult from './components/TerminalIPResult';

function App() {
  const { theme } = useTheme();
  const [currentPage, setCurrentPage] = useState<Page>('scanner');
  const [scanType, setScanType] = useState<string>('');
  const [scanValue, setScanValue] = useState<string>('');

  const handleScan = (type: string, value: string) => {
    setScanType(type);
    setScanValue(value);
    setCurrentPage(type as Page);
  };

  // Choose components based on theme
  const LayoutComponent = theme === 'terminal' ? TerminalLayout : Layout;
  const ScannerComponent = theme === 'terminal' ? TerminalScanner : Scanner;
  const IPResultComponent = theme === 'terminal' ? TerminalIPResult : IPResult;

  return (
    <LayoutComponent currentPage={currentPage} onNavigate={setCurrentPage} onScan={handleScan}>
      {currentPage === 'scanner' && <ScannerComponent onScan={handleScan} />}
      {currentPage === 'ip' && scanValue && <IPResultComponent ip={scanValue} />}
      {/* Add other pages as needed */}
    </LayoutComponent>
  );
}
```

### Step 3: Add Theme Toggle Button

Add a theme switcher in your current Layout or in TerminalLayout:

```tsx
import { useTheme } from '../contexts/ThemeContext';

function YourLayout() {
  const { toggleTheme, theme } = useTheme();

  return (
    <div>
      <button onClick={toggleTheme}>
        Switch to {theme === 'tactical' ? 'Terminal' : 'GUI'} Mode
      </button>
      {/* rest of layout */}
    </div>
  );
}
```

### Step 4: Create Additional Terminal Result Components

You'll need to create terminal versions for:
- **TerminalHashResult.tsx** - For hash scans
- **TerminalURLResult.tsx** - For URL scans
- **TerminalDomainResult.tsx** - For domain scans

Follow the same pattern as `TerminalIPResult.tsx` - just swap the lookup function and data structure.

## 🎨 Color Palette Reference

```css
--void: #0a0e1a;           /* Background */
--terminal-blue: #a5d8ff;  /* Primary text */
--cyan: #00d9ff;           /* Accents/prompts */
--green: #00ff41;          /* Success */
--purple: #b794f6;         /* Highlights */
--pink: #ff0080;           /* Errors/malicious */
--amber: #fbbf24;          /* Warnings */
--dim: #4a5568;            /* Dimmed text */
```

## 📝 Terminal Commands Reference

### Scanning Commands:
```bash
scan -ip 8.8.8.8          # IP scan
scan -hash <hash>         # Hash scan
scan -url <url>           # URL scan
scan -domain <domain>     # Domain scan
```

### Utility Commands:
```bash
get -feed rss             # Get RSS feed
get -feed ransomware      # Get ransomware feed
status                    # System status
history                   # Command history
clear                     # Clear terminal
startx                    # Switch to GUI (toggleTheme)
help                      # Show help
```

## 🔧 Features Implemented

✅ Boot sequence on load  
✅ CRT effects (scanlines, flicker, glow)  
✅ Command history (up/down arrows)  
✅ Session ID and uptime counter  
✅ ASCII art logo  
✅ Terminal-styled scan results  
✅ Theme persistence (localStorage)  
✅ Shared auth context  
✅ Shared API logic (threatIntel.ts)  

## 🎯 TODO / Nice-to-Haves

- [ ] Tab completion for commands
- [ ] Terminal result pages for Hash/URL/Domain
- [ ] Command aliases (e.g., `s` for `scan`)
- [ ] Color themes within terminal (green/amber/cyan variants)
- [ ] Sound effects on scan completion (optional)
- [ ] Copy result to clipboard command
- [ ] Export results as JSON command

## 🐛 Troubleshooting

**Theme not switching?**
- Make sure ThemeProvider wraps your entire app
- Check localStorage for 'thamos6-theme' key

**Boot sequence stuck?**
- Check console for errors
- Verify all imports are correct

**Commands not working?**
- Ensure onScan prop is passed correctly
- Check that lookup functions are imported

**CRT effects not showing?**
- Some effects may not work in all browsers
- Try Chrome/Firefox for best results
