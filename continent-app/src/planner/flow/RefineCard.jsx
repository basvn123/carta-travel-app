import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { ArrowRightIcon, BedIcon, SparkIcon } from '../../components/Icons.jsx';

/**
 * The refine card (T1103, ROADMAP G12): on the priced trips straight after
 * the short setup, what the prices rest on so far (the airport, the dates,
 * the people) and the one way to fit them closer, the help-me-choose
 * questions. Where they sleep moves the bed's price the most, so it has
 * its own door. Gone once the questions are walked.
 *
 *   onFit()    walk the help-me-choose questions, back to the trips
 *   onSleep()  the where-you-sleep screen, back to the trips
 *   count      T1123 (G4): how many questions Fit these to me asks, said
 *              before they start (0 leaves the count out)
 */
export function RefineCard({ onFit, onSleep, count = 0 }) {
  const { t } = useI18n();
  return (
    <section className="pf-refine" aria-labelledby="pf-refine-title">
      <span className="pf-refine-icon" aria-hidden="true"><SparkIcon size={20} /></span>
      <div className="pf-refine-text">
        <h3 className="pf-refine-title" id="pf-refine-title">{t('pf.refine.title')}</h3>
        <p className="pf-refine-sub">{t('pf.refine.sub')}{count > 0 ? ` ${t('pf.refine.count', { n: count })}` : ''}</p>
      </div>
      <div className="pf-refine-acts">
        <Button variant="quiet" size="sm" className="pf-refine-sleep" iconStart={<BedIcon size={16} />} onClick={onSleep}>
          {t('pf.refine.sleep')}
        </Button>
        <Button variant="secondary" size="sm" className="pf-refine-go" iconEnd={<ArrowRightIcon size={16} />} onClick={onFit}>
          {t('pf.refine.go')}
        </Button>
      </div>
    </section>
  );
}
