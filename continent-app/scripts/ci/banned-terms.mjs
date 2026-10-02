#!/usr/bin/env node

/**
 * Lint rule: Enforce banned surface terms in i18n strings
 *
 * Enforces section 4.3 of carta-destinations-enhancement-spec.md and
 * C8 of carta-trips-enhancement-spec.md.
 *
 * Banned from surface copy:
 * - No raw tag names (e.g., "sac_scale", "name:en")
 * - No field names (e.g., "f.g")
 * - No unexpanded abbreviations except airport codes
 * - No NUTS3, OSM relation, GLO-30, ODbL (except in attribution footer)
 *
 * This script is report-only and is not wired into `npm run ci`.
 * Report violations but do not exit with error code.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const i18nDir = path.resolve(__dirname, '../../src/i18n');

// Banned terms that should never appear in surface copy
const bannedTerms = [
  'sac_scale',
  'NUTS3',
  'GLO-30',
  'ODbL',
  'OSM relation',
  'f.g',
];

// OSM tag name patterns to catch
const osmoTagPatterns = [
  'name:en',
  'name:de',
  'name:fr',
  'name:es',
  'name:it',
  'name:nl',
  'type=',
  'highway=',
  'tracktype=',
  'smoothness=',
  'tourism=',
  'natural=',
  'man_made=',
];

/**
 * Check a string for banned terms
 */
function checkString(text) {
  const violations = [];

  // Check banned terms
  for (const term of bannedTerms) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      violations.push({
        term,
        index: match.index,
        context: text.substring(Math.max(0, match.index - 40), Math.min(text.length, match.index + term.length + 40)),
      });
    }
  }

  // Check OSM tag patterns
  for (const term of osmoTagPatterns) {
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      violations.push({
        term,
        index: match.index,
        context: text.substring(Math.max(0, match.index - 40), Math.min(text.length, match.index + term.length + 40)),
      });
    }
  }

  return violations;
}

/**
 * Load all i18n files and check them
 */
function lint() {
  const files = fs.readdirSync(i18nDir).filter(f => f.endsWith('.js'));
  const violations = [];

  for (const file of files) {
    const filePath = path.join(i18nDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Simple line-by-line parser for key: 'value' patterns
    const lines = content.split('\n');
    for (const line of lines) {
      // Match 'key': 'value' or 'key': "value"
      // The value runs to the matching closing quote, so an escaped or
      // inner apostrophe (French strings) does not cut it short.
      const kvMatch = line.match(/^\s*['"]([^'"]+)['"]\s*:\s*(['"`])((?:\\.|(?!\2).)*)\2/);
      if (kvMatch) {
        const [, key, , value] = kvMatch;

        // The collapsed footer is where the licence names belong.
        if (key.startsWith('credit.licence.')) continue;

        // Skip metadata keys
        if (key.includes('aria') || key.includes('title') || key.includes('label') || key.includes('href')) {
          continue;
        }

        const checks = checkString(value);
        if (checks.length > 0) {
          violations.push({
            file,
            key,
            value: value.substring(0, 100) + (value.length > 100 ? '...' : ''),
            issues: checks,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Format and print violations
 */
function reportViolations(violations) {
  if (violations.length === 0) {
    console.log('✓ No banned terms found in i18n strings');
    return;
  }

  console.log(`\nFound ${violations.length} strings with banned terms:\n`);

  for (const violation of violations.slice(0, 20)) {
    console.log(`File: ${violation.file}`);
    console.log(`Key:  ${violation.key}`);
    console.log(`Value: "${violation.value}"`);

    for (const issue of violation.issues.slice(0, 2)) {
      console.log(`  - Term: "${issue.term}"`);
    }
    console.log();
  }

  if (violations.length > 20) {
    console.log(`... and ${violations.length - 20} more violations\n`);
  }

  console.log(`Total: ${violations.length} violations`);
  console.log('Banned: sac_scale, NUTS3, GLO-30, ODbL, OSM relation, raw OSM tags, f.g\n');
}

// Main
try {
  const violations = lint();
  reportViolations(violations);
  process.exit(0);
} catch (error) {
  console.error('Error running banned-terms lint:', error);
  process.exit(1);
}
