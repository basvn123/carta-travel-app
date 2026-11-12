import React from 'react';
import { CONTACT } from '../lib/contact.js';
import { LegalDoc } from './LegalDoc.jsx';

/**
 * The privacy policy, readable inside the app (App Store guideline 5.1.1(i)
 * requires the policy to be easily accessible in-app, not only a web link).
 * Rendered as the same overlay+modal pattern the auth surfaces use; opened
 * from the entry gate and from the Account panel.
 *
 * Content is deliberately plain English and factual about what the app
 * actually does; update it whenever a new data flow ships. The record of
 * processing behind it is docs/legal/ARTICLE30.md (T319, T1118): a
 * change here that adds a table, a recipient or a retention period changes
 * that record too.
 */
const UPDATED = '12 November 2026';

export function PrivacyPolicy({ onClose }) {
  // A dialog for the keyboard and a screen reader too (T186): focus moves in,
  // Tab stays inside, Escape closes it and focus goes back to the opener.
  return (
    <LegalDoc id="legal-privacy" title="Privacy policy" updated={UPDATED} onClose={onClose}>
          <h3>Who is responsible</h3>
          <p>
            The controller of your personal data is the person or company
            named in the Imprint, which gives the name and address. Write to
            {' '}<a href={`mailto:${CONTACT}`}>{CONTACT}</a> about anything in
            this policy. Carta has no data protection officer, because the law
            does not require one for a service of this size and kind.
          </p>

          <h3>What Carta collects</h3>
          <p>
            Without an account, your trips, day plans and preferences stay on
            your device, in your browser's local storage.
          </p>
          <p>
            With an account, Carta stores your email address, the name and
            profile you enter, the trips and day plans you save, the people
            you share them with or plan them with, your friends, any pass you
            buy, how many AI requests you have used, your Ask Carta questions
            and answers, the photos and tracks you upload, your email choices
            and price alerts, and any feedback or guide report you send. No
            advertising identifiers, no tracking pixels, no sale of data to
            anyone. You need an email address to have an account; the map,
            the destination pages and one trip work without one.
          </p>
          <p>
            Signed in, your Ask Carta conversations are kept in your account
            so you can return to them on another device. They are part of the
            file you can download under "Your rights", and they are deleted
            with your account.
          </p>

          <h3>Services the app talks to</h3>
          <p>
            The app and its data files are served by Cloudflare (Cloudflare
            Pages and R2). Like any web host, Cloudflare sees your IP address
            and each file your browser asks for.
            Accounts and saved trips are hosted on Supabase (EU-hosted Postgres).
            Signing in with Google shares your Google account's name and email
            with Carta and nothing else. Walking and driving routes are computed
            by the public OSRM/FOSSGIS routing service and address search by
            OpenStreetMap Nominatim; both receive only the coordinates or the
            address text you searched, never your identity. If you ask the
            Destinations tab to use your location, the browser asks you first,
            and the coordinate it returns goes to Nominatim to be named and
            nowhere else. It is not stored and it does not leave the session.
            Live research on a town Carta has not covered sends the town's
            area to OpenStreetMap's Overpass service. Your browser also fetches
            files straight from other servers: map tiles from CARTO and
            OpenStreetMap, photos and place descriptions from Wikimedia and
            Geograph, flags from flagcdn.com and webcam views from
            foto-webcam.eu. Each of them sees your IP address
            for that request, as with any web page, and receives nothing else
            from Carta. Opening a booking or
            Google Maps link takes you to that provider under its own policy.
          </p>
          <p>
            Passes are paid on Stripe's own checkout page. Carta gives Stripe
            your account email and an account reference; your card details go
            to Stripe and never reach Carta. Stripe reports back what you
            bought, what you paid, the country of your billing address and its
            own fee, and Carta keeps that with your pass. Stripe handles the
            payment for Carta and also acts as a controller in its own right
            for fraud prevention and its legal duties, under its own privacy
            policy.
          </p>
          <p>
            The AI planning features send what you give them to Google's Gemini
            service for processing: the day planner sends your trip dates, stops
            and stated interests, and the booking import sends the documents,
            pasted text or page you ask it to read. Do not upload documents you
            would not share with a cloud service. Extracted facts (booking
            references, prices, dates, links) are stored with your saved plans.
            A server cache keeps the parsed result, with no account attached,
            so the same import within 24 hours does not cost you a second AI
            credit; older cache entries are not yet deleted automatically.
            Traveller names, email addresses and phone numbers are excluded
            from the extraction by design.
          </p>
          <p>
            Google processes these requests on servers that are not limited to
            the EU, so the text you send to the AI features can leave the
            European Economic Area. The transfer runs under Google's Data
            Processing Addendum and its Standard Contractual Clauses, and
            Google does not use what you send to train its models.
          </p>
          <p>
            Ask Carta answers in two steps. Code first builds an answer from
            Carta's own data. A model may then write a few sentences: your
            question and up to 14 short notes from Carta's data are sent to
            Cloudflare Workers AI, which runs the open models named on the
            "How Carta uses AI" page on Cloudflare's network. Carta does not
            add your account or email address to that request. Cloudflare may
            process it outside the European Economic Area, under its Data
            Processing Addendum with the EU-US Data Privacy Framework and
            Standard Contractual Clauses, and Cloudflare does not use it to
            train models. The same question with the same notes is answered
            from a cache for seven days, with no account attached. If you
            switch on the on-device model, your question does not leave your
            device.
          </p>
          <p>
            When an AI request fails, Carta keeps a record of it so outages can
            be found and fixed: the function that failed, the error code, the
            HTTP status and your account, for 90 days. A screen that crashes is
            recorded the same way, as a crash with your account and nothing
            about the page, for 90 days. A booking import whose
            result could not be read is recorded the same way, with the kind of
            input and its size but not its content, for 30 days. The basis is
            our legitimate interest in keeping the service working (Article
            6(1)(f)).
          </p>
          <p>
            When you open someone else's public guide, Carta counts the view
            once a day. To tell readers apart it stores a hash of your account,
            or of your IP address when you are signed out, mixed with a secret
            value and the date, so the same reader hashes differently every
            day. These hashes are removed after two days and only the total per
            guide is kept. The basis is our legitimate interest in showing
            authors how often their guides are read (Article 6(1)(f)).
          </p>
          <p>
            Carta also counts, per day, how many trips were finished in the trip
            wizard, how many partner links were pressed and how many AI requests
            were sent. These are daily totals with no account, address or device
            attached, so they are not personal data.
          </p>

          <p>
            Emails from Carta are sent through Resend, an email delivery
            service that sends them on Carta's behalf from the United States.
            Carta emails you only in these cases: the confirmation link when
            you join the waitlist or the newsletter, the newsletter once you
            have confirmed, the trip reminders and price-drop emails you
            switch on in your account, and a price alert you saved and
            confirmed. Each rests on your consent (Article 6(1)(a)); every
            such email has an unsubscribe link, and unsubscribing withdraws
            your consent. Resend receives your address and the text of the
            email, under its Data Processing Addendum and the EU Standard
            Contractual Clauses. An address that joins the waitlist but is
            never confirmed is deleted after 30 days; a confirmed address is
            kept until you unsubscribe, and after that only so that we never
            mail it again (our legitimate interest, Article 6(1)(f)).
          </p>

          <h3>Retention and deletion</h3>
          <p>
            Account data is kept until you delete it. You can delete your account
            and everything stored with it at any time from the Account panel
            ("Delete my account"); deletion is immediate and irreversible. A
            few records stay without anything that links them to you: the
            record of a pass purchase (what was bought, when, the price, the
            VAT and the billing country), which tax law makes us keep for
            several years (up to ten); pass offer events; AI
            failure records; and guide reports you filed, without your contact
            details. Your feedback is deleted with your account (if any is
            left after the deletion, write to us and we delete it by hand). Local
            data on your device is removed by clearing the site data in your
            browser. You can also revoke consent or request deletion by mail:
            {' '}<a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>

          <h3>Legal basis for processing</h3>
          <p>
            Carta processes your personal data under the following legal grounds
            under Article 6 of the GDPR:
          </p>
          <table className="privacy-table">
            <thead>
              <tr>
                <th>Data category</th>
                <th>Purpose</th>
                <th>Legal basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Email, name, saved trips and plans</td>
                <td>Account management and syncing your data across devices</td>
                <td>Contract (Article 6(1)(b))</td>
              </tr>
              <tr>
                <td>What you send to the AI features</td>
                <td>Producing the day plan, suggestion or import you asked for</td>
                <td>Contract (Article 6(1)(b))</td>
              </tr>
              <tr>
                <td>Passes you buy</td>
                <td>Providing the pass; the billing country for VAT</td>
                <td>Contract (Article 6(1)(b)); legal obligation (Article 6(1)(c))</td>
              </tr>
              <tr>
                <td>User signups, engagement, top destinations, pass offer events</td>
                <td>Understanding how the app is used to improve it</td>
                <td>Legitimate interest (Article 6(1)(f))</td>
              </tr>
              <tr>
                <td>AI failure records, guide view hashes</td>
                <td>Keeping the service working; counting guide views</td>
                <td>Legitimate interest (Article 6(1)(f))</td>
              </tr>
              <tr>
                <td>Your location</td>
                <td>Address geocoding when you request it</td>
                <td>Consent (Article 6(1)(a))</td>
              </tr>
              <tr>
                <td>Your Ask Carta questions and saved chats</td>
                <td>Answering your question; keeping your chats in your account</td>
                <td>Contract (Article 6(1)(b))</td>
              </tr>
              <tr>
                <td>Waitlist, newsletter, trip reminders, price drops and price alerts</td>
                <td>Sending the emails you asked for</td>
                <td>Consent (Article 6(1)(a))</td>
              </tr>
              <tr>
                <td>Photos and tracks you upload</td>
                <td>Reviewing and showing them</td>
                <td>Contract (Article 6(1)(b))</td>
              </tr>
              <tr>
                <td>Guide reports and statements of reasons</td>
                <td>Handling notices about public guides</td>
                <td>Legal obligation (Article 6(1)(c), Digital Services Act)</td>
              </tr>
              <tr>
                <td>Feedback and AI answer reports</td>
                <td>Answering you; fixing wrong answers</td>
                <td>Legitimate interest (Article 6(1)(f)): replying to you and fixing wrong answers</td>
              </tr>
            </tbody>
          </table>

          <h3>Retention of analytics events</h3>
          <p>
            The admin panel's counts of signups, active users (daily, weekly,
            monthly) and the most planned destinations and countries are worked
            out from the account records and saved trips themselves, not from
            a log of what you do in the app.
          </p>
          <p>
            The one such log is the pass offer log. When the pass offer
            opens, closes or sends you to checkout, Carta writes down which of
            the three happened, why the offer appeared and which pass you held,
            with your account if you are signed in. These events are kept for
            180 days and then deleted.
          </p>

          <h3>Your rights</h3>
          <p>
            Under the GDPR you can request access to, correction of, or deletion
            of your personal data, and you can withdraw consent at any time.
            Signed in, you can download everything your account holds as one
            file from the Account panel ("Your data"): your trips and stops, day
            plans, profile, friends, co-planners and shares, passes and
            purchases, pass offer events, AI usage and failure records, feedback,
            the guide reports
            you filed, any moderation statement about your guides, and what an
            admin did to your account.
            Write to the address above for anything else and you will get an
            answer within one month. You can also ask us to restrict
            processing, object to processing that rests on our legitimate
            interest, and receive the data you gave us in a machine-readable
            file (the download above). If you think we handle your data
            wrongly, you may complain to the Belgian Data Protection Authority
            (Gegevensbeschermingsautoriteit / Autorite de protection des
            donnees, Drukpersstraat 35, 1000 Brussels,
            gegevensbeschermingsautoriteit.be) or to the data protection
            authority of the EU country where you live.
          </p>
    </LegalDoc>
  );
}
