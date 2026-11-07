// One shared empty catalogue for the moments before data lands. A fresh `{}`
// per render would hand every memo below a new dependency each time and
// rebuild the country and city lists on every render (T192).
export const NO_DESTINATIONS = Object.freeze({});

// The receipt the total bar opens (one per planner view).
export const RECEIPT_ID = 'trip-receipt';
