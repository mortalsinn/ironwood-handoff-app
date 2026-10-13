# Ironwood Handoff app: notes for Claude sessions

Owner: Jeff (Ironwood Stair & Rail). Short, decisive answers. Runs on the shared project template
(`~/.claude/project-template`, settings in `scripts/githooks/project.conf`); the full rules are in
`~/Projects/RibitOS/CLAUDE.md`, "How things ship".

- All work on `dev`. `main` is what is deployed; nothing goes there until Jeff says "push".
- Every change on `dev`: a row in `docs/release/PENDING.md` in the same commit (the pre-commit hook enforces it), then push
  `dev` and post the update to "Ironwood Handoff App Dev channel" (local_839d2c84-7a50-45a1-94ff-cd14cac9f14b) in the standard format.
- "push" = hand Jeff `git push origin dev:main` in its own bash block to Run (or `release/<date>:main` for only some rows).
  After it lands: the Render deploy is manual and the Deluge functions (`*.dg`) are pasted into Zoho by hand; say exactly
  which ones changed. Then move the released rows to the Released table in PENDING.md and post the release to the channel.
- No automated tests yet (`CHECK` is empty in project.conf).
- Stage files by explicit path; another session may be editing this repo.
