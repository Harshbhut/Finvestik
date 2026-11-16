# Verification

Verified locally in Chromium against a Python static server. No collectors were run against live market providers and no generated market data was refreshed.

- **24 browser cases passed:** Home, Education, Position Calculator, Stock Universe, Custom Index, and RRG at 320px and 1440px, in both dark and light themes. No document horizontal overflow. Custom Index currently presents its existing maintenance screen.
- **Stock Universe:** 2,586 rows rendered; opening/applying filters, refreshing, and showing the insights panel worked on phone and desktop layouts.
- **Calculators:** capital ₹100,000, risk 1%, entry ₹100, stop ₹95 produced 200 shares; allocation 20% with the same entry/stop also produced 200 shares. The focus handler that could overwrite freshly typed risk percentages was removed during verification.
- **RRG:** dataset and chart loaded; selecting Leading updated the active quadrant. Mobile quadrant controls wrapped inside the viewport; the mobile chart screenshot was visually reviewed.
- **Accessibility styling:** a sampled theme button measured 44×44px with visible keyboard focus; reduced-motion transitions measured 0.00001s. This is a targeted check, not a complete accessibility certification or real-device test.
- **Additional layout sweep:** 320, 375, 768, 1024, and 1440px across the six pages identified the RRG mobile overflow fixed above.

The managed browser initially rejected external CDN certificates (`ERR_CERT_AUTHORITY_INVALID`). The browser test context alone used `ignoreHTTPSErrors` to load the existing external dependencies; application TLS verification was not changed. Google Analytics requests aborted during navigation were recorded separately from application errors. External CDN availability and real mobile devices remain deployment checks.

Custom Index follow-up: the sweep exposed a null table reference while its original table is commented out for maintenance. An early return now skips initialization when the table is absent; a targeted browser retest confirmed the maintenance heading is visible with zero JavaScript page errors.
