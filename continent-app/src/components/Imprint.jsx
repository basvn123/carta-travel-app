import React from 'react';
import { CONTACT } from '../lib/contact.js';
import { LegalDoc } from './LegalDoc.jsx';
import { ATTRIBUTIONS } from '../data/attribution.js';

/**
 * The statutory Imprint page, legally required by EU e-Commerce Directive Art 5
 * and Belgian Code of Economic Law. This page must be publicly accessible and carry:
 * legal trade name, geographic address, direct contact email, enterprise number
 * (KBO/BCE), and VAT number if registered.
 *
 * Rendered in the same overlay+modal pattern as PrivacyPolicy.jsx, opened from
 * the footer. Entity details are filled from T015 (entity registration decision).
 *
 * Until T015 is executed, this component carries placeholder values that must be
 * replaced with real registered business information before any public launch.
 */

const UPDATED = '16 October 2026';

// Entity details from T015. Until that task completes, these are placeholders.
// T015 will provide the registered legal name, address, and enterprise number.
const ENTITY = {
  legalName: '[Awaiting T015: Legal business name]',
  streetAddress: '[Awaiting T015: Street address]',
  postalCode: '[Awaiting T015: Postal code]',
  city: '[Awaiting T015: City]',
  country: '[Awaiting T015: Country]',
  enterpriseNumber: '[Awaiting T015: KBO/BCE number]',
  vatNumber: '[Awaiting T015: VAT number if registered]', // May be empty if not registered
};

// A placeholder is never printed: until T015 fills a field, its line stays
// off the page rather than showing "[Awaiting ...]" to a reader (T461).
const known = (v) => Boolean(v) && !v.startsWith('[Awaiting');

export function Imprint({ onClose }) {
  // A dialog for the keyboard and a screen reader too (T186): focus moves in,
  // Tab stays inside, Escape closes it and focus goes back to the opener.
  return (
    <LegalDoc id="legal-imprint" title="Imprint" updated={UPDATED} onClose={onClose}>
          <h3>Business information</h3>
          {known(ENTITY.legalName) && (
            <p>
              <strong>Legal name:</strong> {ENTITY.legalName}
            </p>
          )}
          {!known(ENTITY.legalName) && (
            <p>
              Carta's business registration is in progress. The legal name,
              address and enterprise number will be published on this page as
              soon as it is complete. Until then, write to the address below.
            </p>
          )}
          {known(ENTITY.streetAddress) && known(ENTITY.city) && (
            <p>
              <strong>Address:</strong><br />
              {ENTITY.streetAddress}<br />
              {ENTITY.postalCode} {ENTITY.city}<br />
              {ENTITY.country}
            </p>
          )}
          <p>
            <strong>Contact:</strong> <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>

          {known(ENTITY.enterpriseNumber) && (
            <>
              <h3>Registration</h3>
              <p>
                <strong>Enterprise number (KBO/BCE):</strong> {ENTITY.enterpriseNumber}
              </p>
              {known(ENTITY.vatNumber) && (
                <p>
                  <strong>VAT number:</strong> {ENTITY.vatNumber}
                </p>
              )}
            </>
          )}

          <h3>Regulatory notice</h3>
          <p>
            This imprint is provided in accordance with EU e-Commerce Directive
            Art 5 and the Belgian Code of Economic Law. Once published, the
            information above identifies the natural or legal person
            responsible for the content and operation of the Carta platform.
          </p>

          {/* Every source whose licence asks for a visible credit, from
              src/data/attribution.js (derived from docs/tos/data_licenses.md).
              They lived on an Account page of their own ("Where the numbers
              come from") until T461; the licences ask for the credit to be
              findable, and the imprint is where a reader looks for who stands
              behind a site and what it is built on. */}
          <h3>Data credits</h3>
          <p>Carta is built on open data. These sources ask to be credited:</p>
          <ul className="legal-credits">
            {ATTRIBUTIONS.map((a) => <li key={a.source}>{a.credit}</li>)}
          </ul>
    </LegalDoc>
  );
}
