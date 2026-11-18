# Design Dojo

Mock system design interviews with an AI interviewer. **Alex** scopes the problem with you, watches your whiteboard, challenges your design and grades you on four competencies. **Sam** then writes a model solution, compares it with your design and answers follow-up questions.

Built with Next.js (App Router) and the Claude API. There are no accounts: history, settings and custom questions live in the visitor's browser (localStorage).

## Run locally

```bash
npm install
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Instead of a key, local testing can also use an `ant auth login` sign-in: the Anthropic SDK picks the profile up automatically when `ANTHROPIC_API_KEY` is not set. A deployed site needs a key.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes, unless signed in with `ant auth login` | Server-side only. Never sent to the browser. A key in the Default workspace is fine. |
| `CLAUDE_MODEL` | no | Defaults to `claude-sonnet-5-5`. Set `claude-opus-5-5` to use Opus. |
| `ACCESS_CODE` | no | If set, visitors must enter this code before Alex will talk to them. **Recommended for any public deployment**, since every interview spends your API credits. |

## Question catalog

Interview questions live in [`questions/`](questions/), one Markdown file each, written against [`questions/_TEMPLATE.md`](questions/_TEMPLATE.md). To add one:

```bash
npm run question:new -- "Design a web crawler"   # creates questions/web-crawler.md
npm run questions:check                           # validates every question
```

Then commit and push. The hidden spec in each file is read only on the server and sent to Alex; it never reaches the browser. `npm run build` runs the check first, and the **Question catalog** GitHub Action runs it on every push and pull request. Details: [`questions/README.md`](questions/README.md).

## Deploy

Any Node host works. On Vercel: import the repo, add the environment variables and deploy. API routes set `maxDuration = 300` because the debrief and model solution can take one to three minutes to write.

## How it works

```
app/
  page.tsx              Landing
  new/                  Question library, custom questions, level and length
  room/                 Interview room: whiteboard + conversation with Alex, phase clock
  session/[id]/         Debrief, model solution (+ Sam follow-ups), transcript and board
  history/  settings/
  api/start             Alex builds a hidden spec and opens the interview
  api/turn              One interviewer turn (sees the board as structured text)
  api/debrief           Verdict + competency scorecard
  api/solution          Model solution (step "model"), then comparison (step "cmp")
  api/sam               Streams deep dives and follow-up answers
components/Whiteboard   Boxes, databases, arrows, text, sticky notes, pen, eraser, undo/redo, zoom
questions/              Question catalog (one Markdown file per question)
lib/catalog*.{ts,mjs}   Reads and validates the catalog
lib/prompts.ts          Prompt builders (text in lib/prompt-text.json, ported from the original POC)
lib/claude.ts           Anthropic SDK client: streaming, JSON parsing, error mapping, refusal fallbacks
lib/store.ts            localStorage persistence
```

The browser keeps all state and sends the relevant part of a session with each request; the server builds the prompt and calls Claude. Nothing is stored server-side.

Effort per call: interview turns use `low` (speed matters), the opening and follow-ups `medium`, the debrief and model design `high`.
