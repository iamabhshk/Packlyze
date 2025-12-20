# Packlyze: The Bundle Analyser

> A practical, end-to-end guide describing what Packlyze solves, how to use it, and why modern frontend teams should care. Bonus: enough wit to keep your Medium readers awake between charts and code blocks.

---

## 1. The Bundle Problem No One Has Time For

Frontend apps grow faster than we monitor them. Dependencies add megabytes overnight, tree-shaking silently fails, and the only “alert” is a slow Lighthouse score. Somewhere out there, a marketing script is quietly adding 200 KB while everyone argues about button colors.

Packlyze was built to make bundle introspection a daily habit—not a quarterly fire drill. It combines:

- A **CLI** that is easy enough to drop into any repo and flexible enough for CI.
- A **sleek HTML report** you can hand to designers, product managers, or performance teams.
- **Baseline diffing** so regression hunting takes seconds, not hours.

This guide walks through real workflows you can share with your team or audience—and yes, it contains copy-pastable commands so folks can follow along before their coffee cools.

---

## 2. Install and Generate Stats

### Install Packlyze (takes less time than loading node_modules)

```bash
npm install -g packlyze
# or run instantly
npx packlyze --help
```

### Produce a bundler stats file

Packlyze consumes Webpack/Rollup/esbuild stats. For Webpack:

```bash
npx webpack --profile --json stats.json
```

Guidelines:

- Run it on production builds to match what ships to users.
- Store the generated `stats.json` (or equivalent) next to your build artifacts for repeatability.

---

## 3. First Analysis in Seconds

```bash
packlyze analyze stats.json
```

This prints:

- 📊 **Metrics:** Total size, gzip size, modules, chunks, avg module size.
- 💡 **Recommendations:** Severity-tagged guidance (critical, warning, info).
- 🌳 **Tree-shaking issues:** Modules that still rely on `require`/CommonJS.
- 🔁 **Duplicates:** Table of duplicate modules with potential savings.
- 📦 **Large modules:** Highlights modules consuming >5% (configurable) of the bundle.

Add `-o ./reports/bundle-report.html` and Packlyze generates a gorgeous dark-mode dashboard you can share with stakeholders. The report is static—just open it in a browser (or drop it into your design system review and watch eyes widen).

---

## 4. Focused Investigations

When you already know what you’re hunting for:

```bash
# Just duplicate modules
packlyze analyze stats.json --only-duplicates --no-html

# Only large modules at a custom threshold
packlyze analyze stats.json --only-large-modules --large-module-threshold 3 --no-html

# Skip the HTML report entirely (CLI-only workflows)
packlyze analyze stats.json --no-html
```

These filters keep the noise down during deep dives or CI checks. Think of them as “do not disturb” signs for your command line.

---

## 5. Baseline Comparison = Instant Regressions

Keep a previous `stats.json` (e.g., from `main` or a release tag) and compare:

```bash
packlyze analyze stats.new.json --baseline stats.old.json -o ./reports/bundle-report.html
```

Results:

- CLI summary shows deltas (e.g., `+0.19MB vs baseline`). Green for improvements, red for regressions, existential dread optional.
- HTML metrics cards display the same deltas under each metric, which means you can literally *point* to regressions during reviews.

Perfect for pull-request reviews: reviewers can see exactly what changed. Also handy for the Monday stand-up when someone asks, “Why is the bundle heavier?” and you answer with receipts.

---

## 6. CI-Friendly Budgets

Stop guessing when bundles get too big. Add Packlyze to your CI with thresholds:

```bash
packlyze analyze stats.json \
  --max-gzip-size 1.2 \
  --max-initial-size 0.9 \
  --no-html
```

If your gzip or initial chunk sizes exceed the budget, Packlyze:

- Prints the violation (`Max Gzip Threshold: 1.2MB (violated)`).
- Exits with a non-zero status so CI fails before regressions hit production.

Pair this with baselines for maximum visibility. Suddenly your CI is the bundle’s personal trainer.

---

## 7. JSON Output for Custom Dashboards

Need to feed bundle data into bespoke dashboards or Slack alerts? Prefer JSON over human words? We got you:

```bash
packlyze analyze stats.json -j --no-html > packlyze.json
```

The JSON includes everything (metrics, modules, duplicates, issues, recommendations). Parse it in your own tooling or archive snapshots to track bundle health over time.

---

## 8. Why Developers Love Packlyze

- **“This PR adds 200 KB, but where?”**  
  Without Packlyze you’re diffing JSON by hand; with `--baseline` you get a precise list of offenders in seconds.

- **“CI should fail when the bundle bloats.”**  
  Teams usually duct-tape scripts together. Packlyze bakes the budgets right in with `--max-gzip-size` / `--max-initial-size`.

- **“Product wants visual proof.”**  
  Instead of hunting for charts, just ship the HTML report alongside release notes—it’s literally made for storytelling.

- **“Tree-shaking feels broken, help.”**  
  CommonJS culprits are called out explicitly in the 🌳 section so you can nudge teams toward ESM without guesswork.

Packlyze is opinionated where it matters (clear warnings, friendly visuals) but entirely scriptable for power users. It’s the “documentation plus dashboard” combo you wish every tool shipped with.

---

## 9. Recommended Publishing Flow (for your Medium post)

1. **Introduce the bundle problem** with real-world anecdotes (slow builds, bloated chunks, duplicated dependencies).
2. **Show quick wins**: screenshots/clips of the CLI output and the HTML report.
3. **Document the workflows above** (stats generation, baseline comparison, CI budgets, JSON export).
4. **Share lessons learned**: e.g., how enforcing a `--max-gzip-size` policy caught a regression before release.
5. **Invite contributions or feedback** with your repository link and contact info.

This narrative resonates with developers because it solves common pain points with empathetic tooling. Plus, adding a screenshot or two of that neon HTML report practically guarantees a few claps on Medium.

---

## 10. Handy Reference Commands

```bash
# Core analysis + HTML
packlyze analyze stats.json -o ./reports/bundle-report.html

# Baseline comparison
packlyze analyze dist/stats.new.json --baseline dist/stats.old.json

# CI budgets
packlyze analyze stats.json --max-gzip-size 1.0 --max-initial-size 0.8 --no-html

# Duplicate-only view
packlyze analyze stats.json --only-duplicates --no-html

# JSON output for automation
packlyze analyze stats.json -j --no-html > packlyze.json
```

---

## 11. Final Thoughts

Packlyze turns bundle hygiene into a habit:

- **Discover** issues via an intuitive CLI.
- **Communicate** with a polished HTML report.
- **Enforce** standards in CI using baselines and thresholds.


