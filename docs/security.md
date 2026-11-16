# Security and operational boundaries

## Implemented safeguards

- Render market-data labels as text or escaped HTML, including dropdown options and chart group labels. Remote datasets and browser storage are untrusted input.
- Validate workflow mode inputs and pass them as environment variables instead of interpolating them into shell source.
- Restrict automated commits to intended output files; CI validation uses read-only repository permissions.
- Write generated JSON via temporary files and atomic replacement. Propagate collector failures so failed runs do not appear successful.
- Keep local secrets, scratch outputs and caches out of source control with `.gitignore`.

## Remaining boundaries

This is a source review and offline/browser regression pass, not a penetration test of third-party APIs or hosting. No live collector refresh was performed. API availability, credentials, response contracts and rate limits must be checked during a controlled refresh.

Pages load external scripts including Tailwind's runtime CDN, analytics, TradingView and chart libraries. These suppliers execute code in visitors' browsers. A future migration should compile Tailwind locally and vendor or pin scripts with integrity metadata where supported. A strict content security policy requires first extracting inline scripts/styles and inventorying the widgets' origins; adding a permissive policy would not solve this.

GitHub Pages does not let this repository configure arbitrary HTTP response headers. Hosting-level CSP, HSTS and other response headers require a host/CDN with that capability. Do not assume a configuration file alone enables them.

Market snapshots are public and may be delayed. Browser caching and successful workflows do not prove exchange freshness. Preserve source timestamps and review stale-data behavior before making freshness claims. The 52-week data collector currently contains a provider-specific date/financial-year URL; review it when that provider changes periods.

Do not expose brokerage credentials, personal holdings or private user data through committed JSON. Security-sensitive reports should omit secret values and use a private channel with the repository owner.

## Data accuracy guard

The stored 52-week provider report currently contains no usable extrema. Collector validation now rejects all-null reports, and daily enrichment leaves unavailable extrema/percentages null instead of representing the daily range as a 52-week range. This prevents misleading values on future successful refreshes; the committed website snapshot was deliberately not regenerated during this review.
