import { useMemo } from 'react';
import { TRIP_PACES, TRIP_SCALES } from './destTabConsts.js';
import { DISTANCE_BANDS, GRADES, ASCENT_BANDS, ROUTE_TYPES, HIGHLIGHTS, SUITABILITY } from '../../lib/trailCards.js';
import { LoopIcon } from '../../components/Icons.jsx';
import { SAC_BANDS, DURATION_BANDS } from '../../lib/routeEffort.js';
import { CYCLE_FACET_GROUPS } from '../../lib/cycleStory.js';
import { BEACH_FACETS } from '../../lib/beachStory.js';
import { LAKE_FACETS } from '../../lib/lakeStory.js';
import { MOUNTAIN_FACETS } from '../../lib/mountainStory.js';

export function useFacetGroups({
  bands, beachCounts, beachFacets, beachRows, cat, climbs, cycleCounts, cycleFacets, cycleRows,
  cycleScope, durs, grades, hls, isBeachCat, isCycleCat, isItinCat, isLakeCat, isMountainCat,
  itinFacets, itinPace, itinScale, lakeCounts, lakeFacets, lakeRows, loopsOnly, mountainRows,
  mtnCounts, mtnFacets, reachOnly, sacs, setBeachFacets, setClimbs, setCycleFacets, setDurs,
  setGrades, setHls, setItinPace, setItinScale, setLakeFacets, setLoopsOnly, setMtnFacets,
  setReachOnly, setSacs, setShapes, setSuits, shapes, showCountryIndex, suits, t, toggleBand,
  toggleChip, trailFacets,
}) {
  // One description of what narrows THIS tab, rendered twice: as the chip row
  // in the toolbar and as the full set inside the Filters sheet. Built here
  // rather than in either of them so the two cannot drift apart.
  const facetGroups = useMemo(() => {
    const out = [];
    if (isItinCat) {
      out.push({
        key: 'pace',
        label: t('trip.askPace'),
        toolbar: true,
        onToggle: (k) => setItinPace((cur) => (cur === k ? null : k)),
        options: TRIP_PACES.map(({ key, labelKey }) => {
          const n = itinFacets.pace.get(key) || 0;
          const isOn = itinPace === key;
          return { key, label: t(labelKey), n, on: isOn, disabled: !n && !isOn };
        }),
      });
      out.push({
        key: 'scale',
        label: t('trip.askScale'),
        toolbar: true,
        onToggle: (k) => setItinScale((cur) => (cur === k ? null : k)),
        options: TRIP_SCALES.map(({ key, labelKey }) => {
          const n = itinFacets.scale.get(key) || 0;
          const isOn = itinScale === key;
          return { key, label: t(labelKey), n, on: isOn, disabled: !n && !isOn };
        }),
      });
    }
    if (cat === 'trails' && !showCountryIndex && trailFacets && trailFacets.total > 0) {
      // Six groups, in the order a walker decides in: how long have I got,
      // how hard do I want it, how much climb, where does it leave me, what
      // will I see, who is coming. A group with nothing to offer in this
      // country is not rendered at all rather than rendered empty.
      const fromCounts = (key, label, defs, on, counts, setter) => {
        const options = defs
          .map((d) => {
            const n = counts.get(d.key) || 0;
            const isOn = on.includes(d.key);
            return { key: d.key, label: t(d.labelKey), n, on: isOn,
              disabled: !n && !isOn };
          })
          .filter((o) => o.n > 0 || o.on);
        if (!options.length) return;
        out.push({ key, label, onToggle: toggleChip(setter), options });
      };

      const lengthOpts = DISTANCE_BANDS.map(({ key, labelKey }) => {
        const n = trailFacets.byBand.get(key) || 0;
        const isOn = bands.includes(key);
        return { key, label: t(labelKey), n, on: isOn, disabled: !n && !isOn };
      });
      if (trailFacets.loops > 0) {
        lengthOpts.push({
          key: 'loop',
          Icon: LoopIcon,
          // Its own class because it is not a length: it rides at the end of
          // the same rail, since "two hours, and a loop" is one thought.
          cls: 'places-loopchip',
          label: t('trails.loopsOnly'),
          n: trailFacets.loops,
          on: loopsOnly,
        });
      }
      out.push({
        key: 'length',
        label: t('trails.lengthLabel'),
        // The one walk group inline: how long have I got is the first
        // question (T384, brief V3-1); the other five live in the sheet.
        toolbar: true,
        onToggle: (k) => (k === 'loop' ? setLoopsOnly((v) => !v) : toggleBand(k)),
        options: lengthOpts,
      });
      fromCounts('grade', t('trails.gradeLabel'), GRADES, grades,
        trailFacets.byGrade, setGrades);
      fromCounts('climb', t('trails.climbLabel'), ASCENT_BANDS, climbs,
        trailFacets.byClimb, setClimbs);
      fromCounts('shape', t('trails.shapeLabel'), ROUTE_TYPES, shapes,
        trailFacets.byShape, setShapes);
      fromCounts('highlights', t('trails.hlLabel'), HIGHLIGHTS, hls,
        trailFacets.byHl, setHls);
      fromCounts('suitability', t('trails.suitLabel'), SUITABILITY, suits,
        trailFacets.bySuit, setSuits);
      // T630: three groups that stay on screen even when no row can answer
      // them yet. A chip with no rows behind it is disabled and the group
      // says so (notYet), instead of the group being left out.
      const sacTotal = SAC_BANDS.reduce((n, d) => n + (trailFacets.bySac.get(d.key) || 0), 0);
      out.push({
        key: 'sac',
        label: t('route.facetSac'),
        notYet: sacTotal === 0,
        onToggle: toggleChip(setSacs),
        options: SAC_BANDS.map((d) => {
          const n = trailFacets.bySac.get(d.key) || 0;
          const isOn = sacs.includes(d.key);
          return { key: d.key, label: t(d.labelKey), n, on: isOn, disabled: !n && !isOn };
        }),
      });
      out.push({
        key: 'duration',
        label: t('route.facetDuration'),
        onToggle: toggleChip(setDurs),
        options: DURATION_BANDS.map((d) => {
          const n = trailFacets.byDur.get(d.key) || 0;
          const isOn = durs.includes(d.key);
          return { key: d.key, label: t(d.labelKey), n, on: isOn, disabled: !n && !isOn };
        }),
      });
      out.push({
        key: 'reach',
        label: t('route.facetTransit'),
        notYet: trailFacets.reach === 0,
        onToggle: () => setReachOnly((v) => !v),
        options: [{
          key: 'reach',
          label: t('route.facetTransitOn'),
          n: trailFacets.reach,
          on: reachOnly,
          disabled: trailFacets.reach === 0 && !reachOnly,
        }],
      });
    }
    if (isCycleCat && cycleRows && cycleScope.length > 0) {
      // Six groups, in the order a rider decides in. Same contract as the
      // beach chips: a count is the rows it would leave, a zero chip is not
      // rendered, and a chip already on survives at zero.
      for (const group of CYCLE_FACET_GROUPS) {
        const on = cycleFacets[group.key] || [];
        const options = group.options
          .map((o) => ({
            key: o.key,
            label: t(o.labelKey),
            n: cycleCounts.get(`${group.key}:${o.key}`) ?? 0,
            on: on.includes(o.key),
          }))
          .filter((o) => o.n > 0 || o.on);
        if (!options.length) continue;
        out.push({
          key: `cycle-${group.key}`,
          label: t(group.labelKey),
          toolbar: !!group.toolbar,
          onToggle: (k) => setCycleFacets((cur) => {
            const was = cur[group.key] || [];
            return { ...cur,
              [group.key]: was.includes(k) ? was.filter((x) => x !== k) : [...was, k] };
          }),
          options,
        });
      }
    }
    if (isBeachCat && beachRows) {
      // Nine groups (brief 03 section 4). Every chip carries a count, and a
      // chip whose count is zero in this scope is NOT RENDERED: not greyed
      // out, absent. A disabled control still occupies the rail and still
      // reads as something that ought to work, which is exactly the
      // impression "Nothing built on it 0" gave. A chip the reader has
      // already selected always survives, even at zero, or tapping it would
      // strand them in an empty list with no way back out.
      for (const group of BEACH_FACETS) {
        const on = beachFacets[group.key] || [];
        const options = group.options
          .map((o) => ({
            key: o.key,
            label: t(o.labelKey),
            n: beachCounts.get(`${group.key}:${o.key}`) ?? 0,
            on: on.includes(o.key),
          }))
          .filter((o) => o.n > 0 || o.on);
        if (!options.length) continue;
        out.push({
          key: `beach-${group.key}`,
          label: t(group.labelKey),
          toolbar: !!group.toolbar,
          onToggle: (k) => setBeachFacets((cur) => {
            const was = cur[group.key] || [];
            return { ...cur,
                     [group.key]: was.includes(k) ? was.filter((x) => x !== k)
                                                  : [...was, k] };
          }),
          options,
        });
      }
    }
    if (isLakeCat && lakeRows) {
      // Nine filters (brief 04 section 4), and its one hard rule: NEVER
      // render a chip with a zero count. A chip offering "Sufficient water"
      // over a list that holds none of it is a promise the list cannot keep,
      // and greying it out still puts the word on screen. So a zero option is
      // dropped outright, and a group whose every option is zero never
      // renders. A SELECTED chip survives its own zero, because the way back
      // out of an empty list is the chip you tapped to get there.
      for (const group of LAKE_FACETS) {
        const on = lakeFacets[group.key] || [];
        const options = group.options
          .map((o) => {
            const n = lakeCounts.get(`${group.key}:${o.key}`) ?? 0;
            return { key: o.key, label: t(o.labelKey), n, on: on.includes(o.key) };
          })
          .filter((o) => o.n > 0 || o.on);
        if (!options.length) continue;
        out.push({
          key: `lake-${group.key}`,
          label: t(group.labelKey),
          toolbar: !!group.toolbar,
          onToggle: (k) => setLakeFacets((cur) => {
            const was = cur[group.key] || [];
            return { ...cur,
                     [group.key]: was.includes(k) ? was.filter((x) => x !== k)
                                                  : [...was, k] };
          }),
          options,
        });
      }
    }
    if (isMountainCat && mountainRows) {
      // Seven filters, plus the kind chips v1 already had. Every one of them
      // carries a count, and a chip with a zero count in this scope renders
      // disabled rather than leading to an empty list (brief 05 section 4).
      for (const group of MOUNTAIN_FACETS) {
        const on = mtnFacets[group.key] || [];
        const options = group.options.map((o) => {
          const n = mtnCounts.get(`${group.key}:${o.key}`) ?? 0;
          const isOn = on.includes(o.key);
          return { key: o.key, label: t(o.labelKey), n, on: isOn,
                   disabled: !n && !isOn };
        });
        if (!options.some((o) => o.n || o.on)) continue;
        out.push({
          key: `mtn-${group.key}`,
          label: t(group.labelKey),
          toolbar: !!group.toolbar,
          onToggle: (k) => setMtnFacets((cur) => {
            const was = cur[group.key] || [];
            return { ...cur,
                     [group.key]: was.includes(k) ? was.filter((x) => x !== k)
                                                  : [...was, k] };
          }),
          options,
        });
      }
    }
    return out;
    // T1163: toggleBand and toggleChip now arrive as arguments, fresh each
    // render, and the setters lost their known-stable status at the hook
    // boundary; the deps stay as they were in DestinationsTab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCycleCat, cycleRows, cycleScope, cycleCounts, cycleFacets, cat, t, showCountryIndex, isItinCat, itinFacets,
    itinPace, itinScale, trailFacets, bands, loopsOnly, sacs, durs, reachOnly,
    grades, climbs, shapes, hls, suits, isBeachCat, beachRows,
    beachFacets, beachCounts, isLakeCat, lakeRows, lakeFacets, lakeCounts,
    isMountainCat, mountainRows, mtnFacets, mtnCounts]);
  return { facetGroups };
}
