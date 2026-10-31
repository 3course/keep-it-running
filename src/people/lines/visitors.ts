// A mate who drops in during the day (src/data/mates.ts), once you've said "Yeah, what's up?": a short yarn in their own
// voice that knows what kind of day it's been, then the offer of a hand or a beer. And what they say while helping
// (sillier with each beer). Templates: {sheets} sheets out so far, {piece} what's on the bed, {customer} who it's for,
// {name} the mate. Lines run through the drunk-spelling filter once they've had a beer.
import type { FriendId } from '../dialogue/types.js';

export type HelpTask = 'stack' | 'offcuts' | 'bag' | 'unload' | 'ply';

/** One exchange: they say something, you pick one of two replies, they answer that. */
export interface ChatTurn { say: string; replies: [string, string]; answers: [string, string] }

interface MateVisitLines {
  /** The first thing they say once you've stopped for them, by what today's been like. */
  open: { fault: string[]; cutting: string[]; busy: string[]; quiet: string[] };
  turns: ChatTurn[];
  /** Wrapping up: then the offer (a hand, a beer). */
  close: string[];
  /** Taking on jobs ("Give us a hand?"), and before two ("Beer after two?" and he stays). */
  helpYes: string[];
  afterTwoStays: string[];
  /** Each job done: sober, then a beer or more in. */
  done: Record<HelpTask, [string[], string[]]>;
  nothingToDo: string[];
  allDone: string[];
  /** The can, handed over. */
  thanks: string[];
  /** Waiting for you to bring one over. */
  waiting: string[];
}

const DONE_ANY = {
  stack: [["Boards on the pallet. Square as.", 'Stacked. Neat enough to sell.'], ['Stacked em. Mostly. One of them is having a lie down.', "Pallet's done. I talked to each board. They're calm."]],
  offcuts: [['Offcuts bagged. Bin emptied.', "Bin's empty. Your offcuts are in a better place."], ['Bagged the offcuts. Kept one. Is that theft? It is a nice offcut.', 'Bin emptied. I did a little dance. It helped.']],
  bag: [['Old bag in the skip. Phew.', "Bag's in the skip. That thing weighs a tonne."], ['Wrestled the bag to the skip. The bag won round one.', "Bag's in the skip. We had words. Mostly mine."]],
  unload: [['Bundle on the pallet.', 'Ply on the pallet. Driver says ta.'], ['Ply on the pallet. I may have carried it like a baby.', "Bundle's in. I named it Kevin."]],
  ply: [["Sheet's on the bed. Clamps are your department.", 'Next sheet on the bed for you.'], ["Sheet on the bed. Upside down? Can't tell. Both sides are wood.", 'Put a sheet on the bed. Gave it a pat. Good sheet.']],
} as Record<HelpTask, [string[], string[]]>;

export const VISIT_LINES: Record<FriendId, MateVisitLines> = {
  eggby: {
    open: {
      fault: ["I hear the machine had a turn today. Happens to the best of us. Happened to me at a wedding.", 'Heard a bang earlier. Was that you or the router? Civilisation, either way.'],
      cutting: ["Is that the {piece} on there? For {customer}? Marvellous. This is how civilisations start.", 'Look at it go. The {piece}. I could watch this all day. I very nearly will.'],
      busy: ['{sheets} sheets already? You absolute machine. You and the machine. Both machines.', "{sheets} out the door and it's not even knock-off. I'm moved."],
      quiet: ["Bit of a quiet one? Good. Quiet is when the ideas come. And the biscuits.", 'Slow day? Perfect. I come bearing nothing but conversation.'],
    },
    turns: [
      { say: "I've been thinking about Rome.", replies: ['Course you have.', 'Go on.'], answers: ['Every man does. Hourly. The aqueducts, mate. Gravity did all the work.', 'They had concrete that got STRONGER underwater. We have concrete that cracks if you look at it.'] },
      { say: 'Do you reckon a router counts as a pet?', replies: ['It eats, it makes noise.', 'Absolutely not.'], answers: ["Exactly. And it's never once judged me. Unlike the cat.", 'Fair. A pet would never try to set itself on fire. Most pets.'] },
      { say: "I got a new pen. A fountain pen. I've signed four things today and none of them needed signing.", replies: ['Sign my docket next.', 'That is a cry for help.'], answers: ['Gladly. I will make it look like a treaty.', "It's a cry for nibs, mate. A cry for nibs."] },
      { say: "My neighbour's building a deck. Without plans. Just vibes.", replies: ['Vibes hold weight.', 'Report him to council.'], answers: ['They do not. I have seen the deck. The deck is a slope.', 'I considered it. Then he offered me a sausage. Civilisation is complicated.'] },
      { say: 'Be honest. Is my beard working?', replies: ["It's working hard.", 'It has a lot of ideas.'], answers: ['Hard is good. Hard is honest. Like a Roman.', 'Every one of them a good idea. Bit of a council in there.'] },
      { say: "I've decided I'm a morning person now.", replies: ['Since when?', 'Prove it.'], answers: ['Since Tuesday. Tuesday was incredible.', 'I was up at six. Then I was asleep at six fifteen. Still counts.'] },
    ],
    close: ["Anyway. I'm keeping you. Unless you need a hand? Or there's a beer about?", "Right. Put me to work, or put a beer in me. Either's civilised."],
    helpYes: ["Point me at it. I've got hands. Two of them. Both mine.", 'Excellent. Honest work. The Romans would approve.'],
    afterTwoStays: ["Two o'clock? I'll make myself useful till then. Idle hands and all that.", "I'll wait. Put me to work. The beer will taste better earned."],
    done: DONE_ANY,
    nothingToDo: ["Nothing else needs doing? Then I'll stand here supportively.", 'All shipshape. Very Roman of you.'],
    allDone: ["That's me. Good shed, this. Good people.", "Done. I feel like I've built an empire. A small one. With offcuts."],
    thanks: ['Ah. Cold. Civilised. Thank you.', 'You beautiful human. To the shed.'],
    waiting: ["I'll be here. Not going anywhere. Spiritually or physically.", 'Take your time. Actually, don\'t.'],
  },
  courtney: {
    open: {
      fault: ['Heard the machine chucked a wobbly! Are YOU okay? Is IT okay? Group hug?', "Bron said she heard a bang from the street! Was it you? It was you. Love that."],
      cutting: ["Is that the {piece}?! For {customer}?! I'm SCREAMING. Look at it!", 'Ooh, what is THAT. The {piece}? Can I touch it? Not now? Later. Later.'],
      busy: ['{sheets} sheets already?! You are a WEAPON. A productive weapon.', "{sheets} out the door! I've done three emails today and I'm exhausted."],
      quiet: ["Quiet one? Great, because I have GOSSIP.", "Slow day? Perfect. I've got a story and it has a twist."],
    },
    turns: [
      { say: "Bikkie learned to open the pantry. We are now a household under siege.", replies: ['Clever dog.', 'Lock it.'], answers: ["Too clever! She took ONE thing. A whole loaf. Left the bag folded. Psychopath.", "We tried! She watched us do it. She's studying us."] },
      { say: "Golden Plains tickets drop next week. Are you in? Say you're in.", replies: ["I'm in.", 'Depends on the lease.'], answers: ['YES! Tarago. Gazebo. Glory. I\'m booking the campsite in my head now.', "The lease can come too! We'll bring it a hat."] },
      { say: "Bron's sourdough starter is called Kevin and it's bigger than our cat.", replies: ['Feed it to the cat.', 'Kevin needs boundaries.'], answers: ["The cat's scared of Kevin! Everyone's scared of Kevin!", 'Kevin has NO boundaries. Kevin lives in the fridge like a king.'] },
      { say: "I've started saying 'reach out' at work and I hate myself.", replies: ['Circle back to that.', 'Reach in, instead.'], answers: ['NO! Don\'t! I\'ll lose it! Okay I lost it.', 'Reach in! I love that! I\'m reaching in! Into the snack drawer.'] },
      { say: "I saw a bloke at the café order a 'babyccino for himself'.", replies: ['Icon.', 'Concerning.'], answers: ['An ICON. He had a marshmallow and everything. Living right.', "He paid in coins. Very slowly. With eye contact. Concerning AND iconic."] },
      { say: 'Do you think I could pull off a mullet?', replies: ['Born for it.', 'Ask Bron.'], answers: ["RIGHT?! Business up front, Golden Plains out the back.", "Bron said 'over my dead body' which is basically a yes."] },
    ],
    close: ["Okay I'll let you work! Unless I can help? Or, you know. A cheeky beer?", "Right! Put me to work or put a beer in my hand! Dealer's choice!"],
    helpYes: ['YES. Give me a job. I want a job. I\'ll be the best at it.', "Love that! I'm a great helper. Ask Bron. Actually don't."],
    afterTwoStays: ["Two? I'll help till then! I'm SO helpful!", "I'll stick around! Beer at two is basically a party."],
    done: DONE_ANY,
    nothingToDo: ['Nothing to do?! Okay I\'ll just vibe.', "All done? I'll make the place look nice. Moving a broom. Nice."],
    allDone: ["That's me! Teamwork! Group hug! Okay no hug, you're dusty.", "Done! I'm basically staff now. I want a lanyard."],
    thanks: ['A BEER! For me?! You shouldn\'t have! Cheers!', "You're the best. I'm telling Bron you're the best."],
    waiting: ["I'll wait right here! Very patiently! Mostly patiently!", "Take your time! I'll talk to the router."],
  },
  tim: {
    open: {
      fault: ['Heard the machine had a moment. Happens. Write that down.', 'Smells like something had a bad day. Hope it was the machine.'],
      cutting: ["That the {piece} for {customer}? Nice. Very nice. I'd buy it. I won't. But I'd consider it.", "The {piece}. Look at that. Better than anything I've made. Low bar. Still."],
      busy: ["{sheets} sheets already. You're a production line, champ.", "{sheets} out the door. Tidy. I've done a crossword. Half a crossword."],
      quiet: ['Quiet one. Good. Quiet is underrated. Like Coburg.', "Slow day? Same. I've been at the hardware shop. Just looking at hoses."],
    },
    turns: [
      { say: 'Should have bought in 2012.', replies: ['You say that every week.', 'Should have.'], answers: ["It's tradition. Like Christmas. But sadder.", "Thank you. Finally someone gets it. Write that down."] },
      { say: "Quiz Team Aguilera came second last on Tuesday.", replies: ['Second last is still a place.', 'What went wrong?'], answers: ['Exactly. We beat the team that didn\'t turn up.', 'Every question was about the nineties. We were busy in the nineties.'] },
      { say: "Had a parma yesterday. Life-changing. The chips were a seven though.", replies: ['A seven is fine.', 'Seven is a crime.'], answers: ['Fine is fine. Parma was a ten. Average of eight-point-five. Write that down.', "That's what I said! To the waiter. He wasn't interested."] },
      { say: "I'm starting a band. Again.", replies: ['What are you called?', 'What do you play?'], answers: ['The Should Have Boughts. Working title. Final title.', "Nothing yet. That's step two. Step one is the name. Done."] },
      { say: 'Coburg is the new Brunswick. I was here first.', replies: ['You were.', 'Brunswick is the old Coburg.'], answers: ["Thank you. I'm getting a plaque.", "Ooh. That's good. I'm stealing that. Write that down. I'll write it down."] },
      { say: 'You ever just look at a hose? Really look at it?', replies: ['Every day.', 'Never.'], answers: ['Then you know. Peace, mate. Peace is a hose.', 'Start tomorrow. The hardware shop. Sunday arvo. Golden light. Thank me later.'] },
    ],
    close: ['Right. Need a hand? Or is it beer o\'clock somewhere?', "I'll get out of your hair. Unless you want a hand. Or a beer. Or both. Both's good."],
    helpYes: ['Put me to work, champ. Slowly. Thoroughly.', "Yep. I'm good with my hands. Ask anyone. Don't ask anyone."],
    afterTwoStays: ["Two o'clock. I can wait. I'll earn it.", "I'll hang about. Give us a job meantime."],
    done: DONE_ANY,
    nothingToDo: ["Nothing else? I'll stand here. Looking useful. It's a skill.", 'All done, by the look of it. Tidy shed. Proud of you.'],
    allDone: ["That's me. Good work. Mostly yours.", 'Done. Write that down: Tim helped.'],
    thanks: ['Plain lager? On principle? Champion. Cheers.', 'Ah. That first one. Like a hug from a cold relative. Ta.'],
    waiting: ["I'll be here. Not going anywhere. Literally. My legs are tired.", 'No rush. Some rush. Medium rush.'],
  },
} as Record<FriendId, MateVisitLines>;

/** Notepad words for each job a mate's doing for you. */
export const TASK_WORDS: Record<HelpTask, string> = {
  stack: 'stacking', offcuts: 'emptying the offcut bin', bag: 'taking the old bag out', unload: 'unloading the truck', ply: 'grabbing a sheet',
};
