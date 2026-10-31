// The shared design format: one record per thing a customer wants cut. Everything that shows a job's "before" (the
// sketch on the job card), its "during" (the router's toolpath on the bed) and its "after" (the extruded piece in the
// reveal, the gallery) reads the same record, so they always match. Pure data: no DOM, no Three.js.
import type { JobTypeId } from '../config.js';

/** What it's cut from. The three job types the shed takes (CONFIG.jobs.types: formwork, joinery → mdf, signage → acrylic). */
export type DesignKind = 'formwork' | 'mdf' | 'acrylic';

/** An inner path: `cut` goes right through (a hole), `engrave` is a shallow line on the face. */
export interface InnerPath { d: string; op: 'cut' | 'engrave' }

export interface Design {
  id: string;
  name: string;
  kind: DesignKind;
  /** Who it's for (their name as they'd sign the sketch). */
  customer: string;
  /** The blank it's cut from, in mm. Path coordinates are mm on this sheet: x right, y down, origin top-left. */
  sheet: { w: number; h: number };
  /** Board, as the shed calls it ("18mm formply"). */
  material: string;
  /** Thickness in mm. */
  thickness: number;
  /** Face colour: the film, the paint, or the acrylic (CSS hex). */
  colour: string;
  /** The outer cut: SVG path data, one closed outline. */
  outer: string;
  /** Holes and engraving, cut in this order before the outer profile (as a real toolpath would). */
  inner: InnerPath[];
  /** The customer's scribbled note on the sketch. */
  note: string;
  /** Cut after hours for fun (a mate's idea at knock-off), never a paying job. */
  afterHours?: boolean;
  /** What they say at pickup when they see it (on top of the kind's lines). Templates: {name}. */
  pickup?: string[];
  /** The thank-you they bring round the next day, if they do. */
  thanks?: { kind: 'beer' | 'slice' | 'card' | 'drawing' | 'plant' | 'coffees'; line: string };
}

export const KIND_FOR_JOB: Record<JobTypeId, DesignKind> = { formwork: 'formwork', joinery: 'mdf', signage: 'acrylic' };
