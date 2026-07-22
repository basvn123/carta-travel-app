import React from 'react';

/**
 * The privacy policy, readable inside the app (App Store guideline 5.1.1(i)
 * requires the policy to be easily accessible in-app, not only a web link).
 * Rendered as the same overlay+modal pattern the auth surfaces use; opened
 * from the entry gate and from the Account panel.
 *
 * Content is deliberately plain English and factual about what the app
 * actually does; update it whenever a new data flow ships.
 */
const UPDATED = '22 July 2026';
const CONTACT = 'bas.vannieuwenhuyse123@gmail.com';

export function PrivacyPolicy({ onClose }) {
  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal privacy-modal" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close auth-close" onClick={onClose} aria-label="Close">x</button>
        <h2 className="auth-title">Privacy policy</h2>
        <p className="privacy-updated">Last updated {UPDATED}</p>

        <div className="privacy-body">
          <h3>What Carta collects</h3>
          <p>
            Without an account, nothing personal leaves your device: your trips,
            day plans and preferences are stored in your browser's local storage.
          </p>
          <p>
            With an account, Carta stores your email address, the name you enter,
            and the trips and day plans you save, so they sync across your
            devices. That is all. No advertising identifiers, no tracking pixels,
            no sale of data to anyone.
          </p>

          <h3>Services the app talks to</h3>
          <p>
            Accounts and saved trips are hosted on Supabase (EU-hosted Postgres).
            Signing in with Google shares your Google account's name and email
            with Carta and nothing else. Walking and driving routes are computed
            by the public OSRM/FOSSGIS routing service and address search by
            OpenStreetMap Nominatim; both receive only the coordinates or the
            address text you searched, never your identity. Photos and place
            descriptions load from Wikimedia servers. Opening a booking or
            Google Maps link takes you to that provider under its own policy.
          </p>

          <h3>Retention and deletion</h3>
          <p>
            Account data is kept until you delete it. You can delete your account
            and everything stored with it at any time from the Account panel
            ("Delete my account"); deletion is immediate and irreversible. Local
            data on your device is removed by clearing the site data in your
            browser. You can also revoke consent or request deletion by mail:
            {' '}<a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>

          <h3>Your rights</h3>
          <p>
            Under the GDPR you can request access to, correction of, or deletion
            of your personal data, and you can withdraw consent at any time.
            Write to the address above and you will get an answer within 30 days.
          </p>
        </div>
      </div>
    </div>
  );
}
