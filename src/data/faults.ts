import type { FaultDef } from '../sim/types.js';

// Each fault: a symptom the player reads, a few diagnoses (one correct),
// and 2+ fix paths. Cheap/slow is always DIY; fast costs money.

export const FAULTS: FaultDef[] = [
  {
    id: 'chipping',
    name: 'Laminate chipping',
    symptom: 'Edges on the drawer fronts are chipping — laminate flaking on the climb side of every part.',
    weight: 3,
    consumable: 'bit',
    restores: 'bit',
    scrapAfterMinutes: 15,
    diagnoses: [
      { id: 'dullbit', label: 'Dull or wrong bit', correct: true },
      { id: 'vac', label: 'Vacuum losing hold', correct: false },
      { id: 'feed', label: 'Feed rate too slow', correct: false },
    ],
    paths: [
      {
        id: 'diy',
        label: 'Swap in a new compression bit yourself',
        steps: [
          { label: 'Stop and inspect the bit', minutes: 2, cost: 0 },
          { label: 'Fit new 12mm compression bit', minutes: 4, cost: 85 },
          { label: 'Re-zero Z on the touch plate', minutes: 2, cost: 0 },
          { label: 'Resume from last line', minutes: 1, cost: 0 },
        ],
      },
      {
        id: 'preset',
        label: 'Grab the pre-set tool holder from the rack',
        steps: [
          { label: 'Swap pre-set holder', minutes: 2, cost: 160 },
          { label: 'Resume from last line', minutes: 1, cost: 0 },
        ],
      },
    ],
  },
  {
    id: 'partLifted',
    name: 'Part lifted mid-cut',
    symptom: 'BANG. A small part lifted off the bed and the spindle threw it across the shed.',
    weight: 2.5,
    consumable: 'spoilboard',
    restores: 'spoilboard',
    scrapAfterMinutes: 10,
    diagnoses: [
      { id: 'vac', label: 'Vacuum hold-down lost on a small part', correct: true },
      { id: 'snap', label: 'Bit snapped', correct: false },
      { id: 'prog', label: 'Program error', correct: false },
    ],
    paths: [
      {
        id: 'diy',
        label: 'Resurface the spoilboard and re-run with tabs',
        steps: [
          { label: 'Reset E-stop', minutes: 1, cost: 0 },
          { label: 'Clear debris off the bed', minutes: 3, cost: 0 },
          { label: 'Check vacuum gauge', minutes: 1, cost: 0 },
          { label: 'Skim the spoilboard flat', minutes: 10, cost: 0 },
          { label: 'Add tabs and re-run from line', minutes: 3, cost: 0 },
        ],
      },
      {
        id: 'newboard',
        label: 'Throw a fresh spoilboard sheet on',
        steps: [
          { label: 'Reset E-stop', minutes: 1, cost: 0 },
          { label: 'Clear debris off the bed', minutes: 3, cost: 0 },
          { label: 'Fit new spoilboard', minutes: 4, cost: 120 },
          { label: 'Re-run with tabs', minutes: 2, cost: 0 },
        ],
      },
    ],
  },
  {
    id: 'extraction',
    name: 'Extractor bag full',
    symptom: "The extractor bag's swollen tight. Airflow is dropping and dust is piling up on the bed.",
    weight: 3,
    consumable: 'filter',
    restores: 'filter',
    scrapAfterMinutes: 20,
    diagnoses: [
      { id: 'bin', label: 'Bin full or hose blocked', correct: true },
      { id: 'spindle', label: 'Spindle overheating', correct: false },
    ],
    paths: [
      {
        id: 'diy',
        label: 'Empty the bin and clear the hose yourself',
        steps: [
          { label: 'Pause the cut', minutes: 1, cost: 0 },
          { label: 'Empty the dust bin', minutes: 6, cost: 0 },
          { label: 'Clear the 150mm hose', minutes: 5, cost: 0 },
          { label: 'Restart extraction and resume', minutes: 1, cost: 0 },
        ],
      },
      {
        id: 'tech',
        label: 'Call the extraction tech',
        steps: [
          { label: 'Pause the cut', minutes: 1, cost: 0 },
          { label: 'Tech clears and services it', minutes: 5, cost: 250 },
        ],
      },
    ],
  },
  {
    id: 'spindle',
    name: 'Spindle over-temp',
    symptom: 'Spindle temp warning: 78°C and climbing.',
    weight: 2,
    scrapAfterMinutes: 12,
    diagnoses: [
      { id: 'feeds', label: 'Feeds and speeds too aggressive for this board', correct: true },
      { id: 'collet', label: 'Collet slip', correct: false },
      { id: 'bin', label: 'Extraction bin full', correct: false },
    ],
    paths: [
      {
        id: 'cool',
        label: 'Let it cool, then drop the feed rate',
        slowsJobBy: 0.15,
        steps: [
          { label: 'Pause and let it cool', minutes: 8, cost: 0 },
          { label: 'Drop feed 15% and resume', minutes: 1, cost: 0 },
        ],
      },
      {
        id: 'chiller',
        label: 'Top up the spindle chiller and push on',
        steps: [
          { label: 'Chiller coolant top-up', minutes: 3, cost: 60 },
          { label: 'Resume', minutes: 1, cost: 0 },
        ],
      },
      {
        id: 'swap',
        label: 'Swap to the spare spindle',
        requiresUpgrade: 'spareSpindle',
        steps: [
          { label: 'Swap spindle', minutes: 4, cost: 0 },
          { label: 'Resume', minutes: 1, cost: 0 },
        ],
      },
    ],
  },
  {
    id: 'wrongMaterial',
    name: 'Wrong material loaded',
    symptom: "Hang on — that's the wrong board on the bed. The nest wants something else.",
    weight: 1.5,
    onlyAtJobStart: true,
    scrapAfterMinutes: 6,
    diagnoses: [
      { id: 'sheet', label: 'Wrong sheet loaded', correct: true },
      { id: 'zero', label: 'Z-zero drifted', correct: false },
    ],
    paths: [
      {
        id: 'diy',
        label: 'Unload it and find the right sheet',
        steps: [
          { label: 'Unload the sheet', minutes: 3, cost: 0 },
          { label: 'Find the right board in the rack', minutes: 5, cost: 0 },
          { label: 'Load it', minutes: 3, cost: 0 },
          { label: 'Re-run the nest', minutes: 1, cost: 0 },
        ],
      },
      {
        id: 'forklift',
        label: 'Get Dave to swap it with the forklift',
        steps: [
          { label: 'Dave swaps the sheet', minutes: 4, cost: 40 },
        ],
      },
    ],
  },
  {
    id: 'collet',
    name: 'Collet slip',
    symptom: "The bit's pulled out a touch — depth is creeping and the cut's getting loud.",
    weight: 1.5,
    consumable: 'bit',
    scrapAfterMinutes: 10,
    diagnoses: [
      { id: 'collet', label: 'Collet slipping', correct: true },
      { id: 'dull', label: 'Dull bit', correct: false },
    ],
    paths: [
      {
        id: 'diy',
        label: 'Re-seat and torque the collet',
        steps: [
          { label: 'Clean and re-seat collet', minutes: 5, cost: 0 },
          { label: 'Re-zero Z', minutes: 2, cost: 0 },
        ],
      },
      {
        id: 'new',
        label: 'Fit a new collet',
        steps: [
          { label: 'Fit new ER32 collet', minutes: 3, cost: 55 },
          { label: 'Re-zero Z', minutes: 2, cost: 0 },
        ],
      },
    ],
  },
];
