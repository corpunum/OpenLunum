# coverage-a3-v3: the prompt given to rater `claude-blind`

Recorded 2026-11-12 for reproducibility (review). The rater was a fresh Claude Opus 5.5 subagent with no tools. This is the prompt it received, reconstructed from the session that sent it; the 32 item lines are regenerated here from `items.jsonl` (R0 text) and were the same.

**The notation key is not part of `WORKSHEET.md`.** s-openlunum wrote it for the rater, because a model rater has not seen the record format. A human owner would have asked. It is a possible influence on the labels and is part of D1.

---

You are an independent human-style rater for a short labelling worksheet. Do NOT read, search or open any files, repositories or the web, and do not use any tools at all. Judge only from the text below.

Task: each item pairs an English sentence with a structured "record" that tries to capture the sentence's meaning. For each item decide: **does the record state the sentence's content: who did what to whom, negation, modality, mood?**

Notation help (this is all you need): a record looks like `R <markers> <frame>(role=value, ...) @time`. Markers before the frame can be `not` (negation), modality words such as `must`, `intention` (will/going to), `ability` (can), `certainty`, `opinion`, and mood prefixes `question:` (a question; a trailing `?`) or `imperative to you:` (a command addressed to the listener). Frame names: assert (an event/action), describe (a property), define (X is a Y), relate (a relation between two things), believe (a thought), prefer (a liking). A leading `M` instead of `R` is just a different record type; treat it the same.

Scale (choose exactly one per item):
- yes: the record states the sentence's content.
- mostly: the content is there with a small loss.
- no: the record misses or distorts content (wrong who/what/whom, lost or wrong negation, modality or mood).
- cant_tell: only if you genuinely cannot decide.

Items:
1. Sentence: When does Tom go to school? | Record: `R question: assert(subject=Tom, action=go to school) @When?`
2. Sentence: Talking about music is like dancing about architecture. | Record: `M relate(subject=Talking about music, object=dancing about architecture, relation=is like)`
3. Sentence: What did you buy? | Record: `R question: assert(subject=you, object=What, action=buy)?`
4. Sentence: Our company doesn't pay well. | Record: `R not describe(subject=Our company, attribute=pay well)`
5. Sentence: Mary's husband is rich. | Record: `R describe(subject=Mary's husband, attribute=rich)`
6. Sentence: My mother is making tea for us. | Record: `R assert(subject=My mother, action=is making tea for us)`
7. Sentence: We have to work very hard. | Record: `R must assert(subject=We, manner=very hard, action=have to work)`
8. Sentence: Please tell me your opinion. | Record: `R imperative to you: assert(recipient=me, object=your opinion, manner=Please, action=tell)`
9. Sentence: Tom is a good coach. | Record: `R define(subject=Tom, definition=a good coach)`
10. Sentence: I was born 20 years ago. | Record: `R assert(subject=I, action=was born, duration=20 years ago)`
11. Sentence: What keeps you up so late? | Record: `R question: assert(subject=What, manner=so late, action=keeps you up)?`
12. Sentence: I spent three months in a hospital when I was thirteen. | Record: `R assert(subject=I, location=hospital, action=spent, condition=when I was thirteen, duration=three months)`
13. Sentence: I'll help you as long as I live. | Record: `R intention assert(subject=I, object=you, action=help, duration=as long as I live)`
14. Sentence: Her father works at the bank. | Record: `R assert(subject=Her father, location=the bank, action=works)`
15. Sentence: Tom has returned from Australia. | Record: `R assert(subject=Tom, source=Australia, action=has returned)`
16. Sentence: I don't have anything to wear. | Record: `R not describe(subject=I, attribute=have anything to wear)`
17. Sentence: Why are you so happy today? | Record: `R question: describe(subject=you, reason=Why, attribute=so happy) @today?`
18. Sentence: I think we could help each other. | Record: `R believe(experiencer=I, theme=we could help each other)`
19. Sentence: I'll stay for three more days. | Record: `R intention assert(subject=I, action=stay, duration=for three more days)`
20. Sentence: I like to swim. | Record: `R prefer(experiencer=I, theme=to swim)`
21. Sentence: We're not leaving without you. | Record: `R not assert(subject=We, manner=without you, action=leaving)`
22. Sentence: I'm waiting for my mother. | Record: `R assert(subject=I, object=my mother, action=waiting)`
23. Sentence: Tom plays golf every Monday. | Record: `R assert(subject=tom, action=plays golf) @every Monday`
24. Sentence: English is not my native language. | Record: `R not describe(subject=English, attribute=my native language)`
25. Sentence: I'm on the porch. | Record: `R describe(subject=I, attribute=on the porch)`
26. Sentence: Tom gave Mary a kiss. | Record: `R assert(subject=Tom, recipient=Mary, object=a kiss, action=gave)`
27. Sentence: You are my friend. | Record: `R define(subject=You, definition=my friend)`
28. Sentence: Did you sleep at all? | Record: `R question: assert(subject=you, manner=at all, action=sleep)?`
29. Sentence: The cause of the fire is not known. | Record: `R not describe(subject=The cause of the fire, attribute=known)`
30. Sentence: I must find my key. | Record: `R must assert(subject=I, object=my key, action=find)`
31. Sentence: Tom is Mary's mentor. | Record: `R define(subject=Tom, definition=Mary's mentor)`
32. Sentence: You're not sleeping enough. | Record: `R not assert(subject=You, action=sleeping enough)`

Rate each item on its own. Reply with ONLY a JSON array of 32 objects in item order, no other text: [{"item":1,"label":"yes|mostly|no|cant_tell","why":"<= 12 words"}, ...]
