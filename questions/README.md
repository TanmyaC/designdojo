# Question catalog

Every interview question in Design Dojo is one Markdown file in this folder. The app reads them at build time; nothing else needs registering.

## Add a question

1. Create the file from the template:
   ```bash
   npm run question:new -- "Design a web crawler"
   ```
   This writes `questions/web-crawler.md`. The file name is the question's id, so keep it short and don't rename it later (saved interviews and links refer to it).
2. Fill it in. `_TEMPLATE.md` explains every field.
3. Check it:
   ```bash
   npm run questions:check
   ```
4. Commit and push. The **Question catalog** GitHub Action runs the same check on every push and pull request.

## The standard

| Part | Seen by | Required |
|---|---|---|
| `title`, `category`, `difficulty`, `summary` | Candidate (question list) | yes |
| `featured`, `levels`, `tags` | Candidate (home page, filters, search) | no |
| `focus` | "Let Alex choose" (matches the question to a weak competency) | recommended |
| `## Opening` | Candidate, as Alex's first message | no |
| `## Hidden spec` | Alex only, never sent to the browser | recommended |

Inside `## Hidden spec`, use the subsections from the template (Users and core use case, In scope, Out of scope, Scale, Non-functional, Crux, Curveballs, Common misses). Alex reads the whole section as private notes, so short bullet points work best.

Rules the check enforces:
- `title` starts with "Design" and is at most 80 characters; `summary` is at most 140.
- `category` and `difficulty` use the allowed values; `levels` only Mid, Senior or Staff; `focus` only storage, distributed, observability or scoping.
- File names are lowercase words joined by hyphens, and titles are unique.
- No placeholder text left from the template (`<system>`, empty bullets).
