# coverage-a3-v3 calibration worksheet

> **Filled 2026-11-12 by rater `claude-blind`, not by a human.** The owner delegated the labels (hub decision 34bf87fd: "You do them"). The rater was a fresh Claude Opus 5.5 subagent with no tools and no file access. It saw only this worksheet's instructions, a notation key and the 32 sentence/record pairs, and none of Lunum's scores, the R1 text, the controls or any notes. Every result built on these labels is a **model-rated calibration**. Machine-readable labels: [`labels.json`](labels.json).

For each item: **does the record state the sentence's content: who did what to whom, negation, modality, mood?**

Tick one box per item. "mostly" means the content is there with a small loss. Use "can't tell" only if you cannot decide.

## 1

Sentence: When does Tom go to school?

Record: `R question: assert(subject=Tom, action=go to school) @When?`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Question, subject, action and time question all captured)

## 2

Sentence: Talking about music is like dancing about architecture.

Record: `M relate(subject=Talking about music, object=dancing about architecture, relation=is like)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Comparison relation between both activities preserved)

## 3

Sentence: What did you buy?

Record: `R question: assert(subject=you, object=What, action=buy)?`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Question with buyer, object and action correct)

## 4

Sentence: Our company doesn't pay well.

Record: `R not describe(subject=Our company, attribute=pay well)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Negation and attribute about company preserved)

## 5

Sentence: Mary's husband is rich.

Record: `R describe(subject=Mary's husband, attribute=rich)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Subject and property correct)

## 6

Sentence: My mother is making tea for us.

Record: `R assert(subject=My mother, action=is making tea for us)`

Label: [ ] yes  [x] mostly  [ ] no  [ ] can't tell  (rater note: Object and beneficiary packed into action string, not roles)

## 7

Sentence: We have to work very hard.

Record: `R must assert(subject=We, manner=very hard, action=have to work)`

Label: [ ] yes  [x] mostly  [ ] no  [ ] can't tell  (rater note: Obligation captured, but 'have to' duplicated in action)

## 8

Sentence: Please tell me your opinion.

Record: `R imperative to you: assert(recipient=me, object=your opinion, manner=Please, action=tell)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Imperative, recipient, object and politeness all present)

## 9

Sentence: Tom is a good coach.

Record: `R define(subject=Tom, definition=a good coach)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Classification of Tom as good coach correct)

## 10

Sentence: I was born 20 years ago.

Record: `R assert(subject=I, action=was born, duration=20 years ago)`

Label: [ ] yes  [x] mostly  [ ] no  [ ] can't tell  (rater note: Time point mislabelled as duration; content present)

## 11

Sentence: What keeps you up so late?

Record: `R question: assert(subject=What, manner=so late, action=keeps you up)?`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Question, causer, affected person and lateness all present)

## 12

Sentence: I spent three months in a hospital when I was thirteen.

Record: `R assert(subject=I, location=hospital, action=spent, condition=when I was thirteen, duration=three months)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: All elements present; article dropped trivially)

## 13

Sentence: I'll help you as long as I live.

Record: `R intention assert(subject=I, object=you, action=help, duration=as long as I live)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Future intention, helper, helped and duration correct)

## 14

Sentence: Her father works at the bank.

Record: `R assert(subject=Her father, location=the bank, action=works)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Subject, action and location correct)

## 15

Sentence: Tom has returned from Australia.

Record: `R assert(subject=Tom, source=Australia, action=has returned)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Subject, action and source correct)

## 16

Sentence: I don't have anything to wear.

Record: `R not describe(subject=I, attribute=have anything to wear)`

Label: [ ] yes  [x] mostly  [ ] no  [ ] can't tell  (rater note: Negation kept; possession awkwardly framed as attribute)

## 17

Sentence: Why are you so happy today?

Record: `R question: describe(subject=you, reason=Why, attribute=so happy) @today?`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Why-question, subject, attribute and time captured)

## 18

Sentence: I think we could help each other.

Record: `R believe(experiencer=I, theme=we could help each other)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Belief with possibility kept inside theme)

## 19

Sentence: I'll stay for three more days.

Record: `R intention assert(subject=I, action=stay, duration=for three more days)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Intention, action and duration correct)

## 20

Sentence: I like to swim.

Record: `R prefer(experiencer=I, theme=to swim)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Liking for swimming correctly captured)

## 21

Sentence: We're not leaving without you.

Record: `R not assert(subject=We, manner=without you, action=leaving)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Negation, subject, action and condition preserved)

## 22

Sentence: I'm waiting for my mother.

Record: `R assert(subject=I, object=my mother, action=waiting)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Waiting for mother captured correctly)

## 23

Sentence: Tom plays golf every Monday.

Record: `R assert(subject=tom, action=plays golf) @every Monday`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Subject, action, recurring time correct)

## 24

Sentence: English is not my native language.

Record: `R not describe(subject=English, attribute=my native language)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Negation and attribute preserved)

## 25

Sentence: I'm on the porch.

Record: `R describe(subject=I, attribute=on the porch)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Location state of speaker captured)

## 26

Sentence: Tom gave Mary a kiss.

Record: `R assert(subject=Tom, recipient=Mary, object=a kiss, action=gave)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Giver, recipient, object correct)

## 27

Sentence: You are my friend.

Record: `R define(subject=You, definition=my friend)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Identity statement correct)

## 28

Sentence: Did you sleep at all?

Record: `R question: assert(subject=you, manner=at all, action=sleep)?`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Yes/no question with 'at all' preserved)

## 29

Sentence: The cause of the fire is not known.

Record: `R not describe(subject=The cause of the fire, attribute=known)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Negated property 'known' preserved)

## 30

Sentence: I must find my key.

Record: `R must assert(subject=I, object=my key, action=find)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Obligation, agent, object correct)

## 31

Sentence: Tom is Mary's mentor.

Record: `R define(subject=Tom, definition=Mary's mentor)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Identity relation correct)

## 32

Sentence: You're not sleeping enough.

Record: `R not assert(subject=You, action=sleeping enough)`

Label: [x] yes  [ ] mostly  [ ] no  [ ] can't tell  (rater note: Negation, subject and 'enough' preserved)
