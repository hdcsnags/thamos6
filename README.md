# Thamos6 - Threat Intelligence Platform

A comprehensive threat intelligence platform designed for SOC teams and security analysts. Aggregate data from 13+ threat intelligence sources, analyze IOCs, manage investigations, and monitor security news feeds.

## Features

### Threat Intelligence Tools
- **IP Lookup** - Reputation checks across 13+ sources with threat scoring
- **Hash Lookup** - File hash analysis against malware databases
- **Domain Intel** - WHOIS and reputation data for domains
- **URL Scanner** - Malicious URL detection and analysis
- **Bulk Lookup** - Batch IP analysis (up to 100 IPs for org users)

### Analysis & Extraction
- **Smart IOC Intake** - Extract and analyze IOCs from raw text with instant verdicts
  - Automated threat analysis for IPs, domains, URLs, hashes
  - Intelligent verdict classification (Known Malicious, Tor Exit Node, VPN, etc.)
  - One-click actions (add to watchlist, create case)
  - Multiple export formats (CSV, JSON, plain text, defanged)
- **Defang/Refang Tool** - Safe IOC formatting for sharing
- **Decoder Tool** - Multi-format decoder (Base64, URL, Hex, etc.)
- **Email Analyzer** - Parse email headers and extract threat indicators

### Investigation Management
- **Case Notes** - Document investigations with IOC tracking
- **History** - Team-shared lookup history (30 days)
- **News Feed** - Aggregated security news with watchlist alerts
- **Watchlist** - Monitor IOCs across feeds

### User Management
- **Settings** - API key management and custom RSS feeds
- **Admin Panel** - Platform administration (admin users only)
  - User management dashboard
  - View user statistics and activity
  - Tier management (Free ↔ Org)
  - Ban/unban user accounts
  - Comprehensive usage analytics

## User Tiers

### Anonymous
- Access to 7 free threat intelligence sources
- Limited bulk lookups (5 IPs)
- No authentication required

### DSBN (@dsbn.org)
- Full access to all 13+ sources (org-managed API keys)
- Bulk lookups up to 100 IPs
- Can add personal API keys as fallback
- Watchlist and alerts
- Case management

### External (Authenticated)
- Access to all sources with personal API keys
- Bulk lookups up to 50 IPs
- Custom RSS feeds
- Full investigation tools

### Admin
- All external user capabilities
- Access to admin panel
- User management
- Tier assignment
- Ban control
- Usage analytics

## Getting Started

### For Regular Users

1. Visit the platform
2. (Optional) Sign in for enhanced features
3. Start analyzing threats using the navigation menu

### For Admin Users

1. Sign in with your account
2. Contact a system administrator to grant admin privileges:
   ```sql
   UPDATE profiles SET is_admin = true WHERE email = 'your-email@example.com';
   ```
3. Access the admin panel via your user menu (click avatar → "Admin Panel")

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Authentication**: Supabase Auth (OAuth + Email/Password)
- **APIs**: 13+ threat intelligence sources

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete technical architecture and system design
- **[SETUP.md](./SETUP.md)** - Development setup and configuration guide
- **[MODULAR_GUIDE.md](./MODULAR_GUIDE.md)** - Modular design patterns and best practices
- **[SECURITY_FIXES_APPLIED.md](./SECURITY_FIXES_APPLIED.md)** - Security hardening documentation

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Type checking
npm run typecheck
```

## Key Features Detail

### Smart IOC Intake Auto-Analysis
The Smart IOC Intake tool automatically analyzes extracted IPs and provides intelligent verdicts:
- **Known Malicious** - IPs with confirmed malicious activity
- **Tor Exit Node** - Identified Tor network exit points (95% confidence)
- **Commercial VPN** - VPN providers with service name (85-90% confidence)
- **Proxy Server** - Detected proxy infrastructure (80% confidence)
- **Mass Scanner** - Automated scanning infrastructure
- **Clean Residential** - Legitimate residential IPs (70% confidence)

Each verdict includes confidence scores, evidence bullets, recommendations, and severity levels.

### Admin Panel Capabilities
Platform administrators can:
- View all registered users and their activity
- See comprehensive statistics (total users, active users, banned users, org tier users)
- Toggle user tiers between Free and Org with one click
- Ban or unban user accounts instantly
- Track user activity (API lookups, case notes, API keys configured)
- Monitor last login timestamps
- Search users by email

Admin access is protected by Row Level Security (RLS) and requires `is_admin = true` in the profiles table.

## Security

- AES-256 encrypted API key storage
- Row Level Security (RLS) on all database tables
- Secure edge functions for API proxying
- Admin-only functions with SECURITY DEFINER
- OAuth and email/password authentication

## License

Internal use only - DSBN Security Operations Center
