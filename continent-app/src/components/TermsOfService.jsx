import React, { useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';

/**
 * The Terms of Service, readable inside the app and reachable by URL
 * (?legal=terms, see LegalFromUrl.jsx), which is the address Stripe Checkout
 * links to from its consent checkbox.
 *
 * Same overlay+modal pattern as PrivacyPolicy.jsx and Imprint.jsx. English
 * only, like the other two legal texts: a translated contract that drifts from
 * the English one is worse than one language, and the pass modal's own line
 * about the terms is translated in all six locales.
 *
 * What these terms have to carry, and why (T013, Legal.md item 2):
 *
 *  - What a pass buys and does not. Both passes are one-off payments for a
 *    fixed number of days, never a subscription (checkout/index.ts).
 *  - The 14-day right of withdrawal and the express waiver for a pass that
 *    starts at once. The waiver itself is collected as a checkbox on the
 *    Stripe Checkout page (consent_collection in the checkout function); the
 *    section here is what that checkbox refers to.
 *  - The estimates paragraph. Every figure is a modelled or measured estimate
 *    with provenance, and no operator's live prices are republished. This is
 *    the closed Ryanair decision written down where it belongs. Since T273
 *    (owner decision 2026-10-02) Carta prices no flights: the only flight
 *    figure in a total is the one the traveller typed (T319 wording).
 *  - That Carta is not a travel agent and sells no travel.
 *  - Liability limits that stay inside what Belgian consumer law allows.
 *  - Belgian law, Belgian courts, the Belgian consumer mediation service.
 *
 * Numbers are kept OUT of this text on purpose. Pass prices, day counts and
 * fair-use ceilings live in lib/pricing.js and public.plan_tiers and are shown
 * next to each pass before anyone buys; a copy here would rot the first time
 * they are retuned. The terms refer to "the figures shown at purchase".
 *
 * The legal identity of the provider lives in Imprint.jsx (T015 fills it in),
 * so these terms point there rather than repeating placeholders.
 */
const UPDATED = '3 October 2026';
const CONTACT = 'bas.vannieuwenhuyse123@gmail.com';

export function TermsOfService({ onClose }) {
  // A dialog for the keyboard and a screen reader too (T186): focus moves in,
  // Tab stays inside, Escape closes it and focus goes back to the opener.
  const cardRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap(cardRef, onClose, { initialFocusRef: closeRef });
  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal privacy-modal" ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="legal-terms-title" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} className="panel-close auth-close" onClick={onClose} aria-label="Close">x</button>
        <h2 className="auth-title" id="legal-terms-title">Terms of service</h2>
        <p className="privacy-updated">Last updated {UPDATED}</p>

        <div className="privacy-body">
          <h3>Who provides Carta</h3>
          <p>
            Carta is operated from Belgium by the person or company named in
            the Imprint, which you can open from the Account panel. That page
            carries the legal name, address, enterprise number and contact
            details. In these terms "Carta", "we" and "us" mean that provider,
            and "you" means the person using the app.
          </p>
          <p>
            These terms apply to every use of Carta, with or without an
            account, and to every pass bought through it. The privacy policy,
            also in the Account panel, explains what happens to your data and
            is part of the agreement between us.
          </p>

          <h3>What Carta is, and what it is not</h3>
          <p>
            Carta is a planning tool. It estimates what a trip in Europe is
            likely to cost, helps you choose a destination, and helps you plan
            your days there. It shows you figures, places and routes so you can
            decide for yourself.
          </p>
          <p>
            Carta is not a travel agent, a tour operator or a ticket seller. We
            do not sell flights, trains, buses, ferries, rooms, tours or any
            other travel service, and we never take a booking on your behalf.
            When you press a link to an airline, a rail operator, a booking
            site or a map, you leave Carta and deal with that company under its
            own terms and prices. Some of those links are affiliate links: if
            you book, the company may pay us a commission. That never changes
            the price you pay, and it never changes which figure Carta shows
            you as cheapest.
          </p>
          <p>
            Because Carta sells no travel service, the rules on package travel
            and linked travel arrangements do not apply to it, and the
            protections that come with a package (financial insolvency cover,
            liability for the performance of the trip) are not something Carta
            provides. Those protections come from whoever you actually book
            with.
          </p>

          <h3>Every figure is an estimate</h3>
          <p>
            Carta publishes modelled and measured estimates with their
            provenance. It does not republish any operator's live prices.
          </p>
          <p>
            Carta does not price flights. No flight figure of ours appears on
            a screen or in a total. A flight counts in a total only when you
            type in what you paid, and that figure is yours, shown as yours;
            we do not check it.
          </p>
          <p>
            A ground fare (a train, bus or ferry leg, local transport, an
            airport transfer) is our estimate of what that journey typically
            costs, built from per-kilometre fare levels for each country and
            mode and calibrated on prices we have observed. Stay prices, food
            and daily budgets are estimates in the same sense: typical figures
            for a place and a travel style, not an offer to sell anything at
            that price. Where a figure rests on a measured price, the screen
            names its source and says when it was observed; where it is a
            model, the screen says so.
          </p>
          <p>
            An estimate is not a quote. The only price that counts is the one
            the operator shows you when you book, and it will differ from
            Carta's figure, sometimes by a lot, because fares move by the hour,
            because operators add fees, and because a model cannot see a sale
            that starts tomorrow. Check the figure at the operator before you
            commit money, and treat Carta's totals as a budget to plan around,
            not a promise. A total leaves your flights out unless you entered
            your own fare.
          </p>
          <p>
            The same applies to every other fact in the app: opening hours,
            bathing water classes, trail grades, climate, distances, walking
            times and place descriptions come from public and open data
            sources, are combined and rewritten by us, and can be out of date
            or wrong. The Data sources screen in the Account panel names the
            source of every layer. Nothing in Carta replaces checking with the
            place itself, and nothing in it is advice about whether a trip,
            a route, a swim or a climb is safe for you.
          </p>

          <h3>The Carta bot and other AI features</h3>
          <p>
            Day plans, booking imports and live search are produced with the
            help of a large language model. Its output can be confidently
            wrong: an opening time that no longer holds, a place that has
            closed, a walking time that is optimistic, a booking reference read
            back with one digit off. Read what it gives you before you act on
            it. You are responsible for the bookings you make and the routes you
            walk. AI output is provided as a starting point for your own
            planning and is not a service you can hold us to in the way you
            could hold a travel agent to an itinerary.
          </p>

          <h3>Your account</h3>
          <p>
            You can use the map, the destination pages and one trip without an
            account. Saving more than one trip, syncing across devices, the
            Carta bot and every pass need an account, because a pass is granted
            to an account. Keep your sign-in details to yourself and tell us if
            you think somebody else is using them. You must be at least 18 to
            buy a pass; younger travellers may use the free features and may
            have a parent or guardian buy a pass on their account.
          </p>

          <h3>What a pass buys</h3>
          <p>
            A pass is a fixed number of days of access to Carta's paid features,
            bought once. The Trip Pass and the Year Pass differ only in how many
            days they run and in their fair-use ceilings. Both start the moment
            your payment completes and end on their own on the last day. There
            is no renewal and no recurring charge. When a pass ends, your trips
            and plans stay saved and readable; only the paid actions stop until
            you buy another.
          </p>
          <p>
            The paid features, at the date above, are: Carta bot day plans up
            to a fair-use ceiling, live web search for events and opening
            hours up to a separate ceiling, exporting plans as PDF, calendar
            and map files, importing booking confirmations, saving more than
            one trip, and planning together with other people. The exact days
            and ceilings for each pass are shown next to it before you buy and
            on your Account page afterwards, and those figures, not any number
            in this text, are what you are buying. The ceilings exist because
            every plan and every search costs us money; they are sized well
            above what planning a trip uses, and they are not a promise of a
            minimum number you will need.
          </p>
          <p>
            A pass is personal to one account and cannot be transferred, sold
            or shared. It is a licence to use the features above for its term;
            it does not give you any right in Carta's data, models or software
            beyond that use.
          </p>

          <h3>What a pass does not buy</h3>
          <p>
            A pass does not buy travel, tickets, rooms or any booking. It does
            not buy a guarantee that any estimate will match a real price, that
            the Carta bot will be right, that any place will be open, or that
            the app will be available every minute of its term. It does not buy
            priority support. And it does not buy features that we describe as
            coming soon; only what is listed and working on the day you pay.
          </p>

          <h3>Price and payment</h3>
          <p>
            Prices are in euros and include VAT at the rate that applies where
            you are. The price shown on the pass table and again on the
            checkout page is the full amount you pay; there is nothing added
            afterwards. Payment is taken by Stripe, our payment processor, by
            card or iDEAL, and Stripe sends you the receipt. We never see or
            store your card number. If a payment fails, nothing is charged and
            no pass is granted.
          </p>

          <h3>Your right to withdraw, and why checkout asks you to waive it</h3>
          <p>
            Under EU consumer law (Directive 2011/83/EU, carried into Belgian
            law in Book VI of the Code of Economic Law) you may withdraw from a
            distance purchase within 14 days without giving a reason. A pass is
            digital content supplied online, and the law lets that right end
            early when you expressly ask for the content to be supplied at once
            and acknowledge that you lose the right by doing so.
          </p>
          <p>
            A pass is useful only if it starts straight away, so the Stripe
            checkout page asks you to tick a box confirming exactly that: you
            want your pass to begin as soon as payment completes, and you
            understand that your 14-day right of withdrawal ends when it does.
            You cannot buy a pass without ticking it. If you would rather keep
            the full 14 days, do not buy; the free features remain available
            and nothing is lost.
          </p>

          <h3>Refunds</h3>
          <p>
            Beyond your legal rights we refund in three cases. First, if you
            ask within 14 days of buying and you have used no Carta bot plan,
            no live search and no export on that pass, we refund the whole
            amount, no questions asked. Second, if the paid features are
            unavailable through our fault for a substantial part of your pass,
            we extend the pass by the days lost or, if you prefer, refund the
            unused share. Third, if we withdraw or materially reduce a paid
            feature during your pass, you may ask for the unused share back.
          </p>
          <p>
            Ask by email at the address below, from the address on your
            account. Refunds go back through Stripe to the payment method you
            used and usually arrive within ten working days. Outside these
            cases a pass that has started is not refunded, which is what the
            checkout waiver means. Nothing here reduces the rights you have
            under Belgian law if the digital content we supply does not
            conform to what was agreed (Book VI, Title 4, Chapter 1/1 of the
            Code of Economic Law).
          </p>

          <h3>Your content and how you may use Carta</h3>
          <p>
            Your trips, plans, notes and imported bookings are yours. You give
            us the right to store, process and display them so the app can
            work, and to send the parts you choose to the services named in
            the privacy policy. If you share a trip or plan together, the people
            you invite see what you shared.
          </p>
          <p>
            Do not use Carta to harvest its data at scale, resell access, run
            automated clients against the paid features, share an account,
            attack the service, or break the law. The fair-use ceilings are a
            cost control and not an invitation to script against them. If we
            see abuse we may suspend or end an account; if it was an honest
            mistake we refund the unused share of any pass, and if it was not
            we do not.
          </p>
          <p>
            Parts of what Carta shows you come from open data under licences
            that ask for credit, above all OpenStreetMap contributors and the
            photographers who publish on Wikimedia Commons and Geograph. Those
            credits travel with the files you export. Keep them if you pass an
            export on.
          </p>

          <h3>Availability and changes</h3>
          <p>
            We aim to keep Carta up and improving, and we do not guarantee it
            will be. Data refreshes, deployments and third-party outages can
            interrupt it. We may add, change or retire features and data layers;
            if a change takes away something a running pass paid for, the
            refund rule above applies. We will give account holders at least 30
            days' notice by email before a change to these terms takes effect,
            and a pass already running stays under the terms it was bought
            under.
          </p>

          <h3>Liability</h3>
          <p>
            Carta is a planning aid and its figures are estimates. To the
            extent the law allows, we are not liable for money you spend, or
            lose, in reliance on an estimate, a route, an AI plan or any other
            fact in the app: a fare that turned out higher, a place that was
            closed, a connection that was missed, a trip that cost more than
            the budget. Where we are liable, our total liability to you for
            everything arising out of Carta in any twelve-month period is
            limited to the amount you paid us for passes in that period.
          </p>
          <p>
            Nothing in these terms limits or excludes our liability for fraud,
            for intent or gross negligence on our part, for death or personal
            injury caused by our negligence, or for anything that Belgian
            consumer law does not let a business exclude. Your statutory
            rights as a consumer, including your rights when digital content
            does not conform, are not affected.
          </p>

          <h3>Ending the agreement</h3>
          <p>
            You can stop using Carta at any time, and you can delete your
            account and everything stored with it from the Account panel.
            Deleting an account ends any pass on it; the unused share is
            refunded only in the cases listed under Refunds. We may close an
            account for the abuse described above, or if Carta itself closes,
            in which case running passes are refunded for their unused share.
          </p>

          <h3>Governing law and disputes</h3>
          <p>
            These terms are governed by Belgian law. If you live in another EU
            country, you keep the protection of any mandatory consumer rules of
            your own country that give you more than Belgian law does. Disputes
            go to the competent courts in Belgium, or, where the law gives you
            the choice, to the courts of the country where you live.
          </p>
          <p>
            Write to us first; most problems are a misread estimate or a pass
            that landed late, and both are fixed in a day. If we cannot agree,
            you may take a consumer dispute to the Belgian Consumer Mediation
            Service (Consumentenombudsdienst / Service de Médiation pour le
            Consommateur, consumentenombudsdienst.be), or to the alternative
            dispute resolution body for consumers in your own EU country.
          </p>

          <h3>Contact</h3>
          <p>
            Questions about these terms, refund requests and notices go to
            {' '}<a href={`mailto:${CONTACT}`}>{CONTACT}</a>. You will get an
            answer within 30 days, and for a refund request usually within a
            few working days.
          </p>
        </div>
      </div>
    </div>
  );
}
