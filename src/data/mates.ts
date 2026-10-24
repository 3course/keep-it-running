// The mates who drop in. One turns up per visit (never the same one twice running), says their line, and
// wears the same shirt every time. `grabsIfYoureDrinking`: if you've already got a beer in hand they don't
// ask — they help themselves from the fridge and head off happy.
export interface Mate {
  id: string;
  name: string;
  line: string;
  shirt: number;
  grabsIfYoureDrinking?: boolean;
}

export const MATES: Mate[] = [
  { id: 'eggby', name: 'Eggby', line: 'Any beers in that fridge?', shirt: 0x3d6f9e },
  { id: 'courtney', name: 'Courtney', line: "Bron's out, up for a beer?", shirt: 0x8e3b5a },
  { id: 'tim', name: 'Tim Baker', line: "If you're having a beer, I'll join you.", shirt: 0x4e8a46, grabsIfYoureDrinking: true },
];

/** What a mate says after their line when the fridge is still locked (before the fridge opens). */
export const TOO_EARLY = 'Nah, too early. Got a sec though?';

export const mateById = (id: string | undefined) => MATES.find(m => m.id === id);
