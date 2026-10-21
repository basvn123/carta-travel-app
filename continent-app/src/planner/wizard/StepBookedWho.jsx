import React from 'react';
import { SparkIcon, BedIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { Tile, TileGroup } from '../../components/ui/index.js';
import { LifestyleChoices } from '../LifestyleChoices.jsx';
import { PartyEditor } from '../PartyEditor.jsx';
import { useI18n } from '../../i18n/index.jsx';

// What can already be booked when someone opens the planner. These two
// answers take questions AWAY:
//
//   travel   Carta stops asking how you get there and asks where you arrive
//   stays    Carta stops choosing cities and you type the ones you hold
const BOOKED_BITS = [
  { key: 'travel', Icon: PlaneIcon, labelKey: 'plan.bookedTravel' },
  { key: 'stays', Icon: BedIcon, labelKey: 'plan.bookedStays' },
];

// The third answer, which used to be no answer at all. Holding nothing is the
// commonest way into the planner, and a screen whose correct answer is to
// touch nothing reads as a screen you have not finished. Picking it clears
// the other two rather than adding a third flag.
const BOOKED_NONE = { key: 'none', Icon: SparkIcon, labelKey: 'plan.bookedNone' };

/**
 * The first step (T490-c, owner): what is already booked, then who is going
 * and how they like to travel. One screen, two questions, neither blocking:
 * holding nothing is a valid answer and the party always has its default.
 * The party and the Lifestyle multiply every figure after this step, so they
 * are answered before the first price.
 */
export function StepBookedWho({ titleTag, booked, setBooked, party, setParty }) {
  const { t } = useI18n();
  const StepTitle = titleTag;
  const SubTitle = StepTitle === 'h1' ? 'h2' : 'h3';
  const bookedNothing = !booked.travel && !booked.stays;
  const toggleBooked = (key) => setBooked((prev) => ({ ...prev, [key]: !prev[key] }));
  return (
    <>
      <StepTitle className="guide-title">{t('wizard.alreadyBooked')}</StepTitle>
      <TileGroup label={t('wizard.alreadyBooked')} columns={3} className="wbook-tiles">
        {BOOKED_BITS.map((b) => (
          <Tile
            key={b.key}
            className="wbook-tile"
            selected={booked[b.key]}
            icon={<b.Icon size={32} />}
            onClick={() => toggleBooked(b.key)}
          >
            {t(b.labelKey)}
          </Tile>
        ))}
        <Tile
          className="wbook-tile"
          selected={bookedNothing}
          icon={<BOOKED_NONE.Icon size={32} />}
          onClick={() => setBooked({ travel: false, stays: false })}
        >
          {t(BOOKED_NONE.labelKey)}
        </Tile>
      </TileGroup>

      <section className="wwho wbw-who" aria-labelledby="wbw-who-h">
        <SubTitle className="wbw-h" id="wbw-who-h">{t('plan.whoTitle')}</SubTitle>
        <div className="wwho-party">
          <PartyEditor value={party} onChange={setParty} size="main" />
        </div>
        <LifestyleChoices />
      </section>
    </>
  );
}
