// The remote usability test, as data. Used by the review page (to render) and by the API (to validate).
// Edit questions here only. Every answer id below is stored exactly as written.

export const STUDY = {
  id: 'leakproof-remote-test-v1',
  title: 'LeakProof remote usability test',
  team: 'LeakProof team, Usable Security and Privacy (IIIT-Delhi), Monsoon 2026',
  approxMinutes: '12 to 15',
};

const agree5 = { min: 1, max: 5, minLabel: 'Strongly disagree', maxLabel: 'Strongly agree' };
const agree7 = { min: 1, max: 7, minLabel: 'Strongly disagree', maxLabel: 'Strongly agree' };
const seq = { min: 1, max: 7, minLabel: 'Very difficult', maxLabel: 'Very easy' };

const stuckQ = (t) => ({ id: `${t}_stuck`, type: 'single', required: true, label: 'Did you get stuck or confused at any point in this task?',
  options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] });
const incidentQ = (t) => ({ id: `${t}_incident`, type: 'text', voice: true, maxLen: 1000, showIf: { id: `${t}_stuck`, equals: 'yes' },
  label: 'Tell us about that moment.', help: 'What were you trying to do? What did you expect to happen? What happened instead?' });
const slowQ = (t) => ({ id: `${t}_slow`, type: 'single', showIf: { id: `${t}_stuck`, equals: 'yes' }, label: 'How much did it get in your way?',
  options: [{ value: '1', label: 'A little: I noticed it but carried on' }, { value: '2', label: 'Some: it slowed me down' }, { value: '3', label: 'A lot: I nearly gave up' }, { value: '4', label: 'I could not complete the task' }] });
const seqQ = (t) => ({ id: `${t}_seq`, type: 'scale', required: true, label: 'Overall, this task was…', scale: seq });

// Interview availability. Edit these each week; times are IST. The values are stored, so keep them stable.
export const SLOTS = [
  { value: 'sat3-am', label: 'Sat 3 Oct, 10 am to 1 pm' }, { value: 'sat3-pm', label: 'Sat 3 Oct, 2 pm to 5 pm' }, { value: 'sat3-eve', label: 'Sat 3 Oct, 6 pm to 9 pm' },
  { value: 'sun4-am', label: 'Sun 4 Oct, 10 am to 1 pm' }, { value: 'sun4-pm', label: 'Sun 4 Oct, 2 pm to 5 pm' },
  { value: 'mon5-eve', label: 'Mon 5 Oct, 6 pm to 9 pm' }, { value: 'later', label: 'Later in the week (I will say when below)' },
];
export const MODES = [
  { value: 'meet', label: 'Video call (Google Meet)' }, { value: 'phone', label: 'Phone call' }, { value: 'whatsapp', label: 'WhatsApp call' }, { value: 'campus', label: 'In person, on campus' },
];

export const SECTIONS = [
  {
    id: 'intro', title: 'Before you start', kind: 'intro',
    questions: [
      { id: 'consent', type: 'consent', required: true,
        label: 'I have read this and I agree to take part. I know I can stop at any time.' },
      { id: 'email', type: 'text', format: 'email', required: true, maxLen: 120,
        label: 'Your email', help: 'So we can confirm you took part and match your answers to you. It is stored apart from your answers, never shown publicly, and not used in any report.' },
    ],
  },
  {
    id: 'about', title: 'About you', intro: 'Three quick questions so we can tell different kinds of people apart.',
    questions: [
      { id: 'role', type: 'single', required: true, label: 'Which describes you best?', options: [
        { value: 'course_peer', label: 'A student in this course' }, { value: 'other_student', label: 'A student, not in this course' },
        { value: 'faculty_ta', label: 'Faculty or a TA' }, { value: 'exam_staff', label: 'Someone who helps run exams' }, { value: 'other', label: 'Something else' }] },
      { id: 'exams', type: 'multi', label: 'Which exams have you taken or helped run?', help: 'Pick all that apply. You can skip this.', options: [
        { value: 'neet', label: 'NEET' }, { value: 'jee', label: 'JEE' }, { value: 'cuet', label: 'CUET' }, { value: 'ugcnet', label: 'UGC-NET' },
        { value: 'state', label: 'State PSC or police recruitment' }, { value: 'ssc', label: 'SSC or Railways' }, { value: 'univ', label: 'University exams' }, { value: 'none', label: 'None of these' }] },
      { id: 'device', type: 'single', required: true, label: 'What are you using right now?', options: [
        { value: 'phone', label: 'A phone' }, { value: 'laptop', label: 'A laptop or desktop' }, { value: 'tablet', label: 'A tablet' }] },
    ],
  },
  {
    id: 'before', title: 'Before you see anything', intro: 'Answer from what you already think. Your first instinct is fine.',
    questions: [
      { id: 'leakwhere', type: 'multi', max: 2, required: true, label: 'Where do you think an exam paper is most likely to leak?', help: 'Pick up to two.', options: [
        { value: 'written', label: 'While the questions are written' }, { value: 'press', label: 'At the printing press' }, { value: 'transport', label: 'During transport' },
        { value: 'storage', label: 'In storage at the exam centre' }, { value: 'hall', label: 'Inside the exam hall' }, { value: 'after', label: 'After the exam is over' }, { value: 'dontknow', label: 'I do not know' }] },
      { id: 'trust_before', type: 'scale', required: true, label: 'How much do you trust that exam papers stay secret until the exam?', scale: { min: 1, max: 5, minLabel: 'Not at all', maxLabel: 'Completely' } },
      { id: 'accept_before', type: 'scale', required: true, label: 'How acceptable would it be if the paper were printed at the exam centre shortly before the exam, instead of arriving already printed?', scale: { min: 1, max: 5, minLabel: 'Not acceptable', maxLabel: 'Fully acceptable' } },
      { id: 'model', type: 'text', voice: true, maxLen: 1000, label: 'In your own words: what happens to a paper from the time it is written until it reaches the candidate?', help: 'Optional. A few sentences is plenty.' },
    ],
  },
  {
    id: 'tasks', title: 'Four short tasks', kind: 'tasks',
    intro: 'For each task you will see a scenario and a goal, then a small working prototype. Try it, and press "I\'m done" when you can do what the end line says. There is no wrong way. If you get stuck, press "I\'m stuck, skip". We are testing the design, not you.',
    questions: [
      { id: 't1', type: 'task', scene: 1, limitSec: 120, title: 'Task 1 of 4: A few leaks',
        scenario: 'An exam board has 20 question setters. A few of them leak their questions.',
        goal: 'Find out roughly how much of the paper is exposed when 5 setters leak.',
        end: 'You are done when you can say how many of the 15 questions on the paper are known to the leakers.',
        post: [
          { id: 't1_check', type: 'single', required: true, label: 'Five setters leak their questions. Which is closest to right?', options: [
            { value: 'a', label: 'Only the leaked questions that happen to be drawn onto the paper, usually a minority', correct: true },
            { value: 'b', label: 'All 25 of their questions are on the paper' }, { value: 'c', label: 'The whole paper is exposed' }, { value: 'd', label: 'It makes no difference' }, { value: 'e', label: 'Not sure' }] },
          seqQ('t1'), stuckQ('t1'), incidentQ('t1'), slowQ('t1') ] },
      { id: 't2', type: 'task', scene: 2, limitSec: 120, title: 'Task 2 of 4: The locked paper',
        scenario: 'The paper is locked. Its key is split among five key holders.',
        goal: 'Unlock the paper.',
        end: 'You are done when the sample questions appear.',
        post: [
          { id: 't2_check', type: 'single', required: true, label: 'Two of the five key holders approve. What happens?', options: [
            { value: 'a', label: 'The paper stays locked', correct: true }, { value: 'b', label: 'It opens slowly' }, { value: 'c', label: 'It opens partly' }, { value: 'd', label: 'Not sure' }] },
          seqQ('t2'), stuckQ('t2'), incidentQ('t2'), slowQ('t2'),
          { id: 't2_why', type: 'text', voice: true, maxLen: 600, label: 'Why do you think the system needs several people instead of one?', help: 'Optional. This tells us how you picture it.' } ] },
      { id: 't3', type: 'task', scene: 3, limitSec: 120, title: 'Task 3 of 4: A leaked photo',
        scenario: 'A photo of a page appears online. It shows only the top question.',
        goal: 'Find out which seats could be the source of that photo.',
        end: 'You are done when you can say how many seats could match. (Choose "Top question only" in the prototype.)',
        post: [
          { id: 't3_check', type: 'single', required: true, label: 'A photo of one complete page leaks. What can the system tell?', options: [
            { value: 'a', label: 'Which seat it came from, or a short list of seats', correct: true }, { value: 'b', label: 'The name of the person who posted it' }, { value: 'c', label: 'Nothing' }, { value: 'd', label: 'Not sure' }] },
          seqQ('t3'), stuckQ('t3'), incidentQ('t3'), slowQ('t3'),
          { id: 't3_fair', type: 'scale', required: true, label: 'Every candidate gets the same questions in a different order. How fair is that?', scale: { min: 1, max: 5, minLabel: 'Very unfair', maxLabel: 'Very fair' } },
          { id: 't3_worry', type: 'multi', label: 'Which worries would you have about different orders?', help: 'Pick all that apply.', options: [
            { value: 'harder', label: 'Some orders might be harder' }, { value: 'keys', label: 'Answer keys could be wrong' }, { value: 'cheat', label: 'It could make cheating look easier' },
            { value: 'invig', label: 'It is confusing for invigilators' }, { value: 'none', label: 'No worries' }] } ] },
      { id: 't4', type: 'task', scene: 4, limitSec: 120, title: 'Task 4 of 4: The activity log',
        scenario: 'Someone with access wants to change a record without being caught.',
        goal: 'Find out whether they can get away with it.',
        end: 'You are done when you can explain what gives the change away.',
        post: [
          { id: 't4_check', type: 'single', required: true, label: 'Someone edits a record, then recomputes the log\'s fingerprints so it looks consistent. What still gives it away?', options: [
            { value: 'a', label: 'The last fingerprint no longer matches the one published earlier', correct: true }, { value: 'b', label: 'The log refuses to save' }, { value: 'c', label: 'Nothing; it cannot be detected' }, { value: 'd', label: 'Not sure' }] },
          seqQ('t4'), stuckQ('t4'), incidentQ('t4'), slowQ('t4') ] },
    ],
  },
  {
    id: 'overall', title: 'Your overall impression', intro: 'Thinking about all four tasks.',
    questions: [
      { id: 'explain', type: 'text', voice: true, required: true, minLen: 10, maxLen: 800, label: 'In one or two sentences, explain to a friend what this system does.', help: 'This tells us if the idea comes across.' },
      { id: 'umux1', type: 'scale', required: true, label: 'The features would meet what I need from a secure exam system.', scale: agree7 },
      { id: 'umux2', type: 'scale', required: true, label: 'The prototype is easy to use.', scale: agree7 },
      { id: 'trust_after', type: 'scale', required: true, label: 'A system like this would make me trust exam security more.', scale: agree5 },
      { id: 'accept_after', type: 'scale', required: true, label: 'How acceptable is printing the paper at the exam centre shortly before the exam?', scale: { min: 1, max: 5, minLabel: 'Not acceptable', maxLabel: 'Fully acceptable' } },
      { id: 'hardest', type: 'single', required: true, label: 'Which task was hardest to follow?', options: [
        { value: 't1', label: 'Task 1: A few leaks' }, { value: 't2', label: 'Task 2: The locked paper' }, { value: 't3', label: 'Task 3: A leaked photo' }, { value: 't4', label: 'Task 4: The activity log' }, { value: 'none', label: 'None of them' }] },
      { id: 'change', type: 'text', voice: true, maxLen: 1500, label: 'What would you change first?', help: 'Anything: wording, layout, steps, features, or the idea itself. Optional, but this is the most useful thing you can tell us.' },
    ],
  },
  {
    id: 'decisions', title: 'Our design choices: your verdict', optional: true,
    intro: 'These are real choices we have made. Agree, disagree, or say you are unsure. If you disagree, tell us why. We would rather hear it now.',
    questions: [
      { id: 'd_pool', type: 'decision', title: 'Many setters write a few questions each; a program draws the paper late.',
        pros: 'One leaker exposes only a small part of the paper.', cons: 'Quality and difficulty balance are harder to control.' },
      { id: 'd_split', type: 'decision', title: 'Several people (3 of 5) must approve before the paper opens, instead of one administrator.',
        pros: 'No single person can open the paper alone.', cons: 'Several people must be reachable at the centre.' },
      { id: 'd_print', type: 'decision', title: 'The paper is printed at the centre shortly before the exam, instead of being shipped already printed.',
        pros: 'No printing press or courier handover.', cons: 'Every centre needs a printer, power and a connection.' },
      { id: 'd_order', type: 'decision', title: 'Every candidate gets a different order of questions and options.',
        pros: 'A leaked photo points to a seat.', cons: 'Some may see it as unfair; answer keys must map per copy.' },
      { id: 'd_log', type: 'decision', title: 'Every action is written to a tamper-evident log.',
        pros: 'Quiet changes show up.', cons: 'The latest fingerprint must be published outside the system.' },
    ],
  },
  {
    id: 'more', title: 'Think like the person running it', optional: true,
    intro: 'Imagine you are the centre superintendent doing Task 2 with candidates waiting.',
    questions: [
      { id: 'hitl', type: 'multi', max: 2, label: 'Where might things go wrong for that person? Pick up to two.', options: [
        { value: 'know', label: 'They might not realise they have to do it' }, { value: 'understand', label: 'They might not understand what the screen asks' },
        { value: 'how', label: 'They might not know how to do it' }, { value: 'motivated', label: 'They might not be motivated to follow every step' },
        { value: 'capable', label: 'They might not be able to (device, power, time)' }, { value: 'skip', label: 'They might skip steps under pressure' }] },
      { id: 'missing', type: 'text', voice: true, maxLen: 1500, label: 'What is missing? What would you add or remove?', help: 'Optional.' },
    ],
  },
  {
    id: 'finish', title: 'One last thing', kind: 'finish',
    intro: 'Swap links with us, and tell us if you would like a short chat. Then you get your participation receipt.',
    questions: [
      { id: 'c_link', type: 'text', format: 'url', requiredIf: { id: 'role', equals: 'course_peer' }, maxLen: 300,
        label: 'Your own study or survey link', help: 'A swap: we will take part in your study too. Required for classmates in this course. Optional for everyone else. Paste the link that starts with https://' },
      { id: 'followup', type: 'single', label: 'Would you be up for a short follow-up call (20 to 30 minutes)?', help: 'We will show you the prototypes, ask what you expected, and listen. No preparation needed.', options: [
        { value: 'yes', label: 'Yes, let us find a time' }, { value: 'no', label: 'No, thank you' }] },
      { id: 'c_slots', type: 'multi', showIf: { id: 'followup', equals: 'yes' }, requiredIf: { id: 'followup', equals: 'yes' }, label: 'When could you talk? Pick every slot that works.', help: 'All times are IST. We will confirm one by message.', options: SLOTS },
      { id: 'c_when', type: 'text', maxLen: 200, showIf: { id: 'followup', equals: 'yes' }, label: 'Another time that suits you better? (optional)', help: 'For example: "Thursday after 7 pm".' },
      { id: 'c_mode', type: 'single', showIf: { id: 'followup', equals: 'yes' }, requiredIf: { id: 'followup', equals: 'yes' }, label: 'How would you like to talk?', options: MODES },
      { id: 'c_contact', type: 'text', maxLen: 200, showIf: { id: 'followup', equals: 'yes' }, requiredIf: { id: 'followup', equals: 'yes' }, minLen: 5, label: 'How can we reach you?', help: 'Email, phone or WhatsApp number. Kept apart from your answers and used only to arrange the call.' },
      { id: 'c_name', type: 'text', maxLen: 120, label: 'Your name, if you want us to be able to confirm you took part.', help: 'Optional. Kept apart from your answers.' },
    ],
  },
];

// These are stored in the separate contact record, never with the answers used for analysis.
export const CONTACT_IDS = ['email', 'c_link', 'c_contact', 'c_name', 'c_slots', 'c_when', 'c_mode', 'c_topic'];

/** The standalone "talk to us" form at /interview. */
export const INTERVIEW = {
  title: 'Talk to us',
  questions: [
    { id: 'consent', type: 'consent', required: true, label: 'I agree to be contacted about a short call, and I know I can say no at any time.' },
    { id: 'c_slots', type: 'multi', required: true, label: 'When could you talk? Pick every slot that works.', help: 'All times are IST. We will confirm one by message.', options: SLOTS },
    { id: 'c_when', type: 'text', maxLen: 200, label: 'Another time that suits you better? (optional)', help: 'For example: "Thursday after 7 pm".' },
    { id: 'c_mode', type: 'single', required: true, label: 'How would you like to talk?', options: MODES },
    { id: 'c_contact', type: 'text', maxLen: 200, required: true, minLen: 5, label: 'How can we reach you?', help: 'Email, phone or WhatsApp number. Used only to arrange the call.' },
    { id: 'c_name', type: 'text', maxLen: 120, label: 'Your name (optional)', help: 'So we know who to expect.' },
    { id: 'c_topic', type: 'text', voice: true, maxLen: 800, label: 'Anything you would like to talk about? (optional)', help: 'For example: you set exam papers, you run an exam centre, or you took one of the exams that leaked.' },
  ],
};
export const TASK_IDS = ['t1', 't2', 't3', 't4'];
export const QUICK_SCENES = ['1', '2', '3', '4', 'general'];

/** All answerable questions, in order, with decision comments and task follow-ups expanded. */
export function flatten(sections = SECTIONS) {
  const out = [];
  for (const sec of sections) {
    for (const q of sec.questions) {
      if (q.type === 'task') { out.push(q); for (const p of q.post) out.push(p); }
      else if (q.type === 'decision') {
        out.push({ ...q, options: [{ value: 'agree' }, { value: 'unsure' }, { value: 'disagree' }] });
        out.push({ id: q.id + '_why', type: 'text', maxLen: 1000, voice: true });
      } else out.push(q);
    }
  }
  return out;
}

/** Required always, or required because an earlier answer made it so (requiredIf). */
export function requiredNow(q, answers) {
  if (q.required) return true;
  if (q.requiredIf) return answers[q.requiredIf.id] === q.requiredIf.equals;
  return false;
}

export function visible(q, answers) {
  if (!q.showIf) return true;
  const v = answers[q.showIf.id];
  if ('equals' in q.showIf) return v === q.showIf.equals;
  if ('includes' in q.showIf) return Array.isArray(v) && v.includes(q.showIf.includes);
  return true;
}
