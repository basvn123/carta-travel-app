import React, { useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';

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

const UPDATED = '23 September 2026';
const CONTACT = 'bas.vannieuwenhuyse123@gmail.com';

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

export function Imprint({ onClose }) {
  // A dialog for the keyboard and a screen reader too (T186): focus moves in,
  // Tab stays inside, Escape closes it and focus goes back to the opener.
  const cardRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap(cardRef, onClose, { initialFocusRef: closeRef });
  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal privacy-modal" ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="legal-imprint-title" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} className="panel-close auth-close" onClick={onClose} aria-label="Close">x</button>
        <h2 className="auth-title" id="legal-imprint-title">Imprint</h2>
        <p className="privacy-updated">Last updated {UPDATED}</p>

        <div className="privacy-body">
          <h3>Business Information</h3>
          <p>
            <strong>Legal name:</strong> {ENTITY.legalName}
          </p>
          <p>
            <strong>Address:</strong><br />
            {ENTITY.streetAddress}<br />
            {ENTITY.postalCode} {ENTITY.city}<br />
            {ENTITY.country}
          </p>
          <p>
            <strong>Contact:</strong> <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>

          <h3>Registration</h3>
          <p>
            <strong>Enterprise number (KBO/BCE):</strong> {ENTITY.enterpriseNumber}
          </p>
          {ENTITY.vatNumber && ENTITY.vatNumber !== '[Awaiting T015: VAT number if registered]' && (
            <p>
              <strong>VAT number:</strong> {ENTITY.vatNumber}
            </p>
          )}

          <h3>Regulatory Notice</h3>
          <p>
            This imprint is provided in accordance with EU e-Commerce Directive
            Art 5 and the Belgian Code of Economic Law. The information above
            identifies the natural or legal person responsible for the content
            and operation of the Carta platform.
          </p>
        </div>
      </div>
    </div>
  );
}
