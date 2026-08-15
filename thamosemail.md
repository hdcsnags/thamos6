# T6/Thamos — Email Link Detonation Module: Handoff

## Context

Building a module inside T6 (internal SOC platform) that ingests dropped EML files, extracts IOCs, and needs to determine whether links found in the email body/attachments lead to actual phishing/AITM infrastructure — not just whether the first-hop URL itself is flagged.

T6 already has working integrations: Anthropic, OpenAI, Gemini, Google Safe Browsing, VirusTotal, urlscan.io, AlienVault OTX, CRXcavator, NVD/NIST, HaveIBeenPwned, EmailRep.io. Edge functions already route to urlscan.io and are confirmed wired.

## The core problem

Two-stage (or more) phishing chains where the IOC extractor only sees stage 1:

1. **Email body link** → points to a "gate" page (seen example: Google Sites page, `sites.google.com/ornnediem.com/calleta-partners-llc-inc/home`) with a "Review Document" / "Document Ready for Review" button styled as an end-to-end-encryption prompt.
2. **The gate page's button** is the actual dangerous hop — historically leads to an AITM kit (credential harvesting, device-code flow, OAuth consent phishing, etc.). In the test case this second link is now dead (old investigation), but the pattern is what needs to be solved for future live cases.
3. Static HTML/text parsing of the email and even of the gate page **cannot see the second link** — it's very likely behind a JS onclick handler, a POST-and-redirect, or a bot-fingerprint gate rather than a plain `href`.

A second, related vector also flagged: **links embedded inside PDF attachments**, which is a distinct extraction problem, not solved by the same code path as HTML body links.

## What we tested and found (urlscan.io, on a known-malicious final-stage URL)

URL tested: `https://corporationgrupoprotenditcapital.enxgxcgrouplimited.vu/`

* urlscan.io's own verdict: **"No classification"** — did not independently flag it.
* VirusTotal (surfaced via urlscan): 1 malicious (ESET, "phishing"), 1 suspicious (Sophos, "spam"), 54 clean, 36 undetected. Composite score landed at 35 ("low signal, calibrated").
* Page returned an actual **404 Not Found** at scan time (domain likely dead/torn down since original campaign — expected, this is an old IOC).
* Resolving IP: `188.114.96.3` — **this is a Cloudflare anycast IP**, not the actual hosting origin. IP-level reputation lookups here are close to useless/dangerous to trust directly:

  * Score 76 "Malicious" was returned for this IP, but that's almost certainly aggregate noise from *other* abusive domains sitting behind the same Cloudflare edge IP, not signal specific to this phishing domain.
  * Real conclusion: **domain-level and final-render-level evidence (page content, screenshot, DOM, redirect chain) is far more trustworthy than IP reputation when the origin is CDN-fronted.** IP data is still worth capturing/storing for correlation purposes, just needs to be weighted low or excluded from any auto-block/auto-score logic to avoid false-positive storms against every other Cloudflare-fronted domain.

**Bottom line from this test:** urlscan.io's default/free-tier data on a single URL submission is "thin" — good raw material (screenshot, DOM, redirect chain, resolved IPs, TLS cert info, TI cross-references) but requires an analyst (or automated interaction step) to actually click through, since it does not by default interact with the page beyond load. It also does not always independently classify something as malicious even when downstream TI vendors do — so verdict should be a **composite of urlscan data + VT + other TI feeds**, not read from urlscan's own classification field alone.

## Options discussed for second-hop extraction

### 1\. Headless browser automation (Playwright) — recommended default

Actually execute the page: load stage-1 URL, click the "Review Document" button (or whatever CTA text is detected), capture the full navigation/response chain, final URL, DOM, and screenshot. This is the only way to see JS-driven or POST-driven second hops; static parsing cannot.

Known failure mode: AITM kits fingerprint the visitor before revealing the real page (checks include `navigator.webdriver`, headless-specific JS quirks, IP reputation — datacenter ranges get shown a benign loop, residential/mobile gets the real credential page, mouse movement/timing patterns, referrer chain integrity).

Mitigations discussed, in rough order of effort vs payoff:

* Stealth patches (`playwright-extra` + stealth plugin, or `rebrowser-patches`) — cheap, do first.
* Human-like interaction simulation (randomized delay, mouse move before click, scroll) — cheap, meaningful.
* **Residential/mobile egress IP pool for detonation traffic** — likely the highest-value fix against IP-based kit gating, but has real cost; worth budgeting for if this module is going to be relied on operationally.
* Accept that some kits will still evade detection — this is why a hybrid human-review fallback (below) matters.

### 2\. Build vs buy for full detonation

* **urlscan.io Automator** (paid tier) supports scripted interaction (click, fill, wait) before capturing final state — may cover the "click the button, see what happens" requirement without building/maintaining custom sandbox infrastructure. Worth evaluating before building custom.
* **ANY.RUN** — more interactive-sandbox-flavored, commonly used specifically for AITM/credential-phish chain analysis. Also worth evaluating.
* **Custom ephemeral sandbox** (spin-up/detonate/capture/destroy, never reused) — only worth building if the above services don't cover volume, interaction depth, or UI-integration needs. Would need the stealth + residential-egress layer above regardless.

### 3\. Hybrid model (recommended)

Auto-detonate every extracted URL as a default step. If automated result comes back "clean" but other structural signals from the email itself are already high-risk (first-contact sender flag, safelinks-wrapped-to-suspicious-destination, freshly registered/lookalike domain, PDF-with-QR-and-no-visible-link), **do not trust the clean automated verdict** — route to human-driven interactive sandbox review (T6 already has this capability, confirmed in screenshots) as a second pass. Kits gaming automated detonation is expected and should be treated as a known blind spot, not a dead end.

## PDF-embedded link extraction (separate problem, separate stage)

Two sub-cases, must be handled in order:

1. **Real embedded `/URI` link annotations** (most common, cheap to extract):

```python
   import fitz  # PyMuPDF
   doc = fitz.open("attachment.pdf")
   urls = \[]
   for page in doc:
       for link in page.get\_links():
           if link.get("uri"):
               urls.append(link\["uri"])
   ```

   Also pull plaintext URLs from `page.get\_text()` on the same pass — sometimes present in addition to the annotation.

2. **Visual-only links (QR code image, or screenshotted "click here" button, no underlying `/URI`)** — this case is specifically used to evade extractors that only look for real link objects:

```python
   import cv2
   from pyzbar import pyzbar
   # render each PDF page to an image via PyMuPDF's page.get\_pixmap() first
   detected = pyzbar.decode(page\_image)
   qr\_urls = \[d.data.decode() for d in detected]
   ```

   If no QR/barcode is found either (rare — pure image with no machine-readable payload), fall back to OCR (Tesseract) — this won't yield a URL but confirms visual bait is present, which is itself worth logging.

Whatever URL comes out of either sub-case feeds into the same Playwright detonation flow used for body links — no separate downstream pipeline needed.

**Scoring note:** flag "QR code present in email attachment" as its own independent risk signal regardless of what it resolves to or whether detonation succeeds — it's a known technique specifically to dodge text-based URL scanners and to push victims onto unmanaged mobile devices/networks.

## Outlook add-in (staff-facing "Send to Thamos" button)

Discussed shape:

* Office Add-in, Read-mode command button.
* On click: grab `Office.context.mailbox.item.itemId`.
* Backend calls Microsoft Graph `GET /me/messages/{id}/$value` to pull raw MIME/EML server-side (more reliable than trying to extract raw EML client-side via Office.js).
* Backend runs it through the existing T6 pipeline (IOC extraction → detonation → scoring).
* Add-in taskpane returns a verdict: green / red / "escalate to analyst."
* Needs Azure AD app registration with `Mail.Read` (or `Mail.ReadBasic`) permissions + admin consent for tenant-wide rollout.

## Where LLMs fit (not yet built, agreed direction)

* Don't ask an LLM to re-derive signals the deterministic pipeline already extracts cleanly (SPF/DKIM/DMARC, first-contact flag, safelinks unwrap, TI hits) — that's strictly worse and more expensive than the existing rule-based extraction.
* LLM's actual value is **reasoning over the combined signal set plus the pretext/wording of the email** to judge whether this specific combination looks like a targeted attack vs generic spray — a judgment call, not a lookup.
* Proposed tiering: Haiku for cheap bulk first-pass triage on volume; escalate to Sonnet only for the ambiguous middle tier where deterministic signals disagree with each other (e.g., DMARC passes but SFTY score is high but domain is unlisted anywhere in TI feeds) — that's where a second opinion actually earns its cost.

## Open questions / things worth a second opinion on

1. Is urlscan.io Automator (paid) actually sufficient for the click-through requirement, or does the fingerprinting sophistication in these kits require a fully custom stealth-Playwright + residential proxy build regardless? Worth a real trial before committing budget either way.
2. What's the right default trigger for "route to human sandbox" in the hybrid model — a fixed score threshold, or a rule like "any two of: first-contact flag, safelinks-to-uncommon-destination, freshly-registered domain, QR-in-PDF, and automated detonation returned clean"?
3. For the Outlook add-in: application permissions (works headlessly, needs tenant admin consent, broader blast radius) vs delegated permissions (scoped to the clicking user, no extra consent friction) — which fits the deployment model better given DSBN's environment?
4. Residential/mobile proxy provider selection and cost — not yet evaluated, needed before Playwright stealth work is worth finishing.
5. Confirm whether IP-reputation data (like the Cloudflare-anycast false-positive-prone case above) should be stored-but-deprioritized in T6's scoring model across the board, or handled with domain-specific origin-IP resolution logic (e.g., checking `cf-ray`/direct-connect bypass techniques) where feasible.

