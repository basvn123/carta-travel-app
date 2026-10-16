/** "2 adults, 1 child": the party in words, through i18n (T458). */
export function partyText(t, { adults = 1, children = 0, babies = 0 } = {}) {
  const bits = [t(adults === 1 ? 'plan.partyAdultOne' : 'plan.partyAdultMany', { n: adults })];
  if (children) bits.push(t(children === 1 ? 'plan.partyChildOne' : 'plan.partyChildMany', { n: children }));
  if (babies) bits.push(t(babies === 1 ? 'plan.partyBabyOne' : 'plan.partyBabyMany', { n: babies }));
  return bits.join(', ');
}
