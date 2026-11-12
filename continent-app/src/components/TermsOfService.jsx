import React from 'react';
import { CONTACT } from '../lib/contact.js';
import { LegalDoc } from './LegalDoc.jsx';

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
 *    fixed number of days; the Year Pass is a 12-month pass that ends by
 *    itself and never renews (ROADMAP I-f, decision 0007, row T460-b).
 *  - The 14-day right of withdrawal. A pass is a digital service in the
 *    sense of Directive 2011/83/EU Art 2(16) (it lets the traveller create,
 *    store and share data online; compare CJEU C-641/19 PE Digital), not
 *    digital content under Art 16(m). So the request to start at once does
 *    not end the right: a withdrawal within 14 days pays for the days used
 *    (Art 14(3): proportionate to the agreed price; C-641/19; read
 *    C-234/25 before T227), and the right ends only once the pass has
 *    fully run (Art 16(a)). Self-review T032-e,
 *    2026-11-12. The request to start is a checkbox on the Stripe Checkout
 *    page (consent_collection in the checkout function).
 *  - The estimates paragraph. Every figure is a modelled or measured estimate
 *    with provenance, and no operator's live prices are republished. This is
 *    the closed Ryanair decision written down where it belongs. Since
 *    T511 to T519 (2026-10-21) a flight shows the price Google Flights
 *    showed when checked, labelled as such and not an offer (wording
 *    self-reviewed against Directive 2005/29/EC Art 6 and 7, T519-a,
 *    2026-11-12).
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
 *
 * SELF-REVIEWED 2026-11-12 (row T365-c, ROADMAP I1: no lawyer, decision 0007).
 * The section "Public guides: the content rule" was checked against the
 * Digital Services Act: Art 14(1) (restrictions, human review and the
 * complaint route stated in plain words), Art 16(2)(d) (the report form's
 * good-faith line, guides.reportGoodFaith), Art 17 (statement of reasons
 * naming the item) and Art 20 and 21 (six months to contest, out-of-court
 * body). No wording change was needed. Its seven items are the only values
 * migration 051 accepts as a 'terms' ground ('c1' to 'c7', in this order);
 * the owner's statement shows their titles through the moderation.rule.*
 * keys in the six catalogues. Renumbering or rewording an item here means
 * changing those keys, and removing one means a migration.
 */
const UPDATED = '12 November 2026';

export function TermsOfService({ onClose }) {
  // A dialog for the keyboard and a screen reader too (T186): focus moves in,
  // Tab stays inside, Escape closes it and focus goes back to the opener.
  return (
    <LegalDoc id="legal-terms" title="Terms of service" updated={UPDATED} onClose={onClose}>
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
            provenance. The one exception is flights, below.
          </p>
          <p>
            A flight price on Carta is the price Google Flights showed for that
            flight when we checked it, with the airline, the times and the time
            of that check beside it. It is not an offer: Carta sells no tickets,
            the price can change or the seat can sell out before you book, and
            the booking site's price is the one that counts. A bag fee added to
            a flight is our estimate of what that airline usually charges. A
            fare you type in replaces ours, and that figure is yours, shown as
            yours; we do not check it.
          </p>
          <p>
            A ground fare (a train, bus or ferry leg, local transport, an
            airport transfer) is our estimate of what that journey typically
            costs, built from per-kilometre fare levels for each country and
            mode and calibrated on prices we have observed. Stay prices, food
            and daily budgets are estimates in the same sense: typical figures
            for a place and a travel style, not an offer to sell anything at
            that price. A figure the app could not measure for the place
            itself, and took from its country's level instead, carries the
            mark "est." on the screen.
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
            or wrong. The data credits in the Imprint name the open sources
            Carta is built on. Nothing in Carta replaces checking with the
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
            There are two passes for Carta's paid features, and both are
            bought once. The Trip Pass runs for a fixed number of days and the
            Year Pass for twelve months. Each starts the moment your payment
            completes and ends on its own on its last day: neither renews, and
            nothing is ever charged again after the one payment. The two
            differ only in how long they run and in their fair-use ceilings.
            When a pass ends, your trips and plans stay saved and readable;
            only the paid actions stop until you buy again.
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
          <p>
            If we change a price, the new price applies only to passes bought
            after the change. A pass you hold keeps the price you paid.
          </p>

          <h3>Passes do not renew</h3>
          <p>
            No pass renews, so there is nothing to cancel and no charge
            follows the one you made. You can buy a new pass whenever you
            like.
          </p>

          <h3>Your right to withdraw</h3>
          <p>
            Under EU consumer law (Directive 2011/83/EU, carried into Belgian
            law in Book VI of the Code of Economic Law) you may withdraw from
            a pass within 14 days of the day you bought it, without giving a
            reason. A pass gives you access to an online service, so the law
            treats it as a digital service.
          </p>
          <p>
            A pass is useful only if it starts straight away, so the Stripe
            checkout page asks you to tick a box asking us to start your pass
            as soon as payment completes. Starting at once does not take your
            right away. If you withdraw within the 14 days, we refund what you
            paid minus the share for the days your pass ran until you told us,
            counted day by day over the full length of the pass. If the pass
            has already run its full length, the right has ended, because the
            service has been supplied in full.
          </p>
          <p>
            The Trip Pass runs 60 days and the Year Pass 365. Example: a
            Trip Pass (EUR 6.99) withdrawn after 3 days is refunded EUR 6.99
            x 57/60 = EUR 6.64.
          </p>
          <p>
            To withdraw, tell us clearly before the 14 days are over, for
            example by email from the address on your account to the address
            under Contact. You may use this model form, but you do not have
            to:
          </p>
          <p className="legal-form">
            To: the provider named in the Imprint, {CONTACT}<br />
            I hereby give notice that I withdraw from my contract for the provision of the following service: [Trip Pass or Year Pass]<br />
            Bought on: [date]<br />
            Name: [your name]<br />
            Address: [your address]<br />
            Date: [date]
          </p>
          <p>
            We refund without undue delay and at the latest 14 days after your
            message reaches us, through Stripe to the payment method you used,
            at no cost to you.
          </p>

          <h3>Refunds</h3>
          <p>
            Beyond your right to withdraw we refund in three cases. First, if
            you ask within 14 days of buying and you have used no Carta bot
            plan, no live search and no export on that pass, we refund the
            whole amount, not only the unused share. Second, if the paid
            features are
            unavailable through our fault for a substantial part of your pass,
            we extend the pass by the days lost or, if you prefer, refund the
            unused share. Third, if we withdraw or materially reduce a paid
            feature during your pass, you may ask for the unused share back.
          </p>
          <p>
            Ask by email at the address below, from the address on your
            account. Refunds go back through Stripe to the payment method you
            used and usually arrive within ten working days. Outside these
            cases and your right to withdraw, a pass is not refunded. Nothing
            here reduces the rights you have
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

          <h3 id="content-rule">Public guides: the content rule</h3>
          <p>
            You can publish a trip to the public guides, where anyone can read
            it. A published guide is your content and you are responsible for
            it. It must not contain any of the following. Each item has a
            number, and if we take a guide down under this rule, the
            statement we give you names the item.
          </p>
          <ol>
            <li>
              Other people's personal data: an address, phone number, email
              address, photograph or private detail of someone who has not
              agreed to its publication.
            </li>
            <li>
              Advertising and spam: promotion of a business, referral or
              discount codes, contact details for selling something, or the
              same guide published again and again.
            </li>
            <li>Hate, harassment or threats against a person or a group.</li>
            <li>Sexual or violent content.</li>
            <li>
              Dangerous or misleading content: information you know to be
              false, or encouragement to break the law or to put yourself or
              others in danger, such as entering a closed or protected area.
            </li>
            <li>
              Someone else's work: text, photographs or maps copied without the
              right to publish them.
            </li>
            <li>
              Content that is not a travel guide, or a guide used to send
              messages to other people.
            </li>
          </ol>
          <p>
            Content that is illegal is taken down whether or not it is listed
            above; the statement then names the law we relied on instead of an
            item.
          </p>
          <p>
            Anyone can report a public guide from the guide itself, with or
            without an account, and we read every report. If we take a guide
            down, it leaves the public guides and its share links stop
            working. The trip stays in your account and nothing in it is
            deleted. In My trips you get a statement of reasons: what we did,
            why, on which ground, and how to contest it. You can contest it
            there, free of charge, for six months, and a person reads and
            answers every complaint. While the decision stands, the guide
            cannot be published again; if we reverse it, you can. You can also
            take the decision to a certified out-of-court dispute settlement
            body or to a court.
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
          <p>
            The changes of 12 November 2026 to uploads apply from the date in
            the notice email; the other changes apply to purchases made after
            that date.
          </p>

          {/* T333: the licence an upload needs (destinations spec 2.8, rows
              T206-b and T141). Transferable and sublicensable are the two
              words a grant usually forgets; the credit promise replaces a
              moral-rights waiver, which is void in France, Germany, Spain
              and Italy. Self-reviewed 2026-11-12 (rows T333-b and T206-c):
              the consumer indemnity is gone (Directive 93/13/EEC Art 3 and
              Annex; Code of Economic Law Art VI.82), the licence ends on
              removal instead of claiming to be irrevocable, and the
              OpenStreetMap paragraph names the grant the OSMF Contributor
              Terms clause 2 needs. If this section changes, change
              UPLOAD_TERMS_VERSION in community/uploads.js too. */}
          <h3>Photos and tracks you share</h3>
          <p>
            You may send Carta a photo or a GPS track of a place in the app.
            A person checks every upload before it appears. If we decline or
            later remove an upload because we believe it is illegal or breaks
            these terms, we tell you why and how to ask us to look again.
          </p>
          <p>
            You keep the copyright in what you share. By sending it you give
            Carta a worldwide, non-exclusive, royalty-free licence to store,
            copy, adapt (crop, resize, re-encode), publish and display it, in
            the app and wherever Carta appears. Carta may pass this licence on
            to others (sublicense it), and may transfer it, for example to
            whoever takes Carta over. The licence lasts as long as the upload
            is on Carta. When you ask us to remove an upload, or delete your
            account, we take it off Carta and the licence ends; what was
            lawfully done under it before then stays lawful, such as a copy
            someone made under a Creative Commons licence you chose, or a
            track you allowed us to give to OpenStreetMap.
          </p>
          <p>
            We credit you, by the name you give with the upload, wherever
            Carta shows it, and anyone we pass it on to must credit you the
            same way. Where the law of your country gives you moral rights, such
            as the right to be named and to object to a distortion of your
            work, nothing in these terms asks you to give them up.
          </p>
          <p>
            With each upload you also choose who else may reuse it: Carta
            only, Creative Commons Attribution 4.0 (CC BY 4.0), or Creative
            Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0). A Creative
            Commons licence is one you grant to everyone, and it cannot be
            withdrawn for copies made while it applied. It comes on top of the
            licence to Carta above and does not replace it.
          </p>
          <p>
            For a track there is a separate box. Ticking it allows Carta to
            give the track to OpenStreetMap, whose foundation (the
            OpenStreetMap Foundation) may then use it under the OpenStreetMap
            Contributor Terms. Those terms let it use the track for any
            purpose, commercial ones included, for good and without a way to
            take it back, and publish map data drawn from it under the Open
            Database License. Neither Creative Commons licence allows that by
            itself. Leave the box unticked and we do not offer your track to
            OpenStreetMap. Once a track has been given to OpenStreetMap,
            removing it from Carta does not remove it there.
          </p>
          <p>
            You promise that the upload is your own work or that you have the
            right to share it on these terms, that anyone who can be
            recognised in a photo agreed to it, and that it breaks no law. If
            one of those promises turns out not to be true, we may remove the
            upload, and you are responsible for it as the law provides.
          </p>
          <p>
            Before an upload leaves your device the app removes the place,
            camera and date details from a photo, and hides the start and end
            of a track together with its times and device data. Anyone may
            report an upload they believe is illegal, by email to the address
            under Contact or through the report link shown with each published
            upload.
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
            few working days; a notice of withdrawal is refunded within 14
            days of reaching us.
          </p>
    </LegalDoc>
  );
}
