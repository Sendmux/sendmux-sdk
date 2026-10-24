# SDK compatible production dependency refresh

Parent runtime-pin candidate: `ffd31fd4de15ccde2d48ac69a2056384c2a3fc0c` (PR323); original main `ec6ed8b12dcbd2c5d82c9d82175ae99ea8b00c9f`.

The existing lock retained vulnerable transitives through `mcp-remote`/Express and Oclif/minimatch. Use pnpm10.22.0's [named, range-respecting update](https://pnpm.io/10.x/cli/update), without `--latest` or new overrides: proxy-addr2.0.7→2.0.8, body-parser1.20.8→1.20.9 (compatible2.x sibling2.3.0→2.4.0), brace-expansion2.1.4→2.1.7/5.0.9→5.0.12. Advance only the existing scoped `mcp-remote>undici` override7.30.0→7.30.1. Body-parser2.4.0 adds its own qs6.16.1 dependency; no unrelated lock refresh.

Native advisories: [proxy-addr critical](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [body-parser high](https://github.com/advisories/GHSA-27r3-jxmh-p828), [brace-expansion high](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [Undici moderate](https://github.com/advisories/GHSA-f72v-6w45-q472).

Verification: targeted update and full frozen workspace install exit0 on Node22.23.4/pnpm10.22.0. Production audit exit0, all severities0 (previous1critical/5high/4moderate). Full audit exit1, residual3critical/17high/19moderate/3low, reported rather than suppressed. Candidate lock SHA256 `ef93ae47b340da8ba98d0ea7e7568dff07f277a4046caa101947cbb79b35563b`. Raw native audit/update/install and existing hook logs: canonical SDK `.claude/artifacts/node-sec-sdk-dependencies/`.

Source only: public package versions/APIs/manifests and generated clients unchanged; no package publication or installed-consumer runtime/dependency replacement. CI must qualify the exact PR head before merge approval. Rollback: revert this dependency candidate, restoring prior lock and scoped override; parent runtime pin remains separately revertible.

Parked: remaining development audit chains (including shell-quote/handlebars critical findings), unpatched http-cache-semantics and Zod migration; consumer/release qualification. No new test or harness; existing generator pre-commit and native PR CI remain mandatory. The broad local hook/heavy-run workflow gap is a separate follow-up.
