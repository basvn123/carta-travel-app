import React from 'react';

/* The licence names behind a credit line. The plain credit stays visible next
   to the data; the technical names wait in a collapsed row. */
export default function CreditFold({ t, licenceKeys }) {
  return (
    <details className="credit-fold" data-testid="credit-fold">
      <summary>{t('credit.where')}</summary>
      {licenceKeys.map((k) => <p key={k}>{t(k)}</p>)}
    </details>
  );
}
