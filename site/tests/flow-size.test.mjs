// The flowchart text must stay readable at the sizes it is actually shown.
// It once rendered at 8px on a laptop (a 960-unit drawing squeezed into a 720px column).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIZES, NARROW_QUERY } from '../src/js/flow.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(ROOT, 'src/css/site.css'), 'utf8');
const FLOW_PAD = 18, SCENE_PAD = 16, FLOW_PAD_PHONE = 10;
const MAX_COL = Number(/#watch \.wrap \{ max-width: (\d+)px/.exec(css)[1]);
const TALL_MAX = Number(/\.flow svg\.tall \{ max-width: (\d+)px/.exec(css)[1]);
const NARROW_MAX = Number(/max-width: (\d+)px/.exec(NARROW_QUERY)[1]);

const wideShown = (vw) => Math.min(MAX_COL, vw - 2 * SCENE_PAD) - 2 * FLOW_PAD;
const tallShown = (vw) => Math.min(TALL_MAX, vw - 2 * SCENE_PAD - 2 * (vw <= 520 ? FLOW_PAD_PHONE : FLOW_PAD));

test('the flowchart column is wide, not the narrow reading column', () => {
  assert.ok(MAX_COL >= 1000, `the chart column is ${MAX_COL}px`);
  assert.equal(SIZES.wide.viewW, 960);
});

test('laptop and tablet layout: every label is readable at every width where it is used', () => {
  for (const vw of [NARROW_MAX + 1, 1024, 1280, 1440, 1920]) {
    const scale = wideShown(vw) / SIZES.wide.viewW;
    assert.ok(SIZES.wide.title * scale >= 14.5, `station name at ${vw}px is ${(SIZES.wide.title * scale).toFixed(1)}px`);
    assert.ok(SIZES.wide.sub * scale >= 11, `station sub-label at ${vw}px is ${(SIZES.wide.sub * scale).toFixed(1)}px`);
    assert.ok(SIZES.wide.small * scale >= 10, `notes at ${vw}px are ${(SIZES.wide.small * scale).toFixed(1)}px`);
    assert.ok(SIZES.wide.tiny * scale >= 9.5, `log entries at ${vw}px are ${(SIZES.wide.tiny * scale).toFixed(1)}px`);
    assert.ok(wideShown(vw) >= SIZES.wide.minShownW, `chart is ${wideShown(vw)}px wide at ${vw}px`);
  }
});

test('phone layout: every label is readable from 340px phones up to the switch point', () => {
  for (const vw of [340, 360, 390, 430, 600, 768, NARROW_MAX]) {
    const scale = tallShown(vw) / SIZES.tall.viewW;
    assert.ok(SIZES.tall.title * scale >= 12.5, `station name at ${vw}px is ${(SIZES.tall.title * scale).toFixed(1)}px`);
    assert.ok(SIZES.tall.sub * scale >= 10, `station sub-label at ${vw}px is ${(SIZES.tall.sub * scale).toFixed(1)}px`);
    assert.ok(SIZES.tall.tiny * scale >= 9.5, `log entries at ${vw}px are ${(SIZES.tall.tiny * scale).toFixed(1)}px`);
    assert.ok(SIZES.tall.title * scale <= 24, `names do not become huge on tablets (${(SIZES.tall.title * scale).toFixed(1)}px at ${vw}px)`);
  }
});

test('the layouts hand over at a sensible width', () => {
  assert.ok(NARROW_MAX >= 700 && NARROW_MAX <= 1000, `switch point ${NARROW_MAX}px`);
});
