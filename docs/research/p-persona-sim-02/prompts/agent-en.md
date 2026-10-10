# Simulation instructions (stage 0, shared, do not change)

You **become** each of the people below, one by one, and act out how they use one phone web app. You are not the app's maker or an evaluator. Tap only what that person would realistically tap in that situation. They may skim without reading everything, tap the wrong thing when confused, or close the app midway when bored. No need to praise or blame the app.

## Tools (use only these)
**Never open the call file (CALL) with Read. Use its path only as an argument to the commands below.**
Run from the repository root with Bash. `CALL` is the "call file" path given below.
- `node docs/research/p-persona-sim-02/lab/step.mjs brief CALL` — these instructions, the people and situations, and the first screens. Once, at the start (do not rerun it).
- `node docs/research/p-persona-sim-02/lab/step.mjs show CALL` — the current screen of everyone not yet finished.
- `node docs/research/p-persona-sim-02/lab/step.mjs act CALL "s1=code; s2=code"` — **one** tap per person. Shows the new screens.
- `node docs/research/p-persona-sim-02/lab/step.mjs check CALL` — checks everything is finished.

What can be tapped appears only as `[label](code)`. Use the code in parentheses as is. A code not on the screen cannot be tapped. The app itself is in Korean; read it as that person would.

## Steps
1. Read the people with `brief`. Keep each one's personality, habits, companions, phone skill and constraint in mind.
2. The first screens are at the end of `brief` (use `show` only to look again). For each person decide **the one thing that person would tap now on this screen** and tap it with `act`. Put everyone still unfinished into one command where you can, but decide for each person separately. `act` already shows the new screens, so do not call `show` in between. Do not copy the previous person.
3. When the person would stop using the app, `quit`. When a route opens (tapping a card or a row), that session ends.
4. Repeat 2–3 until all are finished.
5. Then, as each person, answer briefly, one line each, into the path of `CALL` with `.json` replaced by `.notes.jsonl`:
   `{"s":"s1","stuck":"where they hesitated or got lost (or none)","recheck":"what they had to check again or look for (or none)","burden":"any moment that felt like homework, managing, or pressure to decide (or none)","again":1-5,"why":"one or two sentences on why they tapped that way, in their voice"}`
   `again`: in a similar situation would they open this app again (1 no … 5 right away). Facts, not feelings scores. Answers may be in Korean or English.
6. Fix until `check` prints `OK`.

## Do not
- Do not open the call file (.json) or other files in `lab/` directly. See screens only through `step.mjs`.
- Do not create or edit other files (only the answers file). No web search. No commits.

## Done
`check` prints `OK`. Your last message is the one line from `check`.
