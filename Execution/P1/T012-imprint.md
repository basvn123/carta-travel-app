# T012: Publish the statutory Imprint

## Date

2026-09-23

## What changed

The Imprint component was created and integrated into the Account panel following the PrivacyPolicy.jsx pattern. The page is now accessible from the Account panel under the Help section and displays legally required business information: legal name, geographic address, contact email, enterprise number (KBO/BCE), and VAT number. The component reuses the existing auth-modal and privacy-modal CSS, ensuring visual consistency with the Privacy Policy. Six language files were updated with the i18n key account.imprint (English: "Imprint", Dutch: "Rechtspersoon", German: "Impressum", Spanish: "Aviso legal", French: "Mentions légales", Italian: "Note legali").

The implementation uses placeholder values for entity details pending task T015, which will provide the registered legal business name, address, and enterprise number. A clear comment in the component notes that real entity information must be filled in from T015 before public launch.

## Files touched

**Created:**
- continent-app/src/components/Imprint.jsx

**Modified:**
- continent-app/src/auth/AccountPanel.jsx (imported Imprint, added state, menu item, and modal rendering)
- continent-app/src/i18n/en.js (added account.imprint key)
- continent-app/src/i18n/nl.js (added account.imprint key)
- continent-app/src/i18n/de.js (added account.imprint key)
- continent-app/src/i18n/es.js (added account.imprint key)
- continent-app/src/i18n/fr.js (added account.imprint key)
- continent-app/src/i18n/it.js (added account.imprint key)

## Commands run

Dev server started to verify compilation:
```
cd continent-app && npm run dev
```

No deployment or data changes required for this task.

## Config and secrets set

No environment variables or configuration changes needed. The component uses the same contact email already defined in PrivacyPolicy.jsx and AccountPanel.jsx (bas.vannieuwenhuyse123@gmail.com).

## Before/after measurements

Not measured. This task adds a new component with no quantifiable impact on performance, bundle size, or user metrics before public launch.

## What broke and how it was fixed

No issues. The component follows the exact pattern of PrivacyPolicy.jsx, reusing existing CSS classes and overlay behavior. Dev server verified that all imports resolve correctly and the UI compiles without errors.

## What is still open

The entity details in Imprint.jsx remain as placeholders:
- legalName
- streetAddress
- postalCode
- city
- country
- enterpriseNumber (KBO/BCE number)
- vatNumber

These must be replaced with real registered business information from task T015 (entity decision) before the Imprint page is published. The component includes conditional rendering that hides the VAT number row if the field contains the placeholder text, but this is safe only during development; a real entity without VAT registration should set an empty string instead.

The page is not yet linked from the public footer or homepage because it must carry a real address and business registration number. Once T015 completes, the values must be pasted into the ENTITY object and the component can go live. A public URL should then be added to the footer with a link to the Imprint.

## Rollback procedure

To undo this work:
1. Delete continent-app/src/components/Imprint.jsx
2. In continent-app/src/auth/AccountPanel.jsx, remove the Imprint import, the imprintOpen state, the imprint menu item, and the Imprint modal rendering
3. In all i18n files (en.js, nl.js, de.js, es.js, fr.js, it.js), remove the account.imprint key
4. Commit the deletions

The changes are non-breaking because the Imprint page is only accessible from the Account panel and carries no data or state changes.
