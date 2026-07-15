/**
 * Seed a complete demo campaign — "The Bell of Corvath".
 *
 * Exercises every resource in the app: campaign (hook/premise/tone/storySoFar/
 * moodSlots), all five element types, @mention + typed-relationship links,
 * backlinks, tags, secrets, player-visible publishing, per-element soundtracks,
 * a live mid-combat session, members, invites, a share link, and activity.
 *
 * Every element is validated through the real zod create schema and persisted
 * with the same helpers the API routes use, so seeded data is shape-identical
 * to data created through the UI.
 *
 *   npm run seed:demo           # (re)create the demo campaign
 *   npm run seed:demo -- --clean  # remove it and its demo users, then exit
 *
 * Idempotent and narrowly scoped: it only ever touches the campaign named
 * CAMPAIGN_NAME and users whose webauthnUserID starts with DEMO_USER_PREFIX.
 */
import mongoose, { Types } from 'mongoose';
import crypto from 'crypto';
import { connectToDatabase } from '../lib/db';
import { env } from '../lib/env';
import { User } from '../models/User';
import { Campaign } from '../models/Campaign';
import { Element } from '../models/Element';
import { Membership } from '../models/Membership';
import { Activity } from '../models/Activity';
import { GameSession } from '../models/Session';
import { Invite } from '../models/Invite';
import { ShareLink } from '../models/ShareLink';
import { elementRegistry, type ElementType } from '@mythbindr/shared';
import { deriveBodyText } from '../elements/bodyText';
import { mentionLinks, relationshipLinks } from '../elements/links';

const CAMPAIGN_NAME = 'The Bell of Corvath';
const DEMO_USER_PREFIX = 'demo-seed-';

/* ── ProseMirror (TipTap StarterKit) body builders ────────────────────────── */
/* eslint-disable @typescript-eslint/no-explicit-any */
const doc = (...content: any[]) => ({ type: 'doc', content });
const t = (text: string) => ({ type: 'text', text });
const bold = (text: string) => ({ type: 'text', marks: [{ type: 'bold' }], text });
const em = (text: string) => ({ type: 'text', marks: [{ type: 'italic' }], text });
const code = (text: string) => ({ type: 'text', marks: [{ type: 'code' }], text });
const p = (...content: any[]) =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
const h = (level: number, text: string) => ({
  type: 'heading',
  attrs: { level },
  content: [t(text)],
});
const li = (...content: any[]) => ({ type: 'listItem', content });
const ul = (...items: any[]) => ({ type: 'bulletList', content: items });
const ol = (...items: any[]) => ({ type: 'orderedList', attrs: { start: 1 }, content: items });
const quote = (...content: any[]) => ({ type: 'blockquote', content });
const rule = () => ({ type: 'horizontalRule' });

/* ── Stable ids + names, assigned up front ────────────────────────────────── */
/* Pre-assigning ObjectIds lets bodies @mention elements that don't exist yet,
 * so the whole graph can be written in a single pass. */
const ids = new Map<string, Types.ObjectId>();
const oid = (key: string): Types.ObjectId => {
  if (!ids.has(key)) ids.set(key, new Types.ObjectId());
  return ids.get(key)!;
};
const ref = (key: string) => String(oid(key));

/** Display names, declared once so @mention labels can never drift from element names. */
const NAME: Record<string, string> = {
  // NPCs
  ferran: 'Ferran Volk',
  alma: 'Sister Alma Thorne',
  odo: 'Magistrate Odo Crane',
  yzzy: 'Ysolde “Yzzy” Marrow',
  wren: 'Wren Volk',
  vessarine: 'Vessarine, the Thing Beneath the Ice',
  hollis: 'Captain Hollis Drear',
  tobias: 'Tobias Vane',
  // Locations
  corvath: 'Corvath Bell',
  belfry: 'The Belfry of Saint Aurel',
  undercroft: 'The Undercroft',
  hollowmere: 'Hollowmere',
  iceweir: 'The Ice Weir',
  greywater: 'Greywater Market',
  remembering: 'The Remembering',
  // Encounters
  ambush: 'The Undercroft Ambush',
  dinner: 'Dinner at the Magistracy',
  crossing: 'Crossing the Ice Weir',
  tuning: 'The Tuning',
  griefengine: 'The Grief Engine',
  lasttoll: 'The Last Toll',
  // Items
  tollhammer: 'The Tollhammer of Saint Aurel',
  leathers: 'Bellwright’s Leathers',
  draught: 'Draught of Yesterday',
  jar: 'Corvath Memory Jar',
  ledger: 'The Winter Ledger',
  marks: 'Winter Marks',
  shard: 'Clapper Shard',
  ribbon: 'Wren’s Ribbon',
  // Notes
  sessionzero: 'Session Zero & Safety Tools',
  factions: 'The Factions of Corvath',
  timeline: 'The Twelve Tollings',
  rumours: 'Rumours at Greywater (d8)',
  twist: 'GM ONLY — The Shape of the Truth',
  letter: 'Handout — The Bellwright’s Letter',
  castlist: 'Handout — Who You’ve Met',
  briefing: 'Handout — Where We Are',
};

/** An @mention node pointing at a seeded element. */
const at = (key: string) => ({
  type: 'mention',
  attrs: { id: ref(key), label: NAME[key] },
});

/* ── Verified Spotify playlists (each URL fetched and confirmed live) ─────── */
const MOOD = {
  tavern: { label: 'Greywater / tavern', uri: 'spotify:playlist:7qkvzGNxLuxo4O2YBzWpnm' },
  travel: { label: 'Travel / the mere', uri: 'spotify:playlist:7BkG8gSv69wibGNU2imRMx' },
  combat: { label: 'Combat', uri: 'spotify:playlist:3j6OoomA0n8B1pGQA83NtB' },
  dread: { label: 'Dread / the Undercroft', uri: 'spotify:playlist:43eY5Lf41lyZvABPEgAZ3T' },
  boss: { label: 'The Last Toll', uri: 'spotify:playlist:5WnB6wpclrPltZNYBjQQ7c' },
  grief: { label: 'Aftermath / grief', uri: 'spotify:playlist:1Mbdl2LIOk9MvpadoBXNG8' },
} as const;
const track = (m: { label: string; uri: string }, name: string) => ({
  spotifyUri: m.uri,
  name,
});

const D = (iso: string) => new Date(`${iso}T19:30:00Z`);

/* ── Element definitions ──────────────────────────────────────────────────── */
interface Seed {
  key: string;
  type: ElementType;
  created: string;
  updated: string;
  input: Record<string, unknown>;
}

const ELEMENTS: Seed[] = [
  /* ══════════════════════════ NPCs ══════════════════════════ */
  {
    key: 'ferran',
    type: 'npc',
    created: '2026-03-02',
    updated: '2026-07-12',
    input: {
      name: NAME.ferran,
      playerVisible: false,
      tags: ['act-1', 'bellwrights', 'quest-giver', 'belfry'],
      data: {
        race: 'Human',
        role: 'Bellwright of Saint Aurel',
        alignment: 'Lawful Neutral',
        status: 'alive',
        location: NAME.belfry,
        faction: 'The Bellwrights',
        summary:
          'The man who rings the Bell that takes the city’s memory — and who has quietly paid more of his own than anyone alive.',
        traits:
          'Speaks slowly, as though checking each word against a list he can no longer read. Keeps his hands busy — rope, wax, wire — so they do not shake. Unfailingly kind to strangers, because strangers are the only people he is certain he has not wronged.',
        ideal: 'The debt is real. Someone has to carry it, and I am still standing.',
        bond: 'A name he writes on his palm every morning and cannot place by evening.',
        flaw: 'He would pay any price rather than let the city learn what he has already paid.',
        mannerism: 'Rubs his left palm with his thumb, over and over, like polishing a coin.',
        catchphrase: 'It is not that we forget. It is that we pay.',
      },
      body: doc(
        p(
          t('Ferran keeps the Bell in '),
          at('belfry'),
          t(' the way a man keeps a wound clean: carefully, daily, and without ever looking directly at it. He is the seventh Bellwright. He can tell you the names of the six before him. He cannot tell you what he did the winter before last.'),
        ),
        h(3, 'Playing him'),
        ul(
          li(p(t('Warm, but always half a beat behind — like a man translating from another language.'))),
          li(p(t('He answers questions about the Bell honestly and questions about himself badly.'))),
          li(
            p(
              t('If the party mentions '),
              at('wren'),
              t(' by name, he agrees pleasantly that she is a good apprentice and does not know why his eyes are wet.'),
            ),
          ),
        ),
        h(3, 'What he wants'),
        p(
          t('He wants the party to fix the Bell. He believes — correctly — that an unpaid debt is worse than a paid one. He does not know what fixing it will cost, and '),
          at('alma'),
          t(' has not told him.'),
        ),
        quote(p(em('“You’re going to ask me why I don’t just stop. Everyone does, once. Go and look at the mere, and then come back and ask me again.”'))),
      ),
      secrets:
        'For twenty-two years Ferran has been topping up a short tithe with his own memory — quietly, without telling the Magistracy, because a short tithe means the whole city pays the difference.\n\nHe has forgotten Wren completely. She is his daughter. She lives in the belfry loft and he believes the guild sent her as an apprentice. He has forgotten her four separate times; each time she has re-introduced herself and let him name her again. She is now on her fifth name from him. Her real one is in the Winter Ledger, in Alma\'s hand.\n\nIf the party restores even one of these memories, Ferran will attempt to pay the entire remaining debt himself at the next tolling. He will not survive it, and — this is the cruel part — it would work.',
      relationships: [
        { targetId: ref('wren'), relType: 'daughter (forgotten)' },
        { targetId: ref('alma'), relType: 'oldest friend' },
        { targetId: ref('belfry'), relType: 'keeper of' },
        { targetId: ref('tollhammer'), relType: 'bears' },
        { targetId: ref('odo'), relType: 'answers to' },
      ],
    },
  },
  {
    key: 'alma',
    type: 'npc',
    created: '2026-03-02',
    updated: '2026-07-09',
    input: {
      name: NAME.alma,
      playerVisible: false,
      tags: ['act-1', 'remembrance', 'quest-giver', 'lore'],
      data: {
        race: 'Half-elf',
        role: 'Priest of the Remembrance; illegal archivist',
        alignment: 'Neutral Good',
        status: 'alive',
        location: NAME.greywater,
        faction: 'The Remembrance',
        summary:
          'Keeps an illegal ledger of everything Corvath has paid, and is the only person who can prove the bargain exists at all.',
        traits:
          'Warm, exhausted, and funnier than she has any right to be. Interrupts herself to write things down. Treats every conversation as a deposition she is taking on behalf of people who will not remember giving it.',
        ideal: 'A debt you cannot remember is a debt you cannot refuse. So write it down.',
        bond: 'The Winter Ledger. She has re-copied it eleven times; twice the ink was her own blood.',
        flaw: 'She trusts documents more than people — including documents she wrote herself while frightened.',
        mannerism: 'Licks her thumb before turning any page, even a page that isn’t there.',
        catchphrase: 'Say it out loud. Out loud it’s harder to take.',
      },
      body: doc(
        p(
          t('Alma runs a stall at '),
          at('greywater'),
          t(' that sells nothing. She sits behind it and writes down what people tell her, and once a year she carries '),
          at('ledger'),
          t(' out of the city and does not come back until the thaw.'),
        ),
        h(3, 'What she gives the party'),
        ul(
          li(p(t('The only surviving account of the founding bargain with '), at('vessarine'), t('.'))),
          li(p(t('The location of '), at('undercroft'), t(' — and a warning about what is filed there.'))),
          li(p(t('A standing offer: tell her one true thing before you go into the ice, and she will write it down so you can be told it again.'))),
        ),
        h(3, 'Playing her'),
        p(
          t('She is the party’s exposition, and she knows it, and she resents it a little. Let her be tired. Let her be wrong about something small and be genuinely rattled when corrected.'),
        ),
        quote(p(em('“I am not brave. I am organised. People confuse the two and I have stopped correcting them.”'))),
      ),
      secrets:
        'Alma is 106 and has been Priest of the Remembrance across four Tollings. She survives with her memory intact by a shabby little trick: she is never inside the city on Midwinter night. She walks out onto the mere and waits. She has never told Ferran this, because the answer to "why don\'t you just leave, then" is one she cannot give him.\n\nThree entries in the Winter Ledger are forgeries. She wrote them herself, in different hands, on different nights, over sixty years — each time she came close to giving up. One of the forgeries is the entry stating that the Bell can be unmade. She no longer remembers inventing it, and now believes it. So does everyone she has shown it to.\n\nIf the party proves the entry false, they take away the only hope the Remembrance has. If they never check, they will plan an entire endgame around a lie a frightened woman told herself.',
      relationships: [
        { targetId: ref('ledger'), relType: 'keeper of' },
        { targetId: ref('ferran'), relType: 'oldest friend' },
        { targetId: ref('remembering'), relType: 'has walked in' },
        { targetId: ref('odo'), relType: 'suspects' },
      ],
    },
  },
  {
    key: 'odo',
    type: 'npc',
    created: '2026-03-09',
    updated: '2026-07-11',
    input: {
      name: NAME.odo,
      playerVisible: false,
      tags: ['act-2', 'magistracy', 'villain', 'social'],
      data: {
        race: 'Human (in appearance)',
        role: 'Magistrate of Corvath',
        alignment: 'Lawful Evil',
        status: 'alive',
        location: NAME.corvath,
        faction: 'The Magistracy',
        summary:
          'The city’s beloved administrator. Thirty years of prosperity, order, and forgetting — all of it his work.',
        traits:
          'Gracious, precise, genuinely charming. Never raises his voice. Listens with his whole attention, which in Corvath is such a rare gift that people mistake it for love.',
        ideal: 'A city that cannot remember its griefs cannot be governed by them.',
        bond: 'Corvath itself — the way a farmer is bonded to a field.',
        flaw: 'He has never once had to lie under pressure, and does not know that he is bad at it.',
        mannerism:
          'Remembers everyone’s name, always, instantly. In this city that is a miracle. It should be a clue.',
        catchphrase: 'Corvath keeps no grudges. Isn’t that a mercy?',
      },
      body: doc(
        p(
          t('Odo Crane has governed '),
          at('corvath'),
          t(' for thirty years and been re-elected eight times by people who could not have told you what he did last year. He is, by every measure the city can still take, an excellent magistrate.'),
        ),
        h(3, 'The tell'),
        p(
          t('He never forgets. Not a name, not a face, not a debt. Everyone in Corvath finds this delightful. '),
          at('hollis'),
          t(' has started finding it strange. Nobody has yet found it '),
          em('impossible'),
          t(' — which it is.'),
        ),
        h(3, 'How he opposes the party'),
        ul(
          li(p(t('Never with violence first. With permits, appointments, and generous offers of help.'))),
          li(p(t('He will offer to fund the repair of the Bell. He means it. A repaired Bell is a working Bell.'))),
          li(p(t('If pressed, he produces '), at('dinner'), t(' — an invitation the party cannot politely refuse.'))),
        ),
        quote(p(em('“I have read the Remembrance’s little book. I even believe most of it. Where we differ, Sister, is that you think it is an indictment and I think it is an invoice.”'))),
      ),
      secrets:
        'Odo Crane is a doppelganger (SRD, CR 3). The real Odo Crane — a decent, unremarkable clerk — died of a fever in the winter of 3196 and is buried under a name nobody checks.\n\nThe doppelganger did not take his place for power. It took his place because it feeds on what the Bell shakes loose: every Midwinter, four thousand people\'s worth of memory comes free of its moorings, and it eats in the gap between the toll and the taking. It has grown old and fat and genuinely fond of the city, the way a shepherd is fond of a flock.\n\nIt wants the Tolling to continue. That is the whole of its agenda. It will help the party repair the Bell with real money and real sincerity.\n\nThe unmasking problem: if the party expose it publicly, the city will not believe them. Corvath has forgotten every scandal it ever had; it has no living memory of a public figure ever being anything other than what he said he was. The doppelganger knows this. It is why it has never bothered to be careful.',
      relationships: [
        { targetId: ref('corvath'), relType: 'governs' },
        { targetId: ref('hollis'), relType: 'commands' },
        { targetId: ref('dinner'), relType: 'hosts' },
        { targetId: ref('vessarine'), relType: 'business partner' },
      ],
    },
  },
  {
    key: 'yzzy',
    type: 'npc',
    created: '2026-03-16',
    updated: '2026-06-28',
    input: {
      name: NAME.yzzy,
      playerVisible: false,
      tags: ['act-1', 'gutter-choir', 'ally', 'greywater'],
      data: {
        race: 'Halfling',
        role: 'Fence and courier for the Gutter Choir',
        alignment: 'Chaotic Good',
        status: 'alive',
        location: NAME.greywater,
        faction: 'The Gutter Choir',
        summary:
          'Runs contraband memory-jars out of Greywater. Will get you anything, including things you will wish she hadn’t.',
        traits:
          'Fast, funny, allergic to silence. Fills every pause with an offer. Has a professional’s memory for faces and an amateur’s inability to leave well enough alone.',
        ideal: 'If they’re going to take it from you anyway, you may as well sell it first.',
        bond: 'The Choir. Forty-odd people who sing on Midwinter night so they can hear each other over the Bell.',
        flaw: 'She has sold at least one memory she swore on her life she would keep.',
        mannerism: 'Talks with her hands full. Always carrying something she shouldn’t be.',
        catchphrase: 'No refunds, no returns, and no, I don’t know what’s in it.',
      },
      body: doc(
        p(
          t('The Gutter Choir’s trick is simple and illegal: '),
          at('jar'),
          t('. Decant a memory before Midwinter, bury the jar outside the city, dig it up in spring. The Bell can’t take what isn’t in your head.'),
        ),
        p(
          t('Yzzy runs the jars. She is the party’s way into '),
          at('undercroft'),
          t(', their fence for anything they pull out of it, and the only person in Corvath who will say the word "bargain" out loud in daylight.'),
        ),
        h(3, 'Complication'),
        p(
          t('Decanting is not clean. Jarred memories come back '),
          em('close'),
          t(' but not exact — and the difference compounds. Half the Choir are, very slightly, not who they were. They know. They keep singing.'),
        ),
      ),
      secrets:
        'The memory Yzzy sold: her brother Tam\'s last hour. She was nineteen and starving and a collector from the Magistracy offered eleven marks. She has spent twenty years buying pieces of it back off the grey market, and she has assembled about half. Some of what she has re-inserted is not his.\n\nShe does not know the buyer was Odo Crane. If she finds out, she will try to kill him alone, and the doppelganger will let her get close enough to make it look like a Choir plot.',
      relationships: [
        { targetId: ref('greywater'), relType: 'works out of' },
        { targetId: ref('jar'), relType: 'supplies' },
        { targetId: ref('undercroft'), relType: 'knows the way into' },
        { targetId: ref('alma'), relType: 'reluctant ally' },
      ],
    },
  },
  {
    key: 'wren',
    type: 'npc',
    created: '2026-03-23',
    updated: '2026-07-13',
    input: {
      name: NAME.wren,
      playerVisible: false,
      tags: ['act-3', 'belfry', 'the-crack', 'heartbreak'],
      data: {
        race: 'Human',
        role: 'Bell-loft apprentice (in truth: the Bellwright’s daughter)',
        alignment: 'Neutral Good',
        status: 'alive',
        location: NAME.belfry,
        faction: 'The Bellwrights',
        summary:
          'A ten-year-old who has never forgotten anything, in a city built entirely on forgetting.',
        traits:
          'Watchful. Patient in a way children are not supposed to be. Answers questions completely and literally. Has learned that being remembered is a thing you have to work at.',
        ideal: 'If I hold all of it, then none of it is gone. That’s a job. I can do a job.',
        bond: 'Her father, who is kind to her every single day, as if for the first time.',
        flaw: 'She has stopped asking him to remember. She just tells him her name again.',
        mannerism: 'Repeats your name back to you when you introduce yourself. Once. Quietly.',
        catchphrase: 'That’s all right. You can tell me again.',
      },
      body: doc(
        p(
          t('Wren lives in the loft of '),
          at('belfry'),
          t(', above the Bell, in the one room in Corvath where the tolling does not reach. She has lived there for ten years. '),
          at('ferran'),
          t(' has introduced himself to her five times.'),
        ),
        h(3, 'The scene that sells the campaign'),
        p(
          t('She knows everything. Every name the city has paid, every Midwinter, every face. Ask her about anyone and she will tell you, flatly and completely, the thing their own family has forgotten. She is not haunted by this. She thinks it is her job.'),
        ),
        quote(
          p(em('“He’s not bad at it. He’s good at it. That’s why it costs so much. Someone has to be good at it or everyone pays.”')),
          p(em('— Wren, ten years old, about her father, who does not know her name')),
        ),
        h(3, 'Hooks'),
        ul(
          li(p(t('She is the only person alive who can speak '), at('tobias'), t('’s name.'))),
          li(p(t('She has read '), at('ledger'), t(' once and can recite it. All of it.'))),
          li(p(t('She wears '), at('ribbon'), t('. Ask her where she got it. She will tell you the truth.'))),
        ),
      ),
      secrets:
        'Wren is the crack.\n\nWhen the Bell split, the bargain did not break — it rerouted. A debt that large does not simply stop; it finds the nearest vessel that can hold it. Wren was asleep in the loft, six feet above the Bell, and she has never forgotten anything in her life. Perfect capacity. The contract took the obvious option.\n\nShe is becoming the new Bell. It is not hurting her yet. By Midwinter she will be able to toll — and if she tolls, she pays, and she will pay the way Ferran pays: out of herself, forever, because she is good at it.\n\nThis is the endgame. There are three exits and the party must choose one:\n  1. Repair the Bell. Corvath keeps forgetting. Wren is released and gets to be ten.\n  2. Unmake the bargain (per Alma\'s forged entry — see GM ONLY note). Three hundred years of winter arrive at once for a city of 4,000.\n  3. Let Wren toll. She is willing. She will volunteer, cheerfully, because it is a job and she can do a job.\n\nThere is no fourth exit. Do not invent one at the table. Let them choose.',
      relationships: [
        { targetId: ref('ferran'), relType: 'father' },
        { targetId: ref('belfry'), relType: 'lives in' },
        { targetId: ref('ribbon'), relType: 'wears' },
        { targetId: ref('vessarine'), relType: 'owes (unknowing)' },
      ],
    },
  },
  {
    key: 'vessarine',
    type: 'npc',
    created: '2026-04-06',
    updated: '2026-07-05',
    input: {
      name: NAME.vessarine,
      playerVisible: false,
      tags: ['act-3', 'the-debt', 'villain', 'gm-only'],
      data: {
        race: 'Unknown; presents as an archfey',
        role: 'The creditor',
        alignment: 'Lawful Evil',
        status: 'unknown',
        location: 'Beneath the ice of ' + NAME.hollowmere,
        faction: 'The Debt',
        summary:
          'The thing the founders bargained with. It is not cruel and it is not lying. It is owed.',
        traits:
          'Courteous to the point of tenderness. Never interrupts. Never threatens — it simply restates the terms, and the terms are the threat. Finds human grief genuinely beautiful and says so, kindly, which is worse.',
        ideal: 'A promise is the only thing in this world that is exactly what it says it is.',
        bond: 'The contract. Not the city, not the memories — the contract.',
        flaw: 'It cannot conceive that anyone would refuse to pay a debt they freely took on.',
        mannerism: 'Answers the question you meant, not the one you asked.',
        catchphrase: 'You have kept excellent faith. I have kept better.',
      },
      body: doc(
        h(3, 'GM only'),
        p(
          t('Vessarine is the entity beneath '),
          at('hollowmere'),
          t('. Three hundred years ago the founders of '),
          at('corvath'),
          t(' walked out onto the ice in a killing winter and asked for help. It helped. It has never once failed to hold up its end.'),
        ),
        h(3, 'Running it'),
        ul(
          li(p(t('It cannot be tricked by wording. The contract is not the source of its power — the '), em('consent'), t(' is. Lawyering it is a trap for the party, not for it.'))),
          li(p(t('It will renegotiate. Cheerfully. Every offer it makes is honest and every one is worse than it sounds.'))),
          li(p(t('It has never lied to anyone in Corvath. Not once, in three centuries. Play that straight.'))),
        ),
        h(3, 'Statblock'),
        p(
          t('The ice-avatar the party can actually meet: use '),
          code('Night Hag'),
          t(' (SRD, CR 5) — Etherealness and the Nightmare Haunting are exactly right, reflavoured as debt-collection. The true form never leaves the lake and has no statblock, because it never needs one. It has never had to fight anybody. They always agree.'),
        ),
        quote(p(em('“I did not take your winters from you. You gave me your winters. I have kept them very safe. Would you like to see them?”'))),
      ),
      secrets:
        'The thing that makes Vessarine unbeatable is that it is owed. It is not a fiend; there is no loophole, no true name, no bargain-breaking clause. The founders got exactly what they asked for and it has been scrupulous ever since.\n\nThe only lever: the contract requires consent, and consent requires memory. A city that cannot remember agreeing cannot meaningfully keep agreeing. Vessarine has known this for three hundred years and has been quietly, patiently terrified of it — it is the one thing that could void the debt, and every Tolling brings the city closer to it.\n\nThis is why the Bell cracked. It did not crack by accident and Vessarine did not crack it. Ferran did, twenty-two years ago, the first time he paid out of his own memory to cover a short tithe — a hairline fracture that took two decades to travel. The man keeping the bargain alive is the man who broke it.',
      relationships: [
        { targetId: ref('hollowmere'), relType: 'dwells beneath' },
        { targetId: ref('odo'), relType: 'business partner' },
        { targetId: ref('lasttoll'), relType: 'appears in' },
      ],
    },
  },
  {
    key: 'hollis',
    type: 'npc',
    created: '2026-04-13',
    updated: '2026-06-20',
    input: {
      name: NAME.hollis,
      playerVisible: false,
      tags: ['act-2', 'magistracy', 'watch', 'swing-vote'],
      data: {
        race: 'Human',
        role: 'Captain of the Corvath Watch',
        alignment: 'Lawful Neutral',
        status: 'alive',
        location: NAME.corvath,
        faction: 'The Watch',
        summary:
          'An honest captain in a city with no memory of crime — and she has just started remembering.',
        traits:
          'Blunt, fair, deeply competent. Hates being lied to more than she hates being disobeyed. Writes everything down since about four months ago and will not say why.',
        ideal: 'The law is the only thing in this city that stays the same year to year.',
        bond: 'Her watch. Thirty-one of them. She knows every name and has begun to find that frightening.',
        flaw: 'She would rather be wrong in a straight line than right by a crooked one.',
        mannerism: 'Checks her notebook mid-sentence, then keeps talking without telling you what she read.',
        catchphrase: 'Say it again. Slower. I want to get it down.',
      },
      body: doc(
        p(
          t('Hollis is '),
          at('odo'),
          t('’s enforcement arm and the campaign’s swing vote. She is not corrupt and she is not stupid. She is simply the only person in Corvath doing her job with a full deck, and it is starting to show her the shape of the table.'),
        ),
        h(3, 'Her arc'),
        ol(
          li(p(t('Act 1 — she moves the party along. Politely.'))),
          li(p(t('Act 2 — she starts asking the party the questions she can’t ask '), at('odo'), t('.'))),
          li(p(t('Act 3 — she picks a side. Which side depends entirely on whether the party lied to her in Act 1.'))),
        ),
        p(t('Statblock: '), code('Veteran'), t(' (SRD, CR 3). She should never have to use it.')),
      ),
      secrets:
        'Hollis has begun remembering the last four Midwinters. She does not know why. (It is proximity — she has stood watch at the foot of the belfry every Midwinter for nine years, and the crack has been leaking for four.)\n\nShe has been quietly not-arresting the Gutter Choir for two years. She tells herself it is because they are harmless. It is actually because she recognises what they are doing: keeping things. She has a jar of her own buried outside the walls. She has never dug it up. She is afraid of what she chose to save.',
      relationships: [
        { targetId: ref('odo'), relType: 'serves' },
        { targetId: ref('corvath'), relType: 'keeps the peace in' },
        { targetId: ref('yzzy'), relType: 'deliberately not arresting' },
      ],
    },
  },
  {
    key: 'tobias',
    type: 'npc',
    created: '2026-05-11',
    updated: '2026-07-13',
    input: {
      name: NAME.tobias,
      playerVisible: false,
      tags: ['act-2', 'undercroft', 'undead', 'gm-only', 'live-session'],
      data: {
        race: 'Human (now a wight)',
        role: 'The man who paid twice',
        alignment: 'Lawful Neutral',
        status: 'dead',
        location: NAME.undercroft,
        faction: 'The Debt',
        summary:
          'Paid the tithe twice in one night and came back as something that remembers everything and forgives nothing.',
        traits:
          'Speaks in the cadence of a man reading a receipt aloud. Not angry. Owed. Will wait, motionless, for as long as it takes you to say the right thing.',
        ideal: 'I paid. Say that I paid. Say it where someone can hear.',
        bond: 'His own name, which no living person in Corvath can produce.',
        flaw: 'He will accept a lie if it is said kindly enough, and it will not hold.',
        mannerism: 'Never blinks. Waits a full beat too long before answering.',
        catchphrase: 'Who am I. Say it. You may look it up. I will wait.',
      },
      body: doc(
        h(3, 'GM only — the Undercroft wight'),
        p(
          t('Tobias Vane paid the tithe, and then — because the collector’s book had smudged and no one could remember whether he had — paid it again the same night. Nobody in '),
          at('corvath'),
          t(' remembers him doing either. That is the entire tragedy: the man overpaid and there is no one left who can confirm it.'),
        ),
        h(3, 'He is the negotiation, not the fight'),
        p(
          t('Tobias is the wight in '),
          at('ambush'),
          t('. He is '),
          bold('not hostile by default'),
          t(' — he is waiting. The ghasts and specters around him are; he does not command them and does not much care what they do.'),
        ),
        ul(
          li(p(t('He asks exactly one question: '), em('who am I?'))),
          li(p(t('Any answer that is a guess — he attacks. He can tell.'))),
          li(p(t('DC 15 Persuasion to buy time. DC 20 Investigation on the ossuary shelves to find the receipt.'))),
          li(p(t('Or: '), at('wren'), t(' is the only living person who can simply say it. If the party brought her — and they should not have — this fight ends in one sentence.'))),
        ),
        p(t('Statblock: '), code('Wight'), t(' (SRD, CR 3, AC 14, HP 45).')),
      ),
      secrets:
        'His receipt is in the Undercroft. Shelf 11, third rank, filed under the wrong year — which is precisely why the double payment was never caught.\n\nIf his name is spoken aloud by someone who actually knows it, he stops. He does not turn to dust, he does not ascend; he just sits down on the floor of the ossuary and becomes, permanently, a very quiet man who will answer any question about the last ninety years truthfully. He is the single best lore source in the campaign and the party can only unlock him by doing the hard, boring, decent thing: looking him up.',
      relationships: [
        { targetId: ref('undercroft'), relType: 'bound to' },
        { targetId: ref('ambush'), relType: 'appears in' },
        { targetId: ref('wren'), relType: 'can be named by' },
      ],
    },
  },

  /* ══════════════════════════ Locations ══════════════════════════ */
  {
    key: 'corvath',
    type: 'location',
    created: '2026-03-02',
    updated: '2026-07-10',
    input: {
      name: NAME.corvath,
      playerVisible: true,
      tags: ['act-1', 'hub', 'city'],
      soundtrack: track(MOOD.tavern, 'Greywater / tavern'),
      data: {
        locType: 'city',
        features:
          'Population ~4,000. Prosperous, clean, and pleasant in a way that puts your teeth on edge.\n\n• The Bell is visible from every street in the city. This is not an accident of terrain — the streets were laid out to guarantee it.\n• No graveyard older than thirty years. The old ones are still there. Nobody visits, because nobody can name anyone in them.\n• Almost nobody over sixty. They do not die; they leave. Around sixty you start to notice how little of you is left, and people walk out onto the mere.\n• Every ledger, deed, and record in the city is meticulous and goes back exactly three hundred years. The city is superb at writing things down. It has to be.\n• Nobody has a grudge. Nobody has a feud. Nobody has an old wound. It is the kindest city on the mere and something is deeply wrong with it.',
        readAloud:
          'Corvath is warm. That is the first thing, and the wrongest.\n\nIt is Midwinter on Hollowmere, the ice on the lake is a foot thick, and the city on its shore is warm — bread in the windows, shutters open, children out past dark with no coats on. Nobody hurries. Nobody is thin. Above it all, on the hill, the belfry holds the Bell, and every street you walk down is angled so that you can see it.\n\nA woman passes you and smiles and says good evening as though she knows you. Twenty paces on, she passes you again, and smiles, and says good evening as though she knows you.',
      },
      // Published to players — body is written for them. GM direction lives in `secrets`.
      body: doc(
        p(
          t('A city of about four thousand on the south shore of '),
          at('hollowmere'),
          t(', and the only warm place for nine miles in any direction. Bread in the windows, shutters open, children out past dark with no coats on.'),
        ),
        h(3, 'Getting your bearings'),
        ul(
          li(p(at('greywater'), t(' — the covered market. Warm, loud, free food at the Long Table, and a noticeboard by the door you will want to read.'))),
          li(p(t('The belfry — up the hill. The Bell of Saint Aurel is visible from every street in the city. You will find that you cannot stop checking for it.'))),
          li(p(t('The old graveyard — east wall. No stone in it is less than thirty years old and nobody visits.'))),
        ),
        h(3, 'Local custom'),
        ul(
          li(p(t('Coin is '), at('marks'), t(' — bronze, struck from bell-metal, worthless outside the walls.'))),
          li(p(t('Nobody here is over sixty. Ask about it and you will get a warm, cheerful, completely unbothered answer.'))),
          li(p(t('Nobody here holds a grudge. Not one person. It is the kindest city any of you have ever walked into.'))),
        ),
      ),
      secrets:
        'GM — running the city: the horror is not that people are sad. It is that they are FINE. Play every citizen as genuinely, unbearably content. The party will do the work of being disturbed for you.\n\nGoverned by Odo Crane. Policed by Hollis Drear. Undermined by Yzzy Marrow.\n\nThe street layout is the tell. A city planner who wanted everyone to be able to see the Bell is a city planner who knew you have to be in line of sight to pay. The founders built the sightlines in deliberately. It is in the original deeds, in plain language, and nobody has read the original deeds in two hundred years because there has never been a reason to.',
      relationships: [
        { targetId: ref('hollowmere'), relType: 'stands on' },
        { targetId: ref('belfry'), relType: 'contains' },
        { targetId: ref('greywater'), relType: 'contains' },
        { targetId: ref('undercroft'), relType: 'contains' },
      ],
    },
  },
  {
    key: 'belfry',
    type: 'location',
    created: '2026-03-02',
    updated: '2026-07-12',
    input: {
      name: NAME.belfry,
      playerVisible: false,
      tags: ['act-1', 'the-bell', 'landmark'],
      data: {
        locType: 'building',
        features:
          '• Ground floor — the Bellwright’s workshop. Rope, wax, wire, and a workbench worn into a shallow bowl.\n• The stair — 219 steps. The numbers are painted on. Ferran repaints them every spring. He does not know why he started.\n• The bell chamber — the Bell of Saint Aurel, four tons of bronze, and a hairline crack running from the lip to the crown that you can put a fingernail into.\n• The loft — six feet above the Bell. The only room in Corvath the tolling does not reach. Wren’s room.\n\nThe crack sings very faintly, all the time, in a note that is not quite a note. After an hour inside, PCs start finishing each other’s sentences. After four, they start finishing sentences that are not theirs.',
        readAloud:
          'The stair is numbered. Someone has painted a figure on every step in careful white — 1, 2, 3 — all the way up into the dark, and the paint is fresh.\n\nAt 219 the stair opens into cold air and the Bell fills the room, enormous, green-black, close enough to touch. And running up its flank, from lip to crown, is a crack as thin as a hair and as long as a man.\n\nIt is making a sound. Not a ring. Something more like a held breath. You realise you have been hearing it since you entered the city and mistook it for your own ears.',
      },
      body: doc(
        p(
          t('The Bell of Saint Aurel is the campaign in one object: four tons of bronze that keeps a city fed by taking a year out of it, and it is broken now, and the broken part is the only honest part of it.'),
        ),
        h(3, 'What the crack does'),
        ul(
          li(p(t('The Midwinter toll went out half-finished. The debt went unpaid.'))),
          li(p(t('Corvath is remembering. Not gently. See '), at('timeline'), t('.'))),
          li(p(t('The bargain rerouted. See '), at('wren'), t(' — and brace yourself.'))),
        ),
        h(3, 'The loft'),
        p(
          t('Six feet of bronze and floorboard between a ten-year-old and three hundred years of debt. '),
          at('ferran'),
          t(' put her up there when she was born, because it was the safest room in the city. He was right. That is the joke.'),
        ),
        p(t('Repairing it: see '), at('tuning'), t('. Bearing it: see '), at('tollhammer'), t('.')),
      ),
      secrets:
        'The crack is twenty-two years old and it is Ferran\'s fault — not through malice or error, but through decency. Every year he covered a short tithe out of his own memory, the Bell took the payment from a source the contract did not specify, and bronze under an unspecified load fatigues. It took two decades to travel from crown to lip.\n\nThe man who has kept the bargain alive longer than anyone is the man who broke it. He must never find this out from an NPC. Let a player work it out.',
      relationships: [
        { targetId: ref('corvath'), relType: 'inside' },
        { targetId: ref('ferran'), relType: 'kept by' },
        { targetId: ref('wren'), relType: 'home of' },
        { targetId: ref('undercroft'), relType: 'stands above' },
        { targetId: ref('tuning'), relType: 'site of' },
      ],
    },
  },
  {
    key: 'undercroft',
    type: 'location',
    created: '2026-05-04',
    updated: '2026-07-13',
    input: {
      name: NAME.undercroft,
      playerVisible: false,
      tags: ['act-2', 'dungeon', 'gm-only', 'live-session'],
      soundtrack: track(MOOD.dread, 'Dread / the Undercroft'),
      data: {
        locType: 'dungeon',
        features:
          'Under the belfry. Older than the belfry. Older, by the stonework, than Corvath.\n\n• The Filing — eleven ranks of shelves, floor to vault, holding three hundred years of receipts. Every tithe ever paid, itemised, in a hand that changes every forty years or so.\n• The Ossuary — what is left of the people who paid more than they had. Stacked with the same tidiness as the shelves.\n• The Grief Engine — a bronze mechanism in the central vault, still running. See the trap element.\n• The Cold Room — where a payment is held between the toll and the taking. Standing in it, a PC can hear their own memories being counted. It is not damaging. It is worse than damaging.\n\nThe whole place is immaculate. Someone dusts. Nobody knows who.',
        readAloud:
          'The stair down is older than the stair up. The steps are not numbered.\n\nThe vault below is dry, and cold, and clean — and it is a library. Eleven ranks of shelves run away into the dark, and every shelf is full of paper, and every sheet of paper is a receipt. Somebody has been filing here for three hundred years. Somebody has been dusting.\n\nAt the far end, something bronze is turning over, slowly, the way a sleeping animal turns over. It has been turning for three centuries. It has never once needed winding.',
      },
      body: doc(
        p(
          t('The Undercroft is where the city’s memory is '),
          em('kept'),
          t('. Not destroyed — filed. That distinction is the whole dungeon.'),
        ),
        h(3, 'What’s down here'),
        ul(
          li(p(t('The receipt for every tithe ever paid, including '), at('tobias'), t('’s, on shelf 11, filed under the wrong year.'))),
          li(p(t('Every name '), at('ferran'), t(' has paid out of himself. Twenty-two of them. One is '), at('wren'), t('.'))),
          li(p(t('The way down to the ice, and '), at('vessarine'), t('.'))),
        ),
        h(3, 'Encounters here'),
        p(at('ambush'), t(' (combat, running now) · '), at('griefengine'), t(' (trap)')),
        p(t('Access: '), at('yzzy'), t(' knows the way in. So does '), at('alma'), t(', and she will not take you.')),
      ),
      secrets:
        'The filing is the loophole nobody has looked for. The memories are not consumed — they are stored, itemised, and retrievable, because Vessarine is a creditor and creditors keep records.\n\nA party that thinks to ask "where does it GO?" instead of "how do we stop it?" can walk out of the Undercroft with three hundred years of Corvath in a handcart. It would not void the debt. It would simply mean the city could read what it had agreed to — and consent requires memory. See the GM ONLY note.\n\nThe dusting is Tobias. It has been Tobias for ninety years. He is very tidy and he is waiting to be looked up.',
      relationships: [
        { targetId: ref('belfry'), relType: 'beneath' },
        { targetId: ref('corvath'), relType: 'inside' },
        { targetId: ref('tobias'), relType: 'haunted by' },
        { targetId: ref('remembering'), relType: 'connects to' },
      ],
    },
  },
  {
    key: 'hollowmere',
    type: 'location',
    created: '2026-03-30',
    updated: '2026-06-15',
    input: {
      name: NAME.hollowmere,
      playerVisible: false,
      tags: ['act-1', 'region', 'winter'],
      soundtrack: track(MOOD.travel, 'Travel / the mere'),
      data: {
        locType: 'region',
        features:
          'The lake, the moor around it, and the four villages that are not Corvath.\n\n• The other villages — Thrush End, Cadder, Little Ash, and the one nobody names — are poor, cold, and hungry. They remember everything. They have three hundred years of grudges and every one of them is about Corvath.\n• The ice is a foot thick from first frost to thaw and has been for three hundred years, in every weather, including the summer of 3187 when it did not melt at all.\n• Winter does not fall on Corvath. It falls on everyone within nine miles of it. The bargain moved the weather; it did not remove it.\n• Wolves. Actual wolves, unrelated to the plot, because the moor is nine miles wide and something has to live on it.',
        readAloud:
          'You come over the shoulder of the moor an hour before dark and the whole mere is laid out below you: nine miles of flat white ice, and the villages around its edge shut up tight against the cold like fists.\n\nAnd on the far shore, warm as an ember, lit up, shutters open — Corvath.\n\nYour guide from Thrush End stops walking. He will not go closer. He does not explain, and when you ask, he says only: “We remember down here.”',
      },
      body: doc(
        p(
          t('Hollowmere is the argument. Corvath is warm because the mere is cold — the bargain did not delete winter, it '),
          em('relocated'),
          t(' it. Nine miles of hungry, freezing, perfectly clear-headed people who have watched a city eat their weather for three centuries.'),
        ),
        h(3, 'Use it for'),
        ul(
          li(p(t('The party’s way in — they arrive through the villages and hear the truth before they hear the lie.'))),
          li(p(t('Moral weight in Act 3. Unmaking the bargain '), em('helps'), t(' the mere. Ask the party if they noticed.'))),
          li(p(t('The crossing: '), at('crossing'), t('.'))),
        ),
        p(t('Beneath the ice: '), at('vessarine'), t('.')),
      ),
      secrets:
        'The village nobody names is called Vail. It tried the same bargain, ninety years ago, and Vessarine accepted — and Vail had nothing to pay with but itself, so it paid itself, and there is now a perfectly preserved village on the north shore with the fires lit and the tables laid and nobody in it, and it has been like that since 3212.\n\nIt is four hours\' walk from Corvath. Anyone can go and look. Nobody in Corvath ever has, because nobody in Corvath can remember that it is there.',
      relationships: [
        { targetId: ref('corvath'), relType: 'surrounds' },
        { targetId: ref('iceweir'), relType: 'contains' },
        { targetId: ref('vessarine'), relType: 'prison of' },
      ],
    },
  },
  {
    key: 'iceweir',
    type: 'location',
    created: '2026-04-20',
    updated: '2026-06-15',
    input: {
      name: NAME.iceweir,
      playerVisible: false,
      tags: ['act-2', 'wilderness', 'crossing'],
      data: {
        locType: 'wilderness',
        features:
          'Where the mere narrows and the ice goes strange.\n\n• The ice here is clear as glass and about three feet thick, and there are things visible in it at depth — furniture, a cart, a lit window, the roof of a building that is not on any map.\n• It is always eleven degrees colder on the weir than fifty yards either side of it.\n• Sound carries wrong. You hear the far bank as though it were beside you and your own party as though they were a mile off.\n• The only way down to Vessarine that does not go through the Undercroft.',
        readAloud:
          'The ice underfoot goes from white to grey to perfectly, horribly clear, and you are walking on a window.\n\nThirty feet down there is a street. Not a drowned street — a lit one. There are lamps burning under three feet of ice, and a door standing open, and the shadow of something moving across the light, unhurried, going about its evening.\n\nBehind you, faint and far away, someone in your own party asks if you are all right. They are standing next to you.',
      },
      body: doc(
        p(t('The weir is the front door to '), at('vessarine'), t(', and the campaign’s best set-piece for pure dread — nothing attacks. It is just a long, cold walk over a window with something living under it.')),
        p(t('Run it as '), at('crossing'), t('.')),
        h(3, 'The thing under the ice'),
        p(
          t('Do not describe it. Describe the lamps, the open door, the shadow crossing the light. The party will build something far worse than you can.'),
        ),
      ),
      secrets:
        'The street under the weir is Vail (see Hollowmere). It is not a vision and it is not below the ice — the ice is a window into the Remembering, and Vail is filed there, whole, exactly as it was, with the fires still lit.\n\nA PC who breaks through and goes in can walk its streets. Everything works. The bread is warm. They can stay as long as they like. Nothing will hurt them. Getting out requires someone on the surface who remembers their name — and that is the entire horror of the scene, because the party is in Corvath, and Corvath forgets.',
      relationships: [
        { targetId: ref('hollowmere'), relType: 'part of' },
        { targetId: ref('crossing'), relType: 'site of' },
        { targetId: ref('remembering'), relType: 'window into' },
      ],
    },
  },
  {
    key: 'greywater',
    type: 'location',
    created: '2026-03-16',
    updated: '2026-06-28',
    input: {
      name: NAME.greywater,
      playerVisible: true,
      tags: ['act-1', 'hub', 'social', 'shopping'],
      soundtrack: track(MOOD.tavern, 'Greywater / tavern'),
      data: {
        locType: 'building',
        features:
          'The covered market. Warm, loud, and the best-provisioned market for ninety miles, which is itself a symptom.\n\n• Alma’s stall — sells nothing, takes statements.\n• The Choir’s corner — jars, allegedly for pickling. Ask for Yzzy.\n• The Long Table — communal eating, free, always full, paid for by the Magistracy. Odo does this because he is fond of them. That is true and it is also how he keeps a hand on the city’s pulse.\n• The noticeboard — a wall of “do you know me?” notices. Sketches, names, dates. Some have been there thirty years. Nobody takes them down.',
        readAloud:
          'Greywater is the warmest room you have been in for a month and it smells like bread and wet wool and it is very, very loud.\n\nThere is a long table down the middle of it where anyone can sit and eat for nothing, and it is full, and people are laughing.\n\nAnd on the wall by the door, floor to ceiling, there are notices. Hundreds of them. Every one is a sketch of a face and a name and a date, and every one says the same thing at the top, in a different hand:\n\nDO YOU KNOW ME?',
      },
      // Published to players — body is written for them. GM direction lives in `secrets`.
      body: doc(
        p(
          t('The covered market of '),
          at('corvath'),
          t(', and the warmest room you have been in for a month. It smells like bread and wet wool and it is very, very loud.'),
        ),
        h(3, 'What you can do here'),
        ul(
          li(p(t('Eat at the Long Table — communal, free, always full, paid for by the Magistracy. Nobody will ask you for anything.'))),
          li(p(t('Buy almost anything. It is the best-provisioned market for ninety miles.'))),
          li(p(t('Give a statement to Sister Thorne, who keeps a stall that sells nothing and will write down anything you tell her.'))),
          li(p(t('Ask the Choir’s corner for Yzzy, if you want the sort of thing that is not sold at a stall.'))),
        ),
        h(3, 'The noticeboard'),
        p(
          t('By the door, floor to ceiling. Hundreds of notices, each one a sketch of a face and a name and a date, each one headed, in a different hand:'),
        ),
        quote(p(bold('DO YOU KNOW ME?'))),
        p(t('Some have been there thirty years. Nobody takes them down. You may read them for as long as you like.')),
      ),
      secrets:
        'The noticeboard is the single best clue in Act 1 and it costs nothing to look at. The oldest notices are thirty years old, in a careful hand, and there are 22 of them, and they are all signed F.V.\n\nFerran has been putting up a notice for every name he pays. He does not remember doing it. He does it every spring, the same week he repaints the numbers on the stair, and he could not tell you why he does either.\n\nOne of the notices is a sketch of a small girl with a ribbon in her hair. It is the most recent. It went up four months ago.',
      relationships: [
        { targetId: ref('corvath'), relType: 'inside' },
        { targetId: ref('yzzy'), relType: 'haunt of' },
        { targetId: ref('alma'), relType: 'haunt of' },
      ],
    },
  },
  {
    key: 'remembering',
    type: 'location',
    created: '2026-06-01',
    updated: '2026-07-05',
    input: {
      name: NAME.remembering,
      playerVisible: false,
      tags: ['act-3', 'plane', 'gm-only'],
      data: {
        locType: 'plane',
        features:
          'A demiplane. Everything Corvath has ever paid, kept perfectly, in the shape it was paid in.\n\n• It is not a wasteland or a dream. It is Tuesday. Every Tuesday the city ever gave away, running concurrently, laid out like a fairground.\n• Time does not pass. Things do not decay. Vail is here (see the Ice Weir). So is every face on the Greywater noticeboard.\n• It is inhabited. Not by monsters — by moments. A woman finishing a sentence she started in 3140. She will finish it. She has been finishing it for a century and she is not suffering.\n• Getting out requires being remembered by someone outside. That is the only exit condition. There is no other door.',
        readAloud:
          'You expected somewhere terrible.\n\nIt is a summer afternoon. It is the same summer afternoon in every direction, as far as you can see, and it is beautiful. There is a woman at a window telling someone she loves them, and thirty feet away there is the same woman at the same window telling the same person the same thing, and beyond her another, and another, out to the horizon.\n\nNone of them are in pain. Not one. That is what you will not be able to explain afterwards.',
      },
      body: doc(
        p(t('Where it all went. Reachable via '), at('undercroft'), t(', visible through '), at('iceweir'), t('.')),
        h(3, 'The rule'),
        p(
          bold('You leave when someone outside remembers you.'),
          t(' That is the only exit. Establish it early, hard, and without mercy — then let the party walk in anyway, because they will.'),
        ),
        h(3, 'Why this matters'),
        p(
          t('The party is from outside Corvath. They remember each other. They are the only people in three hundred years who can go in and come out. '),
          at('alma'),
          t(' has known this since the day they arrived and has been waiting for the right moment to say so.'),
        ),
        p(t('Plane type: use the Demiplanes entry in the SRD reference (Planes → Demiplanes).')),
      ),
      secrets:
        'The Remembering is not Vessarine\'s vault. It is Vessarine. The plane is what the thing under the ice is made of; three hundred years of Corvath\'s memory IS its body, and it has been growing one Tuesday at a time.\n\nThis reframes the endgame: unmaking the bargain does not free the memories, it kills the thing they now constitute — including every person filed inside it, including Vail, including the woman at the window. She is not a recording. Ask her.\n\nThe party will not think of this. Vessarine will mention it, courteously, at the worst possible moment, and it will be telling the truth, because it always is.',
      relationships: [
        { targetId: ref('vessarine'), relType: 'is' },
        { targetId: ref('undercroft'), relType: 'reached through' },
        { targetId: ref('iceweir'), relType: 'seen through' },
      ],
    },
  },

  /* ══════════════════════════ Encounters ══════════════════════════ */
  {
    key: 'ambush',
    type: 'encounter',
    created: '2026-05-11',
    updated: '2026-07-13',
    input: {
      name: NAME.ambush,
      playerVisible: false,
      tags: ['act-2', 'combat', 'undercroft', 'live-session'],
      soundtrack: track(MOOD.combat, 'Combat'),
      data: {
        encType: 'combat',
        status: 'in-progress',
        trigger:
          'The party disturbs the Filing — pulling any receipt off any shelf in the Undercroft. Whatever was paid for on that page comes to collect.',
        objective:
          'Survive, or better: work out that the wight is not attacking and never was.\n\nThe ghasts and specters are mindless collection — they go for whoever is holding paper. Tobias Vane simply stands at the end of rank 11 and asks one question. Every round the party spends fighting him is a round they are not spending looking him up.\n\nWin condition the party will miss: DC 20 Investigation on shelf 11 finds his receipt, filed under 3159 instead of 3158. Speak his name and he sits down. The ghasts do not stop — but he will answer questions while they are eating you, which is very much in character.',
        combatants: '2x Ghast\n3x Specter\nTobias Vane (Wight)',
        xp: 2200,
        gold: 0,
        rewards:
          'Tobias’s receipt (shelf 11, third rank, misfiled under 3159).\nA Clapper Shard, if anyone thinks to look at what the specters are circling.\nTobias himself, if they do the decent boring thing — permanently, and he is the best lore source in the campaign.',
        outcome:
          'IN PROGRESS — round 3. Brannock is down at 0 and failing saves; Vespera is Frightened at 8 HP; Nim has just noticed that the wight has not attacked anybody. See the live session tracker.',
      },
      body: doc(
        p(
          t('Set-piece in '),
          at('undercroft'),
          t('. Deliberately '),
          bold('deadly'),
          t(' on the DMG maths (2,200 XP raw → ×2 for five-plus monsters → 4,400 adjusted, against a deadly threshold of 2,000 for four 4th-level PCs). That is intentional and it is a lie.'),
        ),
        h(3, 'Why the maths is a lie'),
        p(
          t('The wight is 700 of that XP and it is not going to attack unless the party swings first or guesses at his name. The real fight is 1,500 XP → ×2 for four monsters → 3,000. Still hard. Survivable.'),
        ),
        p(t('If the party attacks '), at('tobias'), t(', it becomes exactly as deadly as the number says. That is the lesson and it is worth a character.')),
        h(3, 'Terrain'),
        ul(
          li(p(t('The shelves are cover and they are '), em('flammable'), t(', and the party will work that out, and it will cost them the receipt they need.'))),
          li(p(t('The Grief Engine is in the next vault, still turning. See '), at('griefengine'), t('.'))),
          li(p(t('Specters move through the shelving. There is no such thing as a back rank down here.'))),
        ),
        quote(p(em('“Who am I. Say it. You may look it up. I will wait.”'))),
      ),
      secrets:
        'If the party kills Tobias instead of naming him, they lose the receipt archive forever — he is the only one who knows the filing system, and shelf 11 is misfiled by design. Every subsequent lore question in the campaign gets harder. Do not tell them what they lost. Let them find out in Act 3 when they need a name and there is nobody to ask.',
      relationships: [
        { targetId: ref('undercroft'), relType: 'takes place in' },
        { targetId: ref('tobias'), relType: 'features' },
        { targetId: ref('shard'), relType: 'rewards' },
      ],
    },
  },
  {
    key: 'dinner',
    type: 'encounter',
    created: '2026-04-27',
    updated: '2026-07-11',
    input: {
      name: NAME.dinner,
      playerVisible: false,
      tags: ['act-2', 'social', 'magistracy', 'no-combat'],
      data: {
        encType: 'social',
        status: 'planned',
        trigger:
          'The party becomes inconvenient in any public way. Within a day, a very good invitation arrives, handwritten, correctly spelling names they have not given anyone.',
        objective:
          'Odo Crane offers to fund the repair of the Bell. Completely. No conditions, no catch, no leverage.\n\nHe means it. It is not a trick. A repaired Bell is a working Bell and the party would be doing his job for him — and he will say so, out loud, because he has nothing to hide that they could use.\n\nThe encounter is won by declining a genuinely good offer for reasons the party cannot yet articulate. There is no skill check that beats this. He is not lying, so Insight tells them he is not lying.',
        combatants:
          'No combat. If it comes to blows the party has already lost this scene.\nOdo Crane — Doppelganger (SRD, CR 3), and he will not fight; he will call the Watch and be entirely within his rights.\nCaptain Hollis Drear — Veteran (SRD, CR 3), present, listening.\n4x Guard',
        xp: 700,
        gold: 0,
        rewards:
          'The offer itself: 5,000gp of bell-founding, no strings.\nHollis Drear’s attention — she is at this table and she is watching how the party handles a kind man. Whatever they do here decides her Act 3.',
        outcome: '',
      },
      body: doc(
        p(
          t('The best scene in the campaign and there is not a single die roll in it. '),
          at('odo'),
          t(' is charming, generous, correct about everything, and the villain.'),
        ),
        h(3, 'The four beats'),
        ol(
          li(p(t('He names every PC correctly, including the one who has not introduced themselves.'))),
          li(p(t('He agrees with everything '), at('alma'), t(' has told them. All of it. Cheerfully.'))),
          li(p(t('He offers to pay for the repair. All of it. No conditions.'))),
          li(p(t('He asks, gently, what they think should happen to the four thousand people if he doesn’t.'))),
        ),
        h(3, 'The tell, if anyone is listening'),
        p(
          t('He remembers. Everything. In a city where nobody does. '),
          at('hollis'),
          t(' has been noticing this for four months and has not let herself finish the thought. If a PC says it out loud at this table, watch her face.'),
        ),
        quote(p(em('“You want to give them back their grief. I have read the ledger, I know precisely what I am declining to give them, and I decline. Now — the fish is very good, and you have not touched it.”'))),
      ),
      secrets:
        'He knows what the party is. He knows they can walk into the Remembering and come out, because they remember each other. That is the only reason this dinner is happening — he wants to see whether they have worked it out yet.\n\nIf they have: the offer stands and a very good Assassin (SRD, CR 8) is retained before dessert.\nIf they have not: the offer stands and he is genuinely, warmly relieved, and the fish really is very good.',
      relationships: [
        { targetId: ref('odo'), relType: 'features' },
        { targetId: ref('hollis'), relType: 'features' },
        { targetId: ref('corvath'), relType: 'takes place in' },
      ],
    },
  },
  {
    key: 'crossing',
    type: 'encounter',
    created: '2026-04-20',
    updated: '2026-06-15',
    input: {
      name: NAME.crossing,
      playerVisible: false,
      tags: ['act-2', 'exploration', 'dread', 'iceweir'],
      soundtrack: track(MOOD.travel, 'Travel / the mere'),
      data: {
        encType: 'exploration',
        status: 'planned',
        trigger: 'The party crosses the Ice Weir on foot — the only route to Vessarine that avoids the Undercroft.',
        objective:
          'Get across. Nine hundred yards of clear ice with a lit street thirty feet below it.\n\nNothing attacks. That is the point. Run it as a skill challenge — 6 successes before 3 failures, rotating so nobody sits out:\n• Survival (DC 13) — read the ice. Failure: someone goes through.\n• Perception (DC 15) — notice the shadow crossing the lamplight below is keeping pace.\n• Wisdom save (DC 14) — do not look down for too long. Failure: 1 level of exhaustion, and you have seen someone you know down there.\n• Athletics (DC 12) — haul someone out.\n\nFailures do not deal damage. Failures put a PC through the ice, and through the ice is the Remembering, and the way out of the Remembering is being remembered.',
        combatants:
          'Nothing. Do not add anything.\nIf the group needs teeth: 2x Ice Mephit (SRD, CR 1/2) as a release valve — but the scene is better without them and you know it.',
        xp: 450,
        gold: 0,
        rewards:
          'Passage to Vessarine.\nWhatever they saw under the ice, which is worth more than treasure and will cost you an hour of table time in the best way.',
        outcome: '',
      },
      body: doc(
        p(t('The dread showpiece. Nine hundred yards, no monsters, one window. Run '), at('iceweir'), t('’s read-aloud and then get out of the way.')),
        h(3, 'The escalation'),
        ol(
          li(p(t('First 300 yards — the ice is grey. Ordinary. Cold.'))),
          li(p(t('Middle 300 — it goes clear. The lamps. The open door.'))),
          li(p(t('Last 300 — the shadow below is keeping pace with the party. It has been for a while.'))),
        ),
        h(3, 'If someone goes through'),
        p(
          t('They do not drown. They land in '),
          at('remembering'),
          t(', on a summer afternoon, and it is lovely, and the way out is for someone up top to remember their name — '),
          bold('within about a minute'),
          t(', because it is very nice down there.'),
        ),
        p(t('This is the campaign’s single best use of the players’ own memory. Do not warn them. Ask for the name.')),
      ),
      secrets:
        'Ask the player of the PC who fell to sit out and say nothing. Then ask the rest of the table, cold, with no notes: what is their full name?\n\nSome tables get it in a heartbeat. Some tables sit there. Either way they will remember this scene for years, and it costs you nothing but nerve. If the table genuinely cannot produce it, that is a real answer, and Vail gets one more resident — pull them out at the top of the next session via Alma, who wrote it down, because that is what she is for.',
      relationships: [
        { targetId: ref('iceweir'), relType: 'takes place at' },
        { targetId: ref('remembering'), relType: 'leads to' },
        { targetId: ref('vessarine'), relType: 'leads to' },
      ],
    },
  },
  {
    key: 'tuning',
    type: 'encounter',
    created: '2026-06-08',
    updated: '2026-07-12',
    input: {
      name: NAME.tuning,
      playerVisible: false,
      tags: ['act-3', 'puzzle', 'belfry', 'the-bell'],
      data: {
        encType: 'puzzle',
        status: 'planned',
        trigger: 'The party attempts to repair the Bell — with Odo’s money, Ferran’s hands, or their own.',
        objective:
          'The Bell must be re-tuned before it can be re-hung, and a bell is tuned by taking bronze away, never by adding it. You cannot fill the crack. You can only remove material until what is left rings true.\n\nThe puzzle: the Bell rings five partials (hum, prime, tierce, quint, nominal). Four are true. One is flat, and it is the hum — the note under everything, the one you feel rather than hear.\n\nTo tune the hum you must cut away the crown. The crown is where twenty-two names are inscribed. Ferran put them there. He does not remember doing it. They are the twenty-two people he paid out of himself, and one of them is Wren.\n\nTune the Bell, lose the names. That is the puzzle. There is no third option and no clever spell — this is metallurgy, not magic.',
        combatants: 'None. Ferran Volk is present and must not be lied to.',
        xp: 1800,
        gold: 0,
        rewards:
          'A working Bell.\nA cost the party chose with their eyes open, which is the only kind this campaign deals in.',
        outcome: '',
      },
      body: doc(
        p(t('The puzzle is real bell-founding: you tune by '), bold('removing'), t(' metal. There is no adding. Every player who has ever fixed anything will reach for solder and the answer is no.')),
        h(3, 'The five partials'),
        ul(
          li(p(t('Hum, prime, tierce, quint, nominal — four ring true, the hum is flat.'))),
          li(p(t('DC 15 Performance or proficiency with any instrument identifies which. A PC with smith’s tools gets it free.'))),
          li(p(t('Tuning the hum means cutting the crown. The crown carries the twenty-two names.'))),
        ),
        h(3, 'What it costs'),
        p(
          t('The names on the crown are the only record that '),
          at('ferran'),
          t(' ever paid anything. Cut them away and he has been a kind man who rang a bell, and nothing else, forever. One of the names is '),
          at('wren'),
          t('.'),
        ),
        p(
          t('Copy them first — obviously. '),
          at('alma'),
          t(' will beg to. But '),
          at('ledger'),
          t(' is a book, and a book is not a bell, and the names on the crown are '),
          em('load-bearing'),
          t('. That is not a metaphor. Ask the party what they think has been holding the debt for twenty-two years.'),
        ),
      ),
      secrets:
        'The crown inscriptions are the fifth partial. Ferran did not decorate the Bell — he repaired it, instinctively, the only way a Bellwright could: he wrote what he paid onto the metal, and the metal took the load. Twenty-two names have been carrying three hundred years of debt.\n\nCut them away and the Bell rings true and the debt has nowhere to sit — so it goes to the nearest vessel with capacity. Which is Wren, six feet above, who has never forgotten anything.\n\nTuning the Bell IS choosing option 3. The party will not realise this until they hear it ring. Let them hear it ring.',
      relationships: [
        { targetId: ref('belfry'), relType: 'takes place at' },
        { targetId: ref('ferran'), relType: 'features' },
        { targetId: ref('tollhammer'), relType: 'requires' },
        { targetId: ref('wren'), relType: 'endangers' },
      ],
    },
  },
  {
    key: 'griefengine',
    type: 'encounter',
    created: '2026-05-25',
    updated: '2026-07-02',
    input: {
      name: NAME.griefengine,
      playerVisible: false,
      tags: ['act-2', 'trap', 'undercroft', 'gm-only'],
      soundtrack: track(MOOD.dread, 'Dread / the Undercroft'),
      data: {
        encType: 'trap',
        status: 'planned',
        trigger:
          'Entering the central vault of the Undercroft while carrying anything taken from the Filing. The Engine does not defend the vault. It processes what enters it.',
        objective:
          'Get through the vault without being filed.\n\nThe Engine (bronze, three centuries old, still turning, never wound) does one thing: it takes a memory, itemises it, and shelves it. It is not a weapon and it does not consider you an intruder. You are a deposit.\n\nMechanics — at the start of each turn in the vault, each creature makes a DC 15 Wisdom save.\n• Fail: lose one memory. The PLAYER chooses which, from their own character’s backstory, and it is gone — struck off the sheet, no take-backs, no restoration spell. Bonds and flaws written in Session Zero are the intended fuel.\n• Fail by 5+: also gain 1 level of exhaustion as the itemising takes hold.\n• Three failures: the PC is filed. They are in the Remembering. The rules of the Remembering apply.\n\nDisarming: DC 18 Thieves’ Tools jams it for 1 minute; it un-jams itself, tidily, with no hard feelings. Dispel magic does nothing — it is not magic, it is bookkeeping. Smashing it (AC 17, HP 90, immune to poison/psychic) works, and every receipt in the Undercroft becomes unreadable within the hour, including the one on shelf 11 that the party needs.',
        combatants:
          'The Engine itself does not fight. If you want it to have hands: 2x Animated Armor (SRD, CR 1) as filing clerks — they will politely try to shelve unconscious PCs.',
        xp: 1100,
        gold: 0,
        rewards:
          'Passage.\nAnd a table full of players who now understand, viscerally, what the city has been paying — because they just paid it.',
        outcome: '',
      },
      body: doc(
        p(t('The trap in '), at('undercroft'), t(' that costs character sheet, not hit points. Read '), at('sessionzero'), t(' before you run it — this needs consent and it needs to have been telegraphed.')),
        h(3, 'The rule that makes it land'),
        p(bold('The player chooses what they lose.'), t(' Not you, not a die. Hand it back to them. It is the difference between a trap and a scene.')),
        h(3, 'Telegraph it — twice'),
        ul(
          li(p(t('The Cold Room, one vault earlier: a PC hears their own memories being counted. Nothing is taken. It is a demonstration.'))),
          li(p(t('The Filing itself: hand a player a receipt with their own PC’s name on it, dated three days from now. Then move on. Do not explain.'))),
        ),
        p(t('Smashing it is a real option with a real cost — it destroys '), at('tobias'), t('’s receipt, and with it the best lore source in the campaign.')),
        quote(p(em('It is not hostile. It has never been hostile. It is simply very good at its job and you have walked into the intake.'))),
      ),
      secrets:
        'The Engine is the mechanism of the bargain — the actual, physical hardware of the contract. It has been running for three hundred years and it has never been wound because it runs on what it takes.\n\nBreak it and the Tolling stops permanently and the debt goes unpaid forever, which sounds like victory and is not: an unpaid debt of that size does not evaporate, it accrues. Vessarine will be exquisitely polite about the interest.\n\nAlso: the receipt with a PC\'s name and a future date is real. Somebody has already filed for them. It is Odo, and he did it the day they arrived, because he is a careful administrator and this is what careful administration looks like.',
      relationships: [
        { targetId: ref('undercroft'), relType: 'takes place in' },
        { targetId: ref('remembering'), relType: 'files into' },
        { targetId: ref('vessarine'), relType: 'serves' },
      ],
    },
  },
  {
    key: 'lasttoll',
    type: 'encounter',
    created: '2026-06-22',
    updated: '2026-07-08',
    input: {
      name: NAME.lasttoll,
      playerVisible: false,
      tags: ['act-3', 'combat', 'climax', 'boss'],
      soundtrack: track(MOOD.boss, 'The Last Toll'),
      data: {
        encType: 'combat',
        status: 'planned',
        trigger: 'Midwinter night. Whatever the party chose, this is where it happens.',
        objective:
          'The finale, and it is not a fight until the party makes it one.\n\nVessarine comes up through the ice at moonrise to be paid. It is courteous. It has the contract. It is owed and it has never once failed to hold up its end, and it will say so, and it will be telling the truth.\n\nThree endings, all valid, none clean:\n1. THE BELL IS REPAIRED — it tolls, the city forgets, everyone lives, Wren is released. Vessarine thanks the party, sincerely. This is the "good" ending and the party will feel filthy.\n2. THE BARGAIN IS UNMADE — three hundred years of winter arrive at once on 4,000 people, and the Remembering dies, and every soul filed in it dies with it, including Vail, including the woman at the window.\n3. WREN TOLLS — she volunteers. Cheerfully. Because it is a job and she can do a job. The city is saved, the debt is paid, and she pays it forever.\n\nCombat only happens if the party swings first. If they do, run it. It is a real fight and it is not winnable in the way they hope.',
        combatants:
          'Vessarine (ice-avatar) — Night Hag (SRD, CR 5). Etherealness and Nightmare Haunting reflavoured as collection.\n3x Wight — the Watch of the paid, in whatever the party made of them.\n2x Will-o’-Wisp — the last two lamps of Vail.\nOdo Crane — Doppelganger (SRD, CR 3), present, and he will fight for Vessarine, and he will be sad about it.\n\nAdjusted XP ~4,000 vs four 8th-level PCs (deadly = 2,800). It is supposed to be.',
        xp: 4000,
        gold: 3000,
        rewards:
          'The Tollhammer of Saint Aurel, if it is not already theirs.\nThe contract itself — three hundred years old, signed, and every signature is real.\nWhichever ending they chose, and the rest of their lives to think about it.',
        outcome: '',
      },
      body: doc(
        p(t('Midwinter. Moonrise. '), at('vessarine'), t(' comes up through the ice to be paid, and it is polite, and it is right.')),
        h(3, 'Run the conversation first'),
        p(
          t('It will not attack. It has never had to. It will lay out the terms, agree with every objection the party raises, and then ask — reasonably — to be paid.'),
        ),
        h(3, 'The three exits'),
        ol(
          li(p(bold('Repair the Bell'), t(' — the city forgets, '), at('wren'), t(' goes free, and the party lives with it.'))),
          li(p(bold('Unmake the bargain'), t(' — three centuries of winter in one night, and '), at('remembering'), t(' dies with everyone in it.'))),
          li(p(bold('Let her toll'), t(' — she will offer. She will '), em('volunteer'), t('. See her secrets and then decide whether you can say it out loud at your own table.'))),
        ),
        h(3, 'If they fight'),
        p(t('Then they fight. '), at('odo'), t(' fights for it, and he is sorry, and he does not stop. Play the Night Hag straight and let Etherealness be as unfair as it is.')),
        quote(p(em('“I have been owed for three hundred years and I have never once come early. Do not mistake patience for weakness. Mistake it for what it is: I was always going to be paid.”'))),
      ),
      secrets:
        'Do not put a thumb on this scale. There is no secret fourth option and if you invent one at the table you will cheapen four months of play.\n\nThe one thing to hold in reserve: if the party chooses (2), Vessarine tells them — courteously, mid-ritual, too late — that the Remembering is its body, and that everything in it dies. It is not a threat and it is not a bluff. It has never lied to anyone in Corvath in three hundred years and it is not going to start on the last night.\n\nAnd Wren will offer. Out loud, in front of everyone, cheerfully. Ferran will not know who she is. Let that sit for a full ten seconds before anyone speaks.',
      relationships: [
        { targetId: ref('vessarine'), relType: 'features' },
        { targetId: ref('wren'), relType: 'features' },
        { targetId: ref('odo'), relType: 'features' },
        { targetId: ref('belfry'), relType: 'takes place at' },
        { targetId: ref('tollhammer'), relType: 'requires' },
      ],
    },
  },

  /* ══════════════════════════ Items ══════════════════════════ */
  {
    key: 'tollhammer',
    type: 'item',
    created: '2026-03-02',
    updated: '2026-07-12',
    input: {
      name: NAME.tollhammer,
      playerVisible: false,
      tags: ['act-3', 'legendary', 'the-bell', 'attunement'],
      data: {
        itemType: 'weapon',
        rarity: 'legendary',
        attunement: 'yes',
        ownership: 'npc',
        value: 0,
        weight: 12,
        effect:
          'Warhammer, +2. Requires attunement by a creature that has willingly given up a memory.\n\nThe Bellwright’s hammer. Seven of them have carried it. It is the only object that can strike the Bell of Saint Aurel and make it ring true.\n\n• +2 warhammer. On a hit, the target hears a bell, faintly, for 1 minute.\n• TOLL (1/day, action): strike any surface. Every creature within 60 ft that can hear it makes a DC 17 Wisdom save or is Stunned until the end of your next turn. Undead have disadvantage. Vessarine and its servants are immune — the Bell is theirs.\n• PAY (1/dawn, reaction, when you would drop to 0 HP): you drop to 1 HP instead. You permanently lose one memory of your choosing. The DM does not choose. You do.\n• Attunement is not free and not reversible. To attune you give a memory to the hammer, willingly, and it keeps it. It has twenty-two in it already, and they are not yours, and on a long rest you will dream one.',
      },
      body: doc(
        p(t('Carried by '), at('ferran'), t(', who has carried it for thirty-one years and could not tell you where he got it.')),
        h(3, 'Why it matters'),
        p(t('It is the only thing that can ring the Bell true, which makes it mandatory for '), at('tuning'), t(' and for '), at('lasttoll'), t('. It is also, quietly, the campaign’s best character-writing prompt: '), bold('PAY'), t(' asks a player to spend their own backstory to stay alive.')),
        h(3, 'The twenty-two'),
        p(t('The memories inside it are the same twenty-two names inscribed on the Bell’s crown. On a long rest, an attuned PC dreams one — start with the harmless ones. Save '), at('wren'), t(' for when it will land.')),
        quote(p(em('“It doesn’t take. That’s the whole of it. Every one of them, I handed over. Don’t let anyone tell you it took them.”'))),
      ),
      secrets:
        'The hammer is where Ferran\'s memories actually went. Not the Bell — the hammer. He has been paying into it for twenty-two years and it has kept every one, perfectly, itemised, retrievable.\n\nWren is in there. Whole. Every birthday, every name he gave her, the whole ten years.\n\nAny attuned PC could dream her. Any attuned PC could tell him. The party will hold the answer to the campaign\'s worst wound in their hands for months before anyone thinks to ask what the hammer is full of.',
      relationships: [
        { targetId: ref('ferran'), relType: 'borne by' },
        { targetId: ref('belfry'), relType: 'tunes' },
        { targetId: ref('tuning'), relType: 'required for' },
      ],
    },
  },
  {
    key: 'ledger',
    type: 'item',
    created: '2026-03-02',
    updated: '2026-07-09',
    input: {
      name: NAME.ledger,
      playerVisible: false,
      tags: ['act-1', 'artifact', 'lore', 'quest-item'],
      data: {
        itemType: 'quest',
        rarity: 'artifact',
        attunement: 'no',
        ownership: 'npc',
        value: 0,
        weight: 9,
        effect:
          'A book. No bonuses, no attunement, no magic whatsoever — and it is an artifact because of what it is, not what it does.\n\nThree hundred years of tithes, itemised: every name Corvath has paid, every Midwinter, in eleven different hands. It is the only document in the world that proves the bargain exists.\n\n• Reading any single year takes 1 hour and is not pleasant.\n• Reading your own name in it is a DC 13 Wisdom save. On a failure: 1 level of exhaustion and you cannot stop reading for an hour.\n• It cannot be copied. Alma has tried eleven times. The copies are always correct and they are never the Ledger, and she cannot explain the difference and neither can you.\n• Destroying it changes nothing. The debt is not in the book. The book is just the only place anyone wrote it down.',
      },
      body: doc(
        p(t('Kept by '), at('alma'), t('. Re-copied eleven times, twice in her own blood. She carries it out of the city every Midwinter and does not come back until the thaw.')),
        h(3, 'What it gives the party'),
        ul(
          li(p(t('The founding bargain, verbatim, including the consent clause.'))),
          li(p(t('Every name '), at('ferran'), t(' has paid. All twenty-two.'))),
          li(p(t('The entry stating the Bell can be unmade — which is the campaign’s spine, and which is a forgery.'))),
        ),
        h(3, 'The forgery'),
        p(
          t('Three entries in the Ledger are false. Alma wrote them herself, over sixty years, each time she came close to giving up. She no longer remembers doing it. '),
          bold('The unmaking entry is one of them.'),
          t(' Everything the party plans in Act 3 is built on a frightened woman’s lie, and she believes it too.'),
        ),
        p(t('A DC 20 Investigation on the ink and hand catches it. Nobody has ever thought to check, because it is the only hope anyone has.')),
      ),
      secrets:
        'The forged entries are catchable — DC 20 Investigation comparing ink and hand across the three, which are sixty years apart and written by the same person pretending to be three people.\n\nIf the party catches it, they take away the Remembrance\'s only hope and Alma\'s reason for the last sixty years of her life. She will not thank them. She will, after about a week, help them anyway, which is the most heroic thing anyone does in this campaign.\n\nIf they never check, they will walk into the finale with a plan that cannot work, and Vessarine will let them try, and it will be very kind about it afterwards.',
      relationships: [
        { targetId: ref('alma'), relType: 'kept by' },
        { targetId: ref('vessarine'), relType: 'records the bargain with' },
        { targetId: ref('wren'), relType: 'contains the true name of' },
      ],
    },
  },
  {
    key: 'jar',
    type: 'item',
    created: '2026-03-16',
    updated: '2026-06-28',
    input: {
      name: NAME.jar,
      playerVisible: true,
      tags: ['act-1', 'gutter-choir', 'contraband', 'consumable'],
      data: {
        itemType: 'wondrous',
        rarity: 'uncommon',
        attunement: 'no',
        ownership: 'unassigned',
        value: 150,
        weight: 2,
        effect:
          'A stoneware pickling jar with a wax seal. Illegal to own within the walls, and about a third of Corvath owns one.\n\n• DECANT (1 hour, willing creature): pour one memory in and seal it. The memory is gone from you completely — you do not know it is missing, you do not know you did this. The Bell cannot take what is not in your head.\n• RESTORE (1 hour, break the seal): take it back.\n• The catch — restoration is close but not exact, and error compounds. Each time a given memory is decanted and restored, roll a d20. On a 1, something in it is subtly, permanently wrong. It stays wrong. You will not notice.\n• Jars are not labelled. Labelling a jar defeats the point: a label is a memory of what is in the jar.\n\nThe Gutter Choir buries theirs outside the walls before Midwinter and digs them up in spring. Roughly half of them come back very slightly not who they were. They know. They keep singing.',
      },
      // Published to players — body is written for them. GM direction lives in `secrets`.
      body: doc(
        p(
          t('A stoneware pickling jar with a wax seal. You bought it at '),
          at('greywater'),
          t(' for 150gp and no questions were asked in either direction.'),
        ),
        p(
          t('Pour a memory in, seal it, and the Bell cannot take what is not in your head. Break the seal and take it back. That is the whole of it, and it is illegal inside the walls, and roughly a third of the city owns one.'),
        ),
        h(3, 'Two things the Choir will tell you if you ask'),
        ul(
          li(p(t('It comes back '), em('close'), t('. Not exact. And the error compounds every time.'))),
          li(p(t('You cannot label a jar. A label would be a memory of what is in the jar. So nobody knows what is in anybody’s.'))),
        ),
        p(t('You have not opened yours.')),
      ),
      secrets:
        'GM: give the party exactly one in Act 1 and let them carry it for two months without using it. The jar is the campaign asking a question and waiting, patiently, for an answer.\n\nThe unlabelled problem: the Choir\'s cellars are full of jars nobody can identify, going back decades, and some of them are the only surviving copy of somebody. Nobody will ever know which. Yzzy has about half of her brother in a jar and some of what she has put back is not his.\n\nThe d20 error is not random and it is not decay. It is Vessarine, taking its cut. A decanted memory is still Corvath\'s and it is still owed, and the jar is a delay, not an exemption — every restore passes through the Remembering on the way back and something small is retained each time. Interest.\n\nThe Choir has been paying interest for forty years and calling it freedom. Yzzy will work this out about two sessions after the party does, and it will break her.',
      relationships: [
        { targetId: ref('yzzy'), relType: 'supplied by' },
        { targetId: ref('greywater'), relType: 'sold at' },
        { targetId: ref('remembering'), relType: 'leaks into' },
      ],
    },
  },
  {
    key: 'draught',
    type: 'item',
    created: '2026-04-06',
    updated: '2026-05-18',
    input: {
      name: NAME.draught,
      playerVisible: false,
      tags: ['act-2', 'potion', 'consumable', 'remembrance'],
      data: {
        itemType: 'potion',
        rarity: 'rare',
        attunement: 'no',
        ownership: 'pc',
        value: 500,
        weight: 0.5,
        effect:
          'Cloudy grey, tastes of cold water and someone else’s house.\n\nDrink it and you remember one thing you paid for. Not a vision — a memory, indistinguishable from your own, arriving whole.\n\n• You regain one memory the Bell took from you. You do not choose which. The DM does, and the DM should choose the one that hurts.\n• DC 13 Wisdom save on drinking. On a failure, you also get one that is not yours, and you cannot tell which is which, and neither can the DM, because you will both forget which one you were told.\n• Non-natives of Corvath (i.e. the party) have never paid anything — so for a PC, the save automatically fails. There is nothing of theirs to give back. They get somebody else’s, whole, and they keep it.\n• Alma brews these. She has drunk forty. She would like you to understand that she is fine.',
      },
      body: doc(
        p(t('Brewed by '), at('alma'), t(' in the back of her stall at '), at('greywater'), t('. She will not sell one to a PC without a fight, because she knows exactly what it does to someone who has never paid.')),
        h(3, 'For a PC, this is not a healing potion'),
        p(t('It is a '), bold('character-writing prompt with a cork in it'), t('. A PC who drinks one gets a stranger’s memory, permanently, and the player gets to decide whose and what — and then plays a character who is carrying a piece of Corvath around for the rest of the campaign.')),
        p(t('The first time one gets drunk, stop the session ten minutes early and let the player write it. It will be better than anything you would have handed them.')),
        quote(p(em('“It’s not a drug and it’s not a cure. It’s a door with somebody behind it. I have opened forty and I am fine. Ask me again in the spring.”'))),
      ),
      secrets:
        'The memories in the draughts are decanted from the Undercroft — Alma has been going down there for sixty years, alone, past the Grief Engine, to steal receipts and brew them into a potion nobody wants.\n\nShe is the reason shelf 11 is a mess. She is the reason Tobias\'s receipt is misfiled. She did it in 3159, in a hurry, in the dark, and she has never known that the tidy man in the ossuary has been waiting ninety years for someone to correct her filing error.',
      relationships: [
        { targetId: ref('alma'), relType: 'brewed by' },
        { targetId: ref('undercroft'), relType: 'distilled from' },
      ],
    },
  },
  {
    key: 'shard',
    type: 'item',
    created: '2026-05-11',
    updated: '2026-07-13',
    input: {
      name: NAME.shard,
      playerVisible: false,
      tags: ['act-2', 'very-rare', 'the-bell', 'gm-only'],
      data: {
        itemType: 'other',
        rarity: 'very rare',
        attunement: 'no',
        ownership: 'unassigned',
        value: 0,
        weight: 3,
        effect:
          'A sliver of bronze off the Bell, still faintly ringing a note that is not quite a note.\n\n• While carried, you cannot be made to forget by any means — including the Bell, the Grief Engine, and Vessarine itself. You are exempt.\n• You also cannot forget anything else. Not one thing. Everything, in full detail, forever, starting now.\n• After 7 days carrying it: disadvantage on Wisdom saves. After 30: 1 level of exhaustion that cannot be removed while it is on you. After 90: you are Wren, which is to say you are a vessel, and something very large is going to notice you are available.\n• Putting it down is easy. Nobody puts it down. It is the only object in Corvath that lets you keep things.',
      },
      body: doc(
        p(t('There are five. They came off the Bell when it cracked and the specters in '), at('undercroft'), t(' have been circling them ever since — they are the only things down there that are not filed.')),
        h(3, 'The trap'),
        p(t('It is a perfect answer to the campaign’s central threat and it is slowly turning the bearer into '), at('wren'), t('. A party will find one in Act 2 and it will feel like a reward.')),
        p(t('Let them have it. Let it work. Let them notice, around session ten, that whoever is carrying it has stopped sleeping and can recite conversations from four months ago verbatim.')),
      ),
      secrets:
        'Five shards. Five vessels. Vessarine did not want the Bell to crack, but now that it has, it has five spare containers loose in the world and it is in absolutely no hurry.\n\nA PC who carries one past 90 days is a candidate. Vessarine will not take them by force — it does not do that. It will make them a very good offer, and by then they will have been unable to forget anything for three months, and they will be so tired.',
      relationships: [
        { targetId: ref('ambush'), relType: 'found in' },
        { targetId: ref('belfry'), relType: 'broken from' },
        { targetId: ref('wren'), relType: 'echoes' },
      ],
    },
  },
  {
    key: 'leathers',
    type: 'item',
    created: '2026-04-13',
    updated: '2026-05-30',
    input: {
      name: NAME.leathers,
      playerVisible: true,
      tags: ['act-1', 'armor', 'uncommon', 'bellwrights'],
      data: {
        itemType: 'armor',
        rarity: 'uncommon',
        attunement: 'no',
        ownership: 'pc',
        value: 400,
        weight: 13,
        effect:
          'Studded leather, +1. Bell-founder’s kit: scorched, patched, and smelling permanently of hot bronze.\n\n• +1 studded leather (AC 13 + Dex).\n• Resistance to fire damage from non-magical sources — casting bronze is hot work.\n• Advantage on saves against being Deafened, and you have advantage on Wisdom saves against effects originating from the Bell of Saint Aurel specifically. Ferran had them made after his third year. He does not remember why he thought he needed them.\n• The right cuff has a name stitched inside it in a child’s hand. It says WREN. Ferran has never noticed. She did it when she was six.',
      },
      // Published to players — body is written for them. GM direction lives in `secrets`.
      body: doc(
        p(
          t('Bell-founder’s kit: studded leather, scorched across the forearms, patched twice, and smelling permanently of hot bronze. Casting metal is hot work and this armour has done a lot of it.'),
        ),
        p(t('It fits better than it has any right to.')),
        h(3, 'The cuff'),
        p(
          t('Sewn inside the right cuff, in thread, in a child’s hand, there is a name.'),
        ),
        quote(p(bold('WREN'))),
        p(
          t('It has been there a long time. Whoever wore these before you never took them off, which is presumably the point.'),
        ),
      ),
      secrets:
        'GM: hand these over in Act 1 as ordinary loot — good, useful, unremarkable +1 studded leather. Do NOT mention the cuff. Wait for someone to roll a 20 on an Investigation for something else entirely, and then mention the cuff.\n\nThe stitching is how a player can prove Wren is his daughter without a single spell — a six-year-old put her name in her father\'s cuff so he would have it on him. She was already managing his memory at six. She has never mentioned it. If asked, she will say, matter-of-factly, that it seemed like a good place to put it, because he never takes them off.',
      relationships: [
        { targetId: ref('ferran'), relType: 'made for' },
        { targetId: ref('wren'), relType: 'stitched by' },
      ],
    },
  },
  {
    key: 'ribbon',
    type: 'item',
    created: '2026-03-23',
    updated: '2026-07-13',
    input: {
      name: NAME.ribbon,
      playerVisible: false,
      tags: ['act-3', 'common', 'heartbreak', 'no-mechanics'],
      soundtrack: track(MOOD.grief, 'Aftermath / grief'),
      data: {
        itemType: 'wondrous',
        rarity: 'common',
        attunement: 'no',
        ownership: 'npc',
        value: 0,
        weight: 0,
        effect:
          'A length of green ribbon, worn thin, mended twice.\n\nIt does nothing. It has no properties. It is not magical and it will not detect as magical and there is no save.\n\nHer father gave it to her for her sixth birthday. He does not remember her sixth birthday. He does not remember her. She has worn it every day for four years so that if he ever asks, she will have something to show him.\n\nIf a PC attunes to the Tollhammer and dreams the twenty-two, one of the dreams is a man in a workshop, badly wrapping a green ribbon in brown paper, and getting it wrong, and laughing.',
      },
      body: doc(
        p(at('wren'), t(' wears it. Every day. It has no mechanical effect and it is the most important object in the campaign.')),
        h(3, 'How to use it'),
        p(t('Put it in the room. Never point at it. Let it be in three or four descriptions of her across two months, and then — the first time '), at('ferran'), t(' and '), at('wren'), t(' are in a scene together after the party knows the truth — describe him noticing it, and not knowing why, and looking away.')),
        p(t('That is the whole item. That is the whole campaign, really.')),
        quote(p(em('“He gave it to me. He wrapped it himself and he did it wrong and it took him ages. I keep it on in case he asks.”'))),
      ),
      secrets:
        'The memory of buying it is in the Tollhammer. Year eleven of twenty-two. Any attuned PC can dream it on any long rest, and the DM should hold it back until the exact moment the party has decided Ferran is a coward or a fool — and then hand them a man in a workshop, badly wrapping a green ribbon, laughing at how bad he is at it.',
      relationships: [
        { targetId: ref('wren'), relType: 'worn by' },
        { targetId: ref('ferran'), relType: 'given by' },
        { targetId: ref('tollhammer'), relType: 'remembered in' },
      ],
    },
  },
  {
    key: 'marks',
    type: 'item',
    created: '2026-03-16',
    updated: '2026-05-04',
    input: {
      name: NAME.marks,
      playerVisible: true,
      tags: ['act-1', 'currency', 'flavour', 'common'],
      data: {
        itemType: 'currency',
        rarity: 'common',
        attunement: 'no',
        ownership: 'unassigned',
        value: 1,
        weight: 0,
        effect:
          'Corvath’s local coin. A winter mark is a flat bronze disc, struck from bell-metal, worth 1gp within nine miles of the belfry and nothing at all outside them.\n\n• Every mark carries a date. Not the date it was struck — the date it was paid. Marks are minted from the tithe.\n• There are marks in circulation dated three hundred years ago that are bright as the day they were struck. Bell-metal does not tarnish here.\n• The villages of Hollowmere will not take them. Not "cannot" — will not. Offer one in Thrush End and see what happens.\n• A PC who holds a fistful and thinks about it can work out the entire economy of the city in about a minute, and that is a legitimate way to solve Act 1.',
      },
      // Published to players — body is written for them. GM direction lives in `secrets`.
      body: doc(
        p(
          t('Local coin. A flat bronze disc struck from bell-metal, worth a gold piece anywhere inside '),
          at('corvath'),
          t(' and precisely nothing outside it. You are carrying about forty.'),
        ),
        h(3, 'Two things you have noticed'),
        ul(
          li(p(t('Every mark carries a date, and the dates go back three hundred years, and the oldest ones are as bright as the newest. Bell-metal does not tarnish here.'))),
          li(p(t('They will not take them in the villages. Not '), em('cannot'), t(' — '), bold('will not'), t('. Offer one in Thrush End and watch what happens to the room.'))),
        ),
      ),
      secrets:
        'GM: hand a player 40gp in local coin in session one and mention, in passing, that they are dated. Some tables catch the whole economy in a minute. Some tables spend eleven of them on lunch first.\n\n' +
        'Yzzy sold her brother\'s last hour for eleven marks. She still has one of them. It is dated 3206 and it is in her left boot and she has never spent it and she cannot tell you why, because the memory of why is in a jar in a cellar and half of it has already gone wrong.',
      relationships: [
        { targetId: ref('greywater'), relType: 'spent at' },
        { targetId: ref('corvath'), relType: 'minted in' },
        { targetId: ref('yzzy'), relType: 'haunts' },
      ],
    },
  },

  /* ══════════════════════════ Notes ══════════════════════════ */
  {
    key: 'sessionzero',
    type: 'note',
    created: '2026-03-02',
    updated: '2026-07-01',
    input: {
      name: NAME.sessionzero,
      playerVisible: true,
      tags: ['meta', 'session-zero', 'safety', 'handout'],
      body: doc(
        p(t('Read this before session one. This campaign is about memory, loss, and consent, and it will not work if the table has not agreed to it.')),
        h(3, 'What this campaign asks of you'),
        ul(
          li(p(t('Your character will lose memories. Permanently. Struck off the sheet, no restoration, no take-backs.'))),
          li(p(bold('You choose which.'), t(' Never the DM, never a die. If a mechanic takes a memory, the player picks it.'))),
          li(p(t('So write a backstory with things in it you would hate to lose. That is the fuel. That is the game.'))),
        ),
        h(3, 'Safety tools in use'),
        ul(
          li(p(bold('Lines'), t(' — child harm on screen, dementia depicted clinically. Not in this game.'))),
          li(p(bold('Veils'), t(' — the Vail evacuation, anything involving Wren’s ending. We fade and discuss.'))),
          li(p(bold('X-card'), t(' — on the table, always, no explanation ever required, including from the DM.'))),
          li(p(bold('Open door'), t(' — leave any time, no reason, we will catch you up.'))),
        ),
        h(3, 'The one hard rule'),
        p(
          t('If a scene is going to cost you something you wrote down and love, you will get a beat to decide. You will always be asked. Nothing in this campaign is taken from a player without a question first — which is, if you think about it for a moment, more than the city gets.'),
        ),
        h(3, 'Tone dial'),
        p(t('Gothic, not grim. Warm, not cosy. The horror is that everyone is fine. If a session ends and nobody laughed, I have run it wrong — tell me.')),
      ),
      secrets: '',
    },
  },
  {
    key: 'factions',
    type: 'note',
    created: '2026-03-09',
    updated: '2026-06-20',
    input: {
      name: NAME.factions,
      playerVisible: false,
      tags: ['lore', 'factions', 'reference'],
      body: doc(
        p(t('Four factions, and not one of them is wrong. That is the campaign.')),
        h(3, 'The Magistracy'),
        p(
          t('Runs the city. Led by '),
          at('odo'),
          t(', enforced by '),
          at('hollis'),
          t('. Wants: the Tolling to continue, because four thousand people are fed and warm and the alternative is three centuries of winter arriving at once.'),
        ),
        p(em('They are right.')),
        h(3, 'The Remembrance'),
        p(
          t('A church of one, more or less: '),
          at('alma'),
          t(' and about a dozen who help. Keeps '),
          at('ledger'),
          t('. Wants: the bargain unmade, the debt refused, the truth told out loud.'),
        ),
        p(em('They are right, and their evidence is forged, and they do not know it.')),
        h(3, 'The Gutter Choir'),
        p(
          t('Forty-odd smugglers and singers around '),
          at('yzzy'),
          t('. Runs '),
          at('jar'),
          t('. Wants: to keep what is theirs, personally, and to hell with the city-wide question.'),
        ),
        p(em('They are right, and they have been paying interest for forty years and calling it freedom.')),
        h(3, 'The Bellwrights'),
        p(
          t('A guild of one and a half: '),
          at('ferran'),
          t(' and '),
          at('wren'),
          t(', who is not officially anything. Wants: the Bell repaired, the debt paid, properly, by someone competent.'),
        ),
        p(em('He is right. He is also the reason it broke, and he will never know, unless a player tells him.')),
        h(3, 'The fifth faction'),
        p(t('Nine miles of freezing, starving, perfectly clear-headed villages: '), at('hollowmere'), t('. They have no leader, no plan, and three hundred years of grudges. Nobody in Corvath can remember they exist. They remember Corvath just fine.')),
      ),
      secrets:
        'Every faction gets one thing right and is fatally wrong about one thing, and the party will have to pick a side without being able to fix the flaw. Do not let anyone be the obvious answer. If the table settles comfortably on a faction by session four, have that faction do something indefensible and correct.',
    },
  },
  {
    key: 'timeline',
    type: 'note',
    created: '2026-03-30',
    updated: '2026-07-10',
    input: {
      name: NAME.timeline,
      playerVisible: false,
      tags: ['lore', 'timeline', 'gm-only', 'structure'],
      body: doc(
        h(3, 'What is happening while the party investigates'),
        p(t('The crack does not wait. Run this clock whether or not they engage — Corvath is remembering, and it is accelerating.')),
        ol(
          li(p(bold('Toll 1 (done, before session one)'), t(' — the clapper struck, the Bell split, the toll went out half-finished. Nobody noticed. Everyone was mid-forget.'))),
          li(p(bold('Toll 2 — week 1.'), t(' A baker in Greywater serves a man his usual and calls him by his brother’s name. His brother died in 3198. He has no brother. He has always had a brother.'))),
          li(p(bold('Toll 3 — week 2.'), t(' Three people wake with the same memory of the same afternoon. None of them were there. One of them was.'))),
          li(p(bold('Toll 4 — week 3.'), t(' The old graveyard gets its first visitor in thirty years. She sits down at a stone and reads a name she has never heard and starts crying and cannot stop and cannot say why.'))),
          li(p(bold('Toll 5 — week 5.'), t(' '), at('hollis'), t(' finds her own handwriting in the watch log for a Midwinter she has no memory of. She recognises the hand. She recognises nothing else.'))),
          li(p(bold('Toll 6 — week 7.'), t(' The Greywater noticeboard starts working. Somebody recognises a face. Then eleven more. There is a riot, and it is a riot of people '), em('finding each other'), t(', and it is the most joyful and terrible thing anyone has seen.'))),
          li(p(bold('Toll 7 — week 9.'), t(' The dead start coming up out of '), at('undercroft'), t('. They are not hostile. They want to be looked up. See '), at('tobias'), t('.'))),
          li(p(bold('Toll 8 — week 11.'), t(' '), at('ferran'), t(' asks '), at('wren'), t(' who she is, and she tells him, and for eleven seconds he knows. Then it goes. He does not know that it went.'))),
          li(p(bold('Toll 9 — Midwinter.'), t(' '), at('lasttoll'), t('.'))),
        ),
        h(3, 'The clock’s job'),
        p(
          t('Every beat above is a gift, not a threat. The city getting its memory back is '),
          bold('good'),
          t(' — and it is happening because the party is running out of time, and the party will feel that contradiction in their chest by about week seven. That is the design.'),
        ),
      ),
      secrets:
        'The acceleration is Wren filling up. Each "toll" on this clock is the debt seating itself a little deeper into her — the city remembers a little more because she is holding a little more. By week 11 she can toll. By Midwinter she is a bell.\n\nThe party will read this timeline as the city healing. It is the city healing. Both things are true, and the price of the healing is asleep in the loft, and she thinks it is going fine.',
      relationships: [
        { targetId: ref('wren'), relType: 'measures' },
        { targetId: ref('lasttoll'), relType: 'counts down to' },
      ],
    },
  },
  {
    key: 'rumours',
    type: 'note',
    created: '2026-03-16',
    updated: '2026-06-28',
    input: {
      name: NAME.rumours,
      playerVisible: false,
      tags: ['act-1', 'table', 'greywater', 'improv'],
      body: doc(
        p(t('Roll or pick when the party works '), at('greywater'), t('. Everything here is true. That is not a twist — this city has no reason to lie, because it cannot remember why it would.')),
        ol(
          li(p(t('“You want the Bellwright, he’s up the hill. Good man. Bit slow. Don’t let him give you anything.”'))),
          li(p(t('“Don’t buy jars. I’m not saying anything. I’m saying don’t buy jars.” '), em('(He has four.)'))),
          li(p(t('“The Magistrate knew my name. First day I came here, twenty years ago, before I said it.” '), em('(Said fondly. It is the single biggest clue in Act 1.)'))),
          li(p(t('“There’s a village on the north shore with the fires still lit. Four hours’ walk. Nobody’s been.” '), em('(Vail. Nobody from Corvath can remember it is there. She is from Thrush End.)'))),
          li(p(t('“My mother walked out on the ice when she turned sixty. Everyone’s does. It’s not sad, love, it’s just what you do.”'))),
          li(p(t('“There’s a girl lives above the Bell. Nobody’s child. She’s very polite.” '), em('(Wren. Nobody in the city can hold onto whose she is.)'))),
          li(p(t('“Read the noticeboard if you want. Everyone does it once.”'))),
          li(p(t('“Sister Alma will write down anything you tell her. Anything. Try her.” '), em('(This is an invitation and it is the correct move.)'))),
        ),
        h(3, 'Using this table'),
        p(t('Do not gate any of it behind a check. Every one of these is offered warmly, unprompted, by people who are glad to see you. The horror is not that Corvath is hiding something. It is that Corvath will tell you everything and cannot understand why you have gone pale.')),
      ),
      secrets:
        'Rumours 3, 4 and 6 are the whole plot and they are all available in the first twenty minutes of session one for free. Give them all out early. The campaign is not a mystery about what is happening — the city will tell you what is happening. It is a tragedy about what you are going to do about it.',
    },
  },
  {
    key: 'letter',
    type: 'note',
    created: '2026-03-02',
    updated: '2026-06-14',
    input: {
      name: NAME.letter,
      playerVisible: true,
      tags: ['handout', 'act-1', 'hook', 'read-aloud'],
      // Published. Body is the letter and nothing but the letter — the GM note
      // about how to hand it out lives in `secrets`.
      body: doc(
        p(t('To whichever of you reads this first —')),
        p(
          t('I am told you are the sort of people who take work that does not make sense. I hope that is true, because I have some, and it does not.'),
        ),
        p(
          t('The Bell of Saint Aurel cracked on Midwinter night. I have kept it for thirty-one years and I know every inch of it and I am telling you: bronze does not do this. Not from cold, not from age, not from any hand I can find. Something has been pulling at it for a long time and I cannot find what and I have looked, and I am the seventh Bellwright and I am supposed to be able to '),
          em('find what'),
          t('.'),
        ),
        p(
          t('If you come, you should know two things before you agree to anything.'),
        ),
        p(
          t('The first is that this city pays for what it has. I will not put down here what it pays or you will not come. Ask Sister Thorne at Greywater and she will tell you plainly and she will write down that she told you, which you will understand later.'),
        ),
        p(
          t('The second is that I have paid more than most and I am not sorry and I would do it again, and if anyone in this city tells you I am a victim of anything you may tell them from me to go and look at the mere.'),
        ),
        p(t('Come before the thaw. There is a girl here who')),
        p(em('[the next four words are struck out, heavily, several times, and cannot be read]')),
        p(t('Come before the thaw. I can pay.')),
        p(t('— F. Volk, Bellwright of Saint Aurel')),
        rule(),
        p(
          em('Beneath the signature, in a different, smaller, much newer hand, in pencil:'),
        ),
        quote(p(em('“He wrote this four times. This is the one he sent. I put the stamp on. — W.”'))),
      ),
      secrets:
        'GM: hand this out physically if you can — the crossings-out are the whole point and they do not survive being read aloud.\n\nThe struck-out words are "who needs me to". He got that far, four times, and could not finish it, and could not tell you why he was crying.\n\nThe pencil note is Wren. She has been posting his letters for four years. She posted this one. She is the reason the party is here — the actual, mechanical reason the campaign happens is that a ten-year-old put a stamp on an envelope.\n\nIf a PC ever asks her about it, she will say she thought it seemed important, and that he does not remember writing it, and that this is fine, because she does.',
      relationships: [
        { targetId: ref('ferran'), relType: 'written by' },
        { targetId: ref('wren'), relType: 'posted by' },
      ],
    },
  },
  {
    key: 'castlist',
    type: 'note',
    created: '2026-04-13',
    updated: '2026-07-12',
    input: {
      name: NAME.castlist,
      playerVisible: true,
      tags: ['handout', 'players', 'cast', 'recap'],
      // Published. Written from the players' point of view — only what they have
      // actually established at the table. @mentions render as plain labels here.
      body: doc(
        p(em('Who you have met so far, as best anyone has written it down. Correct me if I have got it wrong — you were there and I was only running it.')),
        h(3, 'The Bellwright'),
        p(
          at('ferran'),
          t(' — keeps the Bell, and has for thirty-one years. Kind, slow, and generous with the run of his belfry. He wrote you the letter that brought you here. He has introduced himself to you twice.'),
        ),
        h(3, 'The girl in the loft'),
        p(
          at('wren'),
          t(' — ten, lives above the Bell, extremely polite. Answers every question completely and literally. Marcus has decided she is the smartest person in the city and Marcus is right.'),
        ),
        p(em('You worked out in session four whose daughter she is. He has not.')),
        h(3, 'The Sister'),
        p(
          at('alma'),
          t(' — keeps a stall at '),
          at('greywater'),
          t(' that sells nothing and takes statements instead. She has a book. She would not take your money and she would not let you read it.'),
        ),
        h(3, 'The Choir'),
        p(
          at('yzzy'),
          t(' — halfling, fence, talks faster than Priya can take notes. Sold you '),
          at('jar'),
          t('. Still unopened.'),
        ),
        h(3, 'People you have not met yet'),
        ul(
          li(p(t('The Magistrate. He has written to you. By name. Including Vespera’s, which she has given to nobody.'))),
          li(p(t('Captain Drear of the Watch, who has walked past you four times and written something down each time.'))),
        ),
      ),
      secrets:
        'This handout is deliberately incomplete and slightly wrong in one place — it says Wren is "extremely polite", which is what the party believes, rather than "managing everyone in this city and has been since she was six", which is what she is doing.\n\nUpdate it after every session. When the party learns something big, the handout changing is how they feel it land.',
      relationships: [
        { targetId: ref('ferran'), relType: 'features' },
        { targetId: ref('wren'), relType: 'features' },
        { targetId: ref('alma'), relType: 'features' },
        { targetId: ref('yzzy'), relType: 'features' },
      ],
    },
  },
  {
    key: 'briefing',
    type: 'note',
    created: '2026-03-02',
    updated: '2026-07-13',
    input: {
      name: NAME.briefing,
      playerVisible: true,
      tags: ['handout', 'players', 'recap', 'act-1'],
      // Published. The players' own recap — no GM voice, no spoilers.
      body: doc(
        p(em('Where we are. Read this if you missed a week.')),
        h(3, 'The job'),
        p(
          t('A letter reached you before the thaw, signed by the seventh Bellwright of '),
          at('corvath'),
          t(', a city on the far shore of a frozen lake. Its Bell cracked on Midwinter night. He has kept that Bell for thirty-one years and he says bronze does not do this, and he cannot find what did it, and he is supposed to be able to.'),
        ),
        h(3, 'What you found when you got here'),
        ul(
          li(p(t('Corvath is warm, rich, and lovely, and every street in it is angled so you can see the Bell.'))),
          li(p(t('Nobody here is over sixty. Nobody here holds a grudge. Nobody here can tell you what happened before last spring, and none of them find that strange.'))),
          li(p(t('The market noticeboard is four hundred sketches of faces, all headed DO YOU KNOW ME. Twenty-two of them are signed F.V., in the same hand.'))),
          li(p(t('The city pays for what it has. Sister Thorne will tell you exactly what, and she will write down that she told you.'))),
        ),
        h(3, 'What you have decided'),
        ol(
          li(p(t('The girl in the loft is the Bellwright’s daughter. He does not know.'))),
          li(p(t('You are not fixing that Bell until you know what fixing it costs.'))),
          li(p(t('Nim is not opening the jar. Nim has been very clear about the jar.'))),
        ),
        h(3, 'Right now'),
        p(
          t('You are forty feet under the belfry, in a room full of three hundred years of receipts, and something at the end of rank eleven has been standing perfectly still for three rounds asking you the same question.'),
        ),
      ),
      secrets:
        'Keep this handout current — it is the single best onboarding tool for the player who missed a session, and rewriting "what you have decided" in the players\' own words at the top of each session is worth ten minutes of recap.\n\nThe last line is doing work. They have not answered Tobias\'s question because nobody has realised it is answerable.',
      relationships: [
        { targetId: ref('corvath'), relType: 'concerns' },
        { targetId: ref('letter'), relType: 'follows from' },
      ],
    },
  },
  {
    key: 'twist',
    type: 'note',
    created: '2026-04-06',
    updated: '2026-07-13',
    input: {
      name: NAME.twist,
      playerVisible: false,
      tags: ['gm-only', 'spoilers', 'structure', 'endgame'],
      body: doc(
        p(bold('Do not publish this element. Everything below is the load-bearing structure of the campaign.')),
        h(3, 'The five truths, in the order they should land'),
        ol(
          li(
            p(
              bold('The city agreed. '),
              t('Corvath is not cursed and not a victim. Three hundred years ago it made an informed decision and it has been keeping its word ever since. '),
              at('vessarine'),
              t(' has never lied to anybody. Not once.'),
            ),
          ),
          li(
            p(
              bold('Odo is a doppelganger. '),
              t('And it does not matter as much as the party will want it to. Unmasking him changes nothing — the city cannot remember a scandal. He is a symptom wearing a nice coat.'),
            ),
          ),
          li(
            p(
              bold('Ferran broke the Bell. '),
              t('By being decent. Twenty-two years of covering short tithes out of his own memory fatigued the bronze. The man holding the bargain together is the man who cracked it, and '),
              bold('a player must be the one to work this out'),
              t(' — never an NPC.'),
            ),
          ),
          li(
            p(
              bold('The unmaking entry is a forgery. '),
              at('alma'),
              t(' wrote it herself sixty years ago when she nearly gave up, and has forgotten forging it, and believes it. The Remembrance’s entire plan is a frightened woman’s lie. DC 20 Investigation on '),
              at('ledger'),
              t(' catches it. Nobody has ever checked.'),
            ),
          ),
          li(
            p(
              bold('Wren is the new Bell. '),
              t('The debt rerouted into the nearest vessel with capacity. She is filling up. By Midwinter she can toll — and she will offer, cheerfully, because it is a job and she can do a job.'),
            ),
          ),
        ),
        h(3, 'The shape of the ending'),
        p(t('Three exits. All valid. None clean. See '), at('lasttoll'), t('.')),
        ul(
          li(p(bold('Repair'), t(' — the city forgets forever, Wren goes free, and the party did that on purpose.'))),
          li(p(bold('Unmake'), t(' — three centuries of winter in one night on four thousand people, and '), at('remembering'), t(' dies, and everyone filed in it dies, and Vessarine will mention this at exactly the wrong moment and be telling the truth.'))),
          li(p(bold('Let her toll'), t(' — she volunteers. She is ten. It works.'))),
        ),
        h(3, 'The rule for the DM'),
        p(
          bold('There is no fourth option. '),
          t('Every table will look for one. Do not build it, do not hint at it, and do not let a clever plan sneak one in at 11pm on the last night. The campaign is a trolley problem with a name and a green ribbon, and the entire point is that they have to pull something.'),
        ),
        h(3, 'The one mercy'),
        p(
          t('Whatever they choose, '),
          at('wren'),
          t(' is fine with it. Not brave — '),
          em('fine'),
          t('. She has been managing this since she was six and she is not frightened and she does not need saving and she will thank them, politely, for coming all this way. Play that absolutely straight and let the table do the rest.'),
        ),
        quote(p(em('“That’s all right. You can tell me again.”'))),
      ),
      secrets:
        'If you take one thing from this document: the party cannot win, and they must not be told that, and they must be allowed to try everything.\n\nThe emotional target is not despair. It is the specific, adult feeling of having made a real choice with real information and knowing it cost somebody. Corvath never got that. The party do. That is the gift the campaign is actually about — not memory, and not the Bell.\n\nThe last line of the campaign is Ferran asking who she was.',
      relationships: [
        { targetId: ref('wren'), relType: 'concerns' },
        { targetId: ref('lasttoll'), relType: 'resolves at' },
        { targetId: ref('vessarine'), relType: 'concerns' },
      ],
    },
  },
];

/* ── Campaign document ────────────────────────────────────────────────────── */
const PREMISE = doc(
  h(2, 'The Bargain'),
  p(
    t('Three hundred years ago the people who would become Corvath were starving to death on the shore of a frozen lake. They walked out onto the ice and asked the thing underneath it for help, and it '),
    em('helped'),
    t('. It took their winter — the killing cold, the failed harvest, the plague years — and in exchange, every Midwinter, the town rings its Bell and gives up one year of its memory.'),
  ),
  p(
    t('The bargain held. Corvath has never starved. Corvath has never frozen. It is prosperous, and warm, and kind, and three hundred years old, and nobody who lives there can tell you what happened before last spring.'),
  ),
  h(2, 'The Crack'),
  p(
    t('This Midwinter the clapper came down and the Bell '),
    bold('split'),
    t(', and the toll went out half-finished, and the debt went unpaid. Nobody noticed. Everyone was mid-forget.'),
  ),
  p(t('Then the city started to remember.')),
  ul(
    li(p(t('A baker calls a customer by the name of a brother who died in 3198. He has no brother. He has always had a brother.'))),
    li(p(t('Three people wake with the same memory of the same afternoon. One of them was there.'))),
    li(p(t('The old graveyard — thirty years without a visitor — gets one. She reads a name she has never heard and cannot stop crying.'))),
    li(p(t('The dead come up out of the Undercroft. They are not hostile. They want to be looked up.'))),
  ),
  h(2, 'The Job'),
  p(
    t('A letter goes out to the sort of people who take work that does not make sense, signed by the seventh Bellwright, four words struck out near the end. It is posted by a ten-year-old girl who has never forgotten anything in her life.'),
  ),
  p(
    t('The city wants the Bell fixed. The Bell can be fixed. Everyone will be fine, and warm, and fed, and they will never know what it cost, because not knowing '),
    em('is'),
    t(' what it costs.'),
  ),
  quote(
    p(em('“It is not that we forget. It is that we pay.”')),
    p(em('— Ferran Volk, Bellwright of Saint Aurel')),
  ),
);

const STORY_SO_FAR = [
  'Four sessions in. The party came over the moor from Thrush End, where nobody would walk them the last three miles, and reached Corvath on the second night of the thaw.',
  '',
  'They have read the noticeboard at Greywater — all of it, which took an hour of real table time and was worth every minute. Marcus counted the notices signed F.V. and got to twenty-two before he stopped and asked, very quietly, whether they were all the same handwriting. They were.',
  '',
  'They have met Ferran (who was kind, and slow, and gave them the run of the belfry), Alma (who took their statements and would not take their money), and Yzzy (who sold them a jar they have not opened). They have not met the Magistrate. He has, however, written to them — by name, correctly, including Vespera\'s, which she has given to precisely nobody.',
  '',
  'They have worked out that Wren is Ferran\'s daughter. They worked it out from the stitching in the cuff of a set of +1 studded leather they looted in session two and had been wearing for three weeks. Priya found it on a nat 20 while searching for something else entirely. The table was silent for about ten seconds.',
  '',
  'They have NOT worked out: that Odo is a doppelganger (the "he knew my name" rumour has been mentioned twice and waved off both times); that the unmaking entry in the Ledger is a forgery; or what the Bell cracking has actually done to Wren.',
  '',
  'Session five is running now — they went down into the Undercroft against Alma\'s advice, pulled a receipt off shelf 11, and the Filing came to collect. Brannock is down. There is a wight at the end of the rank that has not attacked anybody, and Nim has just noticed.',
].join('\n');

const CAMPAIGN_INPUT = {
  name: CAMPAIGN_NAME,
  hook: 'Every winter the Bell tolls and Corvath forgets a year. This winter the Bell cracked — and the city is starting to remember.',
  premise: PREMISE,
  tone: ['gothic', 'folk horror', 'mystery', 'bittersweet', 'winter', 'small-town intrigue', 'slow dread', 'no clean answers'],
  startLevel: 1,
  endLevel: 10,
  settingName: 'Hollowmere',
  storySoFar: STORY_SO_FAR,
  moodSlots: Object.values(MOOD).map((m) => ({ label: m.label, spotifyUri: m.uri })),
};

/* ── Demo players (for Members / Activity) ────────────────────────────────── */
const PLAYERS = [
  { handle: 'Tess', role: 'editor' as const, pc: 'Nim Ashgrove' },
  { handle: 'Marcus', role: 'viewer' as const, pc: 'Brannock Teague' },
  { handle: 'Priya', role: 'viewer' as const, pc: 'Vespera Quill' },
  { handle: 'Devon', role: 'viewer' as const, pc: 'Hask' },
];

/* ── Live session: mid-combat, round 3 of The Undercroft Ambush ───────────── */
/* Monster HP/AC are the real SRD values verified against the seeded reference. */
const cid8 = () => crypto.randomBytes(8).toString('hex');
const COMBATANTS = [
  { name: 'Nim Ashgrove', init: 22, max: 30, cur: 24, player: true, notes: 'Has just noticed the wight has not attacked anybody.' },
  { name: 'Tobias Vane (Wight)', init: 19, max: 45, cur: 45, player: false, src: 'tobias', notes: 'NOT hostile. Waiting to be named. DC 20 Investigation, shelf 11, misfiled under 3159.' },
  { name: 'Vespera Quill', init: 17, max: 22, cur: 8, player: true, conds: ['Frightened'], notes: 'Frightened of the wight. Has one 2nd-level slot left.' },
  { name: 'Ghast 1', init: 15, max: 36, cur: 12, player: false, notes: 'Stench aura — DC 10 Con or poisoned.' },
  { name: 'Brannock Teague', init: 14, max: 44, cur: 0, player: true, conds: ['Unconscious', 'Prone'], deaths: { successes: 1, failures: 1 }, notes: 'DOWN. Failing. Marcus is not happy.' },
  { name: 'Specter 1', init: 12, max: 22, cur: 22, player: false, notes: 'Moving through the shelving. No back rank down here.' },
  { name: 'Specter 2', init: 12, max: 22, cur: 8, player: false, notes: 'Bloodied — Hask caught it with a reckless swing in round 2.' },
  { name: 'Hask', init: 11, max: 51, cur: 33, player: true, temp: 5, notes: 'Raging. Standing over Brannock.' },
  { name: 'Ghast 2', init: 9, max: 36, cur: 36, player: false },
  { name: 'Specter 3', init: 6, max: 22, cur: 0, player: false, notes: 'Destroyed — Vespera, round 2.' },
];

const LOG: { kind: 'roll' | 'note' | 'event'; text: string; by: string; min: number }[] = [
  { kind: 'event', text: 'Session started from encounter: The Undercroft Ambush', by: 'ManliestBen', min: 0 },
  { kind: 'note', text: 'Nim pulled a receipt off shelf 11. Rolling initiative.', by: 'ManliestBen', min: 1 },
  { kind: 'roll', text: 'Initiative: Nim 22, Tobias 19, Vespera 17, Ghast 1 15, Brannock 14', by: 'Tess', min: 2 },
  { kind: 'event', text: 'Round 1 — the shelves start moving. Nobody is attacking the wight and the wight is not attacking anybody.', by: 'ManliestBen', min: 3 },
  { kind: 'roll', text: 'Vespera casts Magic Missile at Specter 3 — 3d4+3 = 11 damage', by: 'Priya', min: 9 },
  { kind: 'roll', text: 'Ghast 1 claws Brannock: 18 to hit, 12 damage. Con save DC 10 vs paralysis…', by: 'ManliestBen', min: 14 },
  { kind: 'roll', text: 'Brannock Con save: 4. Paralyzed.', by: 'Marcus', min: 15 },
  { kind: 'note', text: 'Tobias, round 2, has still not moved. He asked the question again. Nobody answered.', by: 'ManliestBen', min: 21 },
  { kind: 'roll', text: 'Vespera destroys Specter 3 — Firebolt, 14 damage', by: 'Priya', min: 24 },
  { kind: 'event', text: 'Round 3 — Brannock drops to 0. Hask is standing over him.', by: 'ManliestBen', min: 31 },
  { kind: 'roll', text: 'Brannock death save: 17 — success (1/1)', by: 'Marcus', min: 33 },
  { kind: 'roll', text: 'Brannock death save: 6 — failure (1 success / 1 failure)', by: 'Marcus', min: 34 },
  { kind: 'roll', text: 'Vespera Wis save vs the wight’s presence: 8 — Frightened', by: 'Priya', min: 36 },
  { kind: 'note', text: 'Nim: “he hasn’t hit anyone. Three rounds. He hasn’t hit ANYONE.” — asking to Investigate shelf 11.', by: 'Tess', min: 38 },
  { kind: 'note', text: 'DC 20. Let her roll it. If she gets it, the whole fight ends in one sentence.', by: 'ManliestBen', min: 39 },
];

/* ── Activity feed ────────────────────────────────────────────────────────── */
const ACTIVITY: { key: string; action: 'created' | 'updated' | 'deleted' | 'restored'; who: 'owner' | 'Tess'; daysAgo: number }[] = [
  { key: 'ambush', action: 'updated', who: 'owner', daysAgo: 0 },
  { key: 'tobias', action: 'updated', who: 'owner', daysAgo: 0 },
  { key: 'wren', action: 'updated', who: 'owner', daysAgo: 0 },
  { key: 'twist', action: 'updated', who: 'owner', daysAgo: 1 },
  { key: 'shard', action: 'updated', who: 'owner', daysAgo: 1 },
  { key: 'ribbon', action: 'updated', who: 'owner', daysAgo: 1 },
  { key: 'ferran', action: 'updated', who: 'Tess', daysAgo: 2 },
  { key: 'tuning', action: 'updated', who: 'owner', daysAgo: 2 },
  { key: 'tollhammer', action: 'updated', who: 'owner', daysAgo: 2 },
  { key: 'odo', action: 'updated', who: 'owner', daysAgo: 3 },
  { key: 'timeline', action: 'updated', who: 'owner', daysAgo: 4 },
  { key: 'corvath', action: 'updated', who: 'Tess', daysAgo: 4 },
  { key: 'alma', action: 'updated', who: 'owner', daysAgo: 5 },
  { key: 'lasttoll', action: 'created', who: 'owner', daysAgo: 6 },
  { key: 'griefengine', action: 'created', who: 'owner', daysAgo: 12 },
  { key: 'remembering', action: 'created', who: 'owner', daysAgo: 19 },
];

/* ── Seed ─────────────────────────────────────────────────────────────────── */
async function purge(campaignIds: Types.ObjectId[]): Promise<void> {
  if (campaignIds.length) {
    const f = { campaignId: { $in: campaignIds } };
    await Promise.all([
      Element.deleteMany(f),
      Membership.deleteMany(f),
      Activity.deleteMany(f),
      GameSession.deleteMany(f),
      Invite.deleteMany(f),
      ShareLink.deleteMany(f),
    ]);
    await Campaign.deleteMany({ _id: { $in: campaignIds } });
  }
  await User.deleteMany({ webauthnUserID: { $regex: `^${DEMO_USER_PREFIX}` } });
}

async function main(): Promise<void> {
  const clean = process.argv.includes('--clean');
  await connectToDatabase();

  const existing = await Campaign.find({ name: CAMPAIGN_NAME }).select('_id');
  const existingIds = existing.map((c) => c._id as Types.ObjectId);

  if (clean) {
    await purge(existingIds);
    console.log(`Removed ${existingIds.length} demo campaign(s) and demo users.`);
    await mongoose.disconnect();
    return;
  }

  // Owner: SEED_OWNER by displayName, else the only/first real account.
  const wanted = process.env.SEED_OWNER;
  const owner = wanted
    ? await User.findOne({ displayName: wanted })
    : await User.findOne({ webauthnUserID: { $not: new RegExp(`^${DEMO_USER_PREFIX}`) } }).sort({
        createdAt: 1,
      });
  if (!owner) {
    throw new Error(
      wanted
        ? `No user with displayName "${wanted}". Register an account first, or unset SEED_OWNER.`
        : 'No user account found. Register a passkey in the app first, then re-run.',
    );
  }

  if (existingIds.length) {
    await purge(existingIds);
    console.log(`Replaced ${existingIds.length} existing "${CAMPAIGN_NAME}" campaign(s).`);
  }

  const campaignId = new Types.ObjectId();
  await Campaign.create({
    _id: campaignId,
    ...CAMPAIGN_INPUT,
    ownerId: owner._id,
    updatedBy: owner._id,
  });
  await Campaign.updateOne(
    { _id: campaignId },
    { $set: { createdAt: D('2026-03-02'), updatedAt: D('2026-07-13') } },
    { timestamps: false },
  );

  // Members
  await Membership.create({ campaignId, userId: owner._id, role: 'owner' });
  const playerIds: Record<string, Types.ObjectId> = {};
  for (const pl of PLAYERS) {
    const u = await User.create({
      displayName: pl.handle,
      webauthnUserID: `${DEMO_USER_PREFIX}${pl.handle.toLowerCase()}`,
      theme: 'arcane-navy',
    });
    playerIds[pl.handle] = u._id as Types.ObjectId;
    await Membership.create({ campaignId, userId: u._id, role: pl.role });
  }

  // Elements — validated through the real zod schema, then persisted exactly
  // the way elements/routes.ts does it.
  let count = 0;
  for (const seed of ELEMENTS) {
    const schemas = elementRegistry[seed.type];
    if (!schemas) throw new Error(`No schema for type ${seed.type}`);
    const parsed = schemas.create.safeParse({ type: seed.type, ...seed.input });
    if (!parsed.success) {
      console.error(`\n✗ ${seed.key} (${seed.type}) failed validation:`);
      for (const issue of parsed.error.issues) {
        console.error(`    ${issue.path.join('.')}: ${issue.message}`);
      }
      throw new Error(`Element "${seed.key}" is not valid against its own create schema.`);
    }
    const b = parsed.data as Record<string, unknown>;

    const el = new Element({
      _id: oid(seed.key),
      campaignId,
      type: seed.type,
      name: b.name,
      body: b.body ?? null,
      bodyText: deriveBodyText(b.body),
      tags: b.tags ?? [],
      playerVisible: b.playerVisible ?? false,
      secrets: b.secrets ?? '',
      soundtrack: b.soundtrack ?? null,
      data: b.data ?? {},
      links: [...relationshipLinks(b.relationships), ...mentionLinks(b.body)],
      updatedBy: owner._id,
    });
    await el.save();
    await Element.updateOne(
      { _id: el._id },
      { $set: { createdAt: D(seed.created), updatedAt: D(seed.updated) } },
      { timestamps: false },
    );
    count++;
  }

  // Live session — mid-combat, round 3
  const now = Date.now();
  const started = new Date(now - 42 * 60 * 1000);
  const session = await GameSession.create({
    campaignId,
    status: 'active',
    sourceEncounterId: oid('ambush'),
    round: 3,
    turnIndex: 2, // Vespera Quill — Frightened, 8 HP, and it is her go
    startedBy: owner._id,
    combatants: COMBATANTS.map((c) => ({
      cid: cid8(),
      name: c.name,
      initiative: c.init,
      maxHp: c.max,
      currentHp: c.cur,
      tempHp: c.temp ?? 0,
      conditions: (c.conds ?? []).map((n) => ({ name: n, rounds: null })),
      deathSaves: c.deaths ?? { successes: 0, failures: 0 },
      isPlayer: c.player,
      sourceElementId: c.src ? oid(c.src) : null,
      notes: c.notes ?? '',
    })),
    log: LOG.map((l) => ({
      at: new Date(started.getTime() + l.min * 60 * 1000),
      kind: l.kind,
      text: l.text,
      by: l.by,
    })),
  });
  await GameSession.updateOne(
    { _id: session._id },
    { $set: { createdAt: started, updatedAt: new Date(now - 60 * 1000) } },
    { timestamps: false },
  );

  // Activity feed
  for (const a of ACTIVITY) {
    const seed = ELEMENTS.find((e) => e.key === a.key)!;
    const act = await Activity.create({
      campaignId,
      userId: a.who === 'owner' ? owner._id : playerIds.Tess,
      action: a.action,
      elementId: oid(a.key),
      elementType: seed.type,
      elementName: NAME[a.key],
    });
    await Activity.updateOne(
      { _id: act._id },
      {
        $set: {
          createdAt: new Date(now - a.daysAgo * 86400000 - 3600000),
          updatedAt: new Date(now - a.daysAgo * 86400000 - 3600000),
        },
      },
      { timestamps: false },
    );
  }

  // Share link + invites
  const share = await ShareLink.create({
    campaignId,
    token: crypto.randomBytes(24).toString('base64url'),
    scope: 'campaign',
    createdBy: owner._id,
  });
  const week = new Date(now + 7 * 86400000);
  const inviteEditor = await Invite.create({
    campaignId,
    token: crypto.randomBytes(24).toString('base64url'),
    role: 'editor',
    createdBy: owner._id,
    expiresAt: week,
  });
  const inviteViewer = await Invite.create({
    campaignId,
    token: crypto.randomBytes(24).toString('base64url'),
    role: 'viewer',
    createdBy: owner._id,
    expiresAt: week,
  });

  const published = ELEMENTS.filter((e) => e.input.playerVisible).length;
  const origin = env.clientOrigin;
  console.log(`
✓ Seeded "${CAMPAIGN_NAME}"

  Owner        ${owner.displayName}
  Campaign     ${origin}/campaigns/${campaignId}
  Elements     ${count} (${published} published to players, ${count - published} GM-only)
  Members      ${1 + PLAYERS.length} (1 owner, 1 editor, 3 viewers)
  Session      LIVE — round 3, ${COMBATANTS.length} combatants, ${LOG.length} log entries
  Activity     ${ACTIVITY.length} entries
  Mood slots   ${CAMPAIGN_INPUT.moodSlots.length} bound to verified Spotify playlists

  Player share  ${origin}/share/${share.token}
  Invite (edit) ${origin}/invite/${inviteEditor.token}
  Invite (view) ${origin}/invite/${inviteViewer.token}

  Re-run to reset. 'npm run seed:demo -- --clean' removes it.
`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
