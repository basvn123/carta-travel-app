import React from 'react';

/* The licence names behind a credit line. The plain credit stays visible next
   to the data; the technical names wait in a collapsed row. The detail-page
   skeleton (T180) passes the page's sources, figure split and last-checked
   month as children, so slot 10 is this same row. */
export default function CreditFold({ t, licenceKeys = [], children = null }) {
  return (
    <details className="credit-fold" data-testid="credit-fold">
      <summary>{t('credit.where')}</summary>
      {children}
      {licenceKeys.map((k) => <p key={k}>{t(k)}</p>)}
    </details>
  );
}
