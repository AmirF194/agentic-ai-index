# Contributing

Thanks for helping keep the **Agentic AI Index** the most current map of the ecosystem.

## The one rule: don't edit `README.md` by hand

The project list in `README.md` (everything between the `AUTOGEN` markers) is **generated**.
If you edit it directly, the next refresh will overwrite you. Instead, edit the seed.

## Add or move a project

1. Open [`data/entries.json`](data/entries.json).
2. Add one object to the `entries` array (keep it grouped with its category, alphabetical-ish):

   ```jsonc
   { "repo": "owner/name", "category": "Coding Agents" }
   ```

   - `repo` — the GitHub `owner/name`. Renames are followed automatically; don't worry about
     the exact casing.
   - `category` — must be one of the values in the `categories` array at the top of the file.
3. (Optional but appreciated) regenerate locally so your PR shows the rendered result:

   ```bash
   node scripts/generate.mjs        # Node 18+, uses your `gh` login or $GITHUB_TOKEN
   ```

   If you can't run it, that's fine — a maintainer or the scheduled job will.
4. Open the PR. CI runs `node scripts/generate.mjs --check` to confirm the list is consistent.

## Inclusion criteria

- **Open-source or source-available**, and **self-hostable / runnable by the user.**
- **About building, running, orchestrating, observing, securing, or extending AI agents.**
- **Alive** — archived repos are pruned automatically; please don't add them.
- **Real traction or clear usefulness.** We rank by stars, but a small, genuinely useful tool
  is welcome. Low-effort clones, course-ware, and "list of lists" are not.

## Categories

If a project spans several categories, pick the one that best matches its *primary* job. Proposing
a **new** category? Open an issue first — categories are deliberately few so the map stays legible.

## Removing a project

Open a PR deleting its line from `data/entries.json`, with a one-line reason (dead, renamed to
something already listed, out of scope, etc.).

---

By contributing you agree to release your contribution under [CC0-1.0](LICENSE) (public domain).
