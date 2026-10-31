// Dennis the accountant on the phone: one bet per call, in plain-English numbers, with honest odds. Cheerful, a bit
// too keen, always says what could go wrong. Templates: {stake} {gain} {loss} {odds} {sheets} {days} {jess} {won}
// {total} {net} {name}. {odds} reads like "four in five". Pitches under 150 characters, everything else under 90.
export type BetKind = 'prebuy' | 'terms' | 'bandsaw' | 'secondRouter' | 'jessHours' | 'extractorService' | 'rushInvoice' | 'longerLease' | 'footy';

export const DENNIS_LINES = {
  /** The pitch, by bet. One is picked. */
  pitch: {
    prebuy: [
      "Ply's going up Monday. Buy {sheets} sheets today: ties up {stake}, saves about {gain}. I'd say {odds}. Yeah?",
      "Hot tip from the timber yard: price rise next week. {sheets} sheets now, {stake} out, {gain} saved. {odds}. Yeah?",
      "Stock up? {sheets} sheets for {stake} before the rise. Worth {gain} if it lands, {loss} if it drops. {odds}. Yeah?",
    ],
    terms: [
      "Big one: {sheets} sheets on 30-day terms. Pays {gain} over normal. They're slow payers, mind. {odds}. Yeah?",
      "A builder wants {sheets} sheets, pay in 30 days. About {gain} extra. Odds they pay in full: {odds}. Shall we?",
      "{sheets} sheets on account. {gain} more than cash work, if they cough up. I'd put it at {odds}. Yeah?",
    ],
    bandsaw: [
      "Second-hand edge-bander, {stake}. Edged panels pay better: about {gain} over {days} days. {odds}. Yeah?",
      "Bloke in Preston's selling an edge-bander. {stake}. Unlocks edged panels, maybe {gain}. Used, so {odds}. Yeah?",
      "Edge-bander, {stake}, a bit loved. Could be {gain} in {days} days. Could need a part. I'd say {odds}. Go on?",
    ],
    secondRouter: [
      "Lease a second router for {days} days: {stake}. Doubles what you can cut, about {gain}. Doubles fire risk too. {odds}. Yeah?",
      "Second router, {stake} for the week. Twice the sheets, maybe {gain}. Twice the fires and power trips, honestly. {odds}?",
      "Two routers! {stake} lease, about {gain} back over {days} days. Mind the extractor and the fuse box. {odds}. Yeah?",
    ],
    jessHours: [
      "Big order rumoured. Put {jess} on every day for {days} days: {stake} in wages, about {gain} if it lands. {odds}. Yeah?",
      "Get {jess} in for {days} extra days? Costs {stake}. Hearing about a big job worth {gain}. I'd say {odds}. Yeah?",
      "Rumour from a client: big order coming. {jess} on more days, {stake}. Pays {gain} if it's true. {odds}. Yeah?",
    ],
    extractorService: [
      "Prepay the extractor service: {stake}. Fewer bag fires for {days} days, worth about {gain}. {odds}. Yeah?",
      "Extractor's due. {stake} now and it'll breathe easy for {days} days. Saves maybe {gain}. I'd say {odds}. Yeah?",
      "Service the extractor? {stake}. Fewer fires, fewer faults, about {gain} back. Honest odds: {odds}. Yeah?",
    ],
    rushInvoice: [
      "Say yes to that rush job. I'll sort the invoice: about {gain} extra. Small chance they quibble. {odds}. Yeah?",
      "Rush job on the table. Take it, I'll price it properly. {gain} more than usual. I'd say {odds}. Yeah?",
      "That rush order? Yes to it. Rush rates, {gain} extra. Might get a dispute, might not. {odds}. Go on?",
    ],
    longerLease: [
      "Sign the longer lease and the landlord knocks off rent: {gain} over the month. Small risk he sells. {odds}. Yeah?",
      "Landlord's offering a discount on a longer lease. About {gain}. If he sells, there's a break fee. {odds}. Yeah?",
      "Longer lease, cheaper rent. {gain} better off, {loss} if it goes wrong. I'd put it at {odds}. Sign?",
    ],
    footy: [
      "Sponsor the local footy club: {stake}. Your name on the scoreboard, more calls for {days} days, about {gain}. {odds}. Yeah?",
      "The under-twelves need a sponsor. {stake}. Brings in maybe {gain} of work. And the kids get jumpers. {odds}. Yeah?",
      "Footy club sponsorship, {stake}. Parents ring for signs, about {gain}. I'd say {odds}. Plus, the jumpers. Yeah?",
    ],
  } as Record<BetKind, string[]>,
  yes: [
    'Lovely. Leave it with me. I love this bit.',
    "Beautiful. I'll do the paperwork. You do the sawdust.",
    "Ripper. I'll ring when it settles. Fingers crossed, both hands.",
    "Done. Thanks for trusting me. I won't make it weird. I'll make a spreadsheet.",
  ],
  no: [
    'No worries. Probably wise. Probably.',
    'Fair enough! Not every number has to be a yes.',
    "All good. I'll put it in the 'no' column. It's a lovely column. Very tidy.",
    "Righto. Sound call. I'll stop talking now. After this sentence. Now.",
  ],
  later: [
    "Sure, have a think. I'll ring back in a couple of hours. Might be gone by then.",
    "No rush. Well, a bit of a rush. I'll call back after lunch.",
    "Sleep on it. Well, lunch on it. I'll ring back in a bit.",
    'Course. Mull. I respect a mull. Back to you this arvo.',
  ],
  /** Ringing back after "give me a minute". */
  callback: [
    "It's {name} again! Still on, if you want it. Yeah?",
    'Me again. Good news: it is still there. Thought about it?',
    "Hello! Ringing back as promised. Offer's still open. Yeah or nah?",
    "{name} here. Still on the table, mate. What's the verdict?",
  ],
  /** Ringing back and it's gone. */
  gone: [
    "Bad news: that one's gone. Someone beat us to it. Next time.",
    "Rang back, it's gone. Probably for the best. Statistically. Chin up.",
    'Missed it, sorry. These things move. There will be another.',
    "Gone, I'm afraid. Don't worry. I've got a drawer full of ideas.",
  ],
  /** How it turned out, by bet. */
  won: {
    prebuy: [
      'Price went up! You saved {net}. Told you. Well, I said three in four. But still.',
      'Timber yard put prices up this morning. You dodged it: {net} ahead.',
      "The ply rise landed. {net} saved. I'm doing a small dance in the office.",
    ],
    terms: [
      'They paid! All of it, on time. {net} up. I nearly fell off my chair.',
      'Thirty-day job settled in full. {net} ahead. Lovely people, really.',
      "Money's in. {net} up on that big job. I'll stop refreshing the bank now.",
    ],
    bandsaw: [
      "Edge-bander's paid for itself. {net} up. Look at you, all edged.",
      'Edged panels are flying out. The bander is {net} up. Good old girl.',
      "Second-hand and still a winner. {net} ahead on the edge-bander. Lovely.",
    ],
    secondRouter: [
      'Second router earned its keep: {net} up. And nothing caught fire. Much.',
      'Two routers, one great week. {net} ahead. Lease is back, all limbs present.',
      "Double capacity, double money. {net} up. I'm so pleased I could cry.",
    ],
    jessHours: [
      'The big order landed, and {jess} was ready. {net} up. Tell her well done.',
      'Rumour was true! Order came in, {jess} smashed it. {net} ahead.',
      "Worth it: {net} up. {jess} carried that order. Get her a pie.",
    ],
    extractorService: [
      'Not one bag fire all week. {net} saved. Extractor sounds like a cat purring.',
      "Service paid off. {net} ahead. Quietest extractor in Melbourne.",
      'Clean bags, no fires, no faults. {net} saved. Boring is beautiful.',
    ],
    rushInvoice: [
      'Invoice sorted, paid in full. {net} extra. Rush rates are lovely things.',
      'They paid the rush price without a peep. {net} up. Cheers.',
      'Rush job, rush payment. {net} ahead. Love it when a plan works.',
    ],
    longerLease: [
      'Lease signed, rent down. {net} better off this month. Landlord sends regards.',
      "Longer lease is paying off: {net} saved. He's not selling. Says he likes you.",
      'Lower rent all month. {net} ahead. Good, boring win. My favourite kind.',
    ],
    footy: [
      "Phone's been ringing off the hook. {net} up. Go the mighty under-twelves!",
      'Sponsorship paid off: {net} ahead. Your name looks great on the scoreboard.',
      "Three parents rang for signs this week. {net} up. And they won on Saturday!",
    ],
  } as Record<BetKind, string[]>,
  lost: {
    prebuy: [
      "Price dropped instead. You're down {net}. Sorry, mate. That one's on me.",
      'Ply went down, not up. {net} worse off. At least you have heaps of ply.',
      "The rise never came. Down {net}. I'll buy the next round. And the one after.",
    ],
    terms: [
      "They're slow. Got half so far. Down {net}. I'll keep chasing. Nicely.",
      'Customer went quiet on the invoice. Down {net}. Sorry. I picked a dud.',
      "Thirty days became ninety and then a bit. Down {net}. That's on me.",
    ],
    bandsaw: [
      'Edge-bander needed a $600 part. Down {net}. She runs now, at least.',
      "Second-hand meant second-rate. Down {net} on the bander. I'm sorry, mate.",
      'The bander ate a panel and a belt. Down {net}. Lesson learned. Mostly mine.',
    ],
    secondRouter: [
      'Second router sat broken half the week. Down {net}. Sorry about that.',
      'Two routers, one fuse box. Lots of trips. Down {net}. I did warn you. Gently.',
      "Leased router was a lemon. Down {net}. I'll ring them. Politely. Firmly.",
    ],
    jessHours: [
      "Order didn't come. Down {net} on wages. {jess} did a lovely job sweeping, though.",
      'Rumour was a rumour. Down {net}. Sorry. {jess} enjoyed the hours, at least.',
      'Big order went elsewhere. {net} down. My source owes me a coffee.',
    ],
    extractorService: [
      'Service bloke no-showed. Down {net}. I have left him a very polite message.',
      'Serviced it and a bag still went up. Down {net}. Odds are odds. Sorry.',
      "Didn't pay off this time. Down {net}. Extractor's clean, if that helps.",
    ],
    rushInvoice: [
      'Invoice is in dispute. Down {net}. I sorted it badly. My fault, mate.',
      'They paid the normal rate, not rush. Down {net}. I should have got it in writing.',
      "Rush job, slow payment, half of it. Down {net}. I'm embarrassed, honestly.",
    ],
    longerLease: [
      "Landlord's selling. Break fee. Down {net}. Didn't see that one. Sorry.",
      'He sold the building. Down {net} on the break fee. I owe you a pie.',
      "Lease went sideways. Down {net}. That's the one in five. Rotten luck.",
    ],
    footy: [
      'Club folded. Down {net}. The kids still got jumpers, if that helps.',
      "Scoreboard went up, phone didn't ring. Down {net}. Sorry, mate.",
      'Sponsorship was a dud. Down {net}. They did give us a sausage roll each.',
    ],
  } as Record<BetKind, string[]>,
  /** Him on his record. */
  record: [
    "{won} from {total}, mate. Don't look at the others.",
    "That's {won} from {total} on my calls. {net} all up. Proud of us.",
    "Track record: {won} out of {total}. Net {net}. I keep a tab. Obviously.",
    "{won} wins from {total}. {net} overall. Not bad for a bloke with a calculator.",
  ],
  /** Three no's in a row: he goes quiet. */
  quiet: [
    "Right. I'll give you some space. Ring me if you need me. I'm always in.",
    "Three no's. Message received. I'll go quiet a few days. Not offended. A bit.",
    'I can take a hint. Even three. Talk soon, mate. No bets. Promise.',
  ],
  /** Back again, humbler: the bets are safer now. */
  humble: [
    "Me again. Smaller one this time. Very safe. Boring, even. You'll love it.",
    "{name} here. I've had a think. Safer bets from now on. Little ones.",
    "Hello. Humbler {name} calling. Tiny bet, great odds. Hear me out?",
  ],
  /** His monthly coffee visit, at the roller door. */
  coffee: [
    "Just here for a coffee. And a look at the ledger. Mostly the coffee.",
    "Morning! Brought you a flat white. Can I just peek at the books? Two minutes.",
    "Coffee run! Yours is the big one. I'll be in the office. With the ledger. Happily.",
    "Monthly visit! Coffee for you, ledger for me. Best date I've got this month.",
  ],
};
