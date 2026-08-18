# Changelog

## Unreleased

### Features

* add an OAuth-protected A2A 1.0 HTTP+JSON endpoint with full hosted-operation parity
* add curated mailbox attachment tools, zero-context upload modes, and bounded wait-for-message support

## [1.6.0](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.5.1...python-mcp-v1.6.0) (2026-08-18)


### Features

* **mcp:** add hosted A2A server ([#143](https://github.com/Sendmux/sendmux-sdk/issues/143)) ([91d92c3](https://github.com/Sendmux/sendmux-sdk/commit/91d92c3f1ec99c1f4a4718df99b15d501abfcec7))

## [1.5.1](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.5.0...python-mcp-v1.5.1) (2026-08-07)


### Bug Fixes

* **sdk:** regenerate management clients for the Amazon SES identity fields ([#137](https://github.com/Sendmux/sendmux-sdk/issues/137)) ([b0a3d63](https://github.com/Sendmux/sendmux-sdk/commit/b0a3d63f7d836d3d0e290a5b8c4e315a1a017e43))

## [1.5.0](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.4.0...python-mcp-v1.5.0) (2026-07-22)


### Features

* add @sendmux/ai-sdk and langchain-sendmux framework wrapper packages ([1884e8d](https://github.com/Sendmux/sendmux-sdk/commit/1884e8dba80778fe71b90a49d4e4e4b9a77f5da1))

## [1.4.0](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.3.1...python-mcp-v1.4.0) (2026-07-08)


### Features

* **sdk:** add sending attachment upload surfaces ([#96](https://github.com/Sendmux/sendmux-sdk/issues/96)) ([b8f9d5f](https://github.com/Sendmux/sendmux-sdk/commit/b8f9d5fe3c1ae510db82ce05c55cbcad92b43b44))

## [1.3.1](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.3.0...python-mcp-v1.3.1) (2026-07-03)


### Bug Fixes

* **mcp:** recover registry publish validation ([#93](https://github.com/Sendmux/sendmux-sdk/issues/93)) ([0f99cd1](https://github.com/Sendmux/sendmux-sdk/commit/0f99cd16ec457187b81dce99a133d553d85dcb7f))

## [1.3.0](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.2.1...python-mcp-v1.3.0) (2026-07-03)


### Features

* **sdk:** add zero-context attachment uploads ([a4352ec](https://github.com/Sendmux/sendmux-sdk/commit/a4352ecfd6f2da37c908387450fea141363d0b81))
* **sdk:** make mailbox attachments agent-ready ([6a145ab](https://github.com/Sendmux/sendmux-sdk/commit/6a145ab1f2735d77783fb36e84aeeeb9bc747827))
* **sdk:** make mailbox attachments agent-ready ([457ed62](https://github.com/Sendmux/sendmux-sdk/commit/457ed62cf32c91aeac1cfe230d50f4f0b922e7cb))


### Bug Fixes

* **mcp:** return attachments while waiting for mail ([44680ae](https://github.com/Sendmux/sendmux-sdk/commit/44680aee201495163bd38ad88e09aadfffe86b1e))
* **sdk:** preserve attachment compatibility checks ([e92a1c2](https://github.com/Sendmux/sendmux-sdk/commit/e92a1c250a062f2f39a4f78c166c9e3a743e97ee))
* **sdk:** regenerate attachment download auth models ([6803890](https://github.com/Sendmux/sendmux-sdk/commit/6803890bad5aba610d5c6ad16ca98d7186ef9347))
* **sdk:** sync attachment download security metadata ([8c133dd](https://github.com/Sendmux/sendmux-sdk/commit/8c133dd489f0e7c07de79df229778dd2e04a6f74))
* **sdk:** tolerate realtime events without attachments ([2d2b117](https://github.com/Sendmux/sendmux-sdk/commit/2d2b117945445b0478cf3f1d4f07b1038097f05f))

## [1.2.1](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.2.0...python-mcp-v1.2.1) (2026-07-02)


### Bug Fixes

* **mcp:** release hosted OAuth scope compatibility ([e02b3cd](https://github.com/Sendmux/sendmux-sdk/commit/e02b3cd1a96ad37a2beafd1fa2ca215b5ac2f99b))

## [1.2.0](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.1.5...python-mcp-v1.2.0) (2026-07-01)


### Features

* allow owner-approved agent tokens for sending ([9d1cb7d](https://github.com/Sendmux/sendmux-sdk/commit/9d1cb7df3df5aef1f59a4990dc087178ba3a7b21))


### Bug Fixes

* **python-mcp:** require current core version ([d4fdfac](https://github.com/Sendmux/sendmux-sdk/commit/d4fdfacc3f1aca3029eebb0141ad24c4220e91fc))
* **python-mcp:** require current core version ([f9b3913](https://github.com/Sendmux/sendmux-sdk/commit/f9b3913ac9ddfa690b76afb0216ab109f679d934))


### Documentation

* **mcp:** rename Product MCP to MCP across SDK READMEs ([96dedc1](https://github.com/Sendmux/sendmux-sdk/commit/96dedc17678096a884e751866736bd4747489501))

## [1.1.5](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.1.4...python-mcp-v1.1.5) (2026-06-19)


### Bug Fixes

* **python-mcp:** refine MCP package metadata ([1972c77](https://github.com/Sendmux/sendmux-sdk/commit/1972c7788bad7dd38792b69b38ab2ecfbf00b92e))

## [1.1.4](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.1.3...python-mcp-v1.1.4) (2026-06-19)


### Bug Fixes

* **python:** add package metadata classifiers ([9a79f5d](https://github.com/Sendmux/sendmux-sdk/commit/9a79f5d118766c5a59fdc9e568f4cf08874f1486))

## [1.1.3](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.1.2...python-mcp-v1.1.3) (2026-06-19)


### Bug Fixes

* **python-mcp:** defer registry manifest until PyPI marker release ([90bc4a9](https://github.com/Sendmux/sendmux-sdk/commit/90bc4a9c232daa6fe54f698525c1fea61718930a))
* **python-mcp:** prepare MCP registry publishing ([32e5cff](https://github.com/Sendmux/sendmux-sdk/commit/32e5cff343b4045c06c1a6c0676a1c298e759a05))

## [1.1.2](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.1.1...python-mcp-v1.1.2) (2026-06-18)


### Documentation

* update Sendmux docs links ([24b89cb](https://github.com/Sendmux/sendmux-sdk/commit/24b89cb851dd8f37dd1304eb292681892bad077d))

## [1.1.1](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.1.0...python-mcp-v1.1.1) (2026-06-17)


### Documentation

* expand Python package READMEs ([6d82e19](https://github.com/Sendmux/sendmux-sdk/commit/6d82e1990d5a4efbde7b8107deae58bd99d35b89))

## [1.1.0](https://github.com/Sendmux/sendmux-sdk/compare/python-mcp-v1.0.0...python-mcp-v1.1.0) (2026-06-17)


### Features

* **mcp:** add hosted resource server ([a397e48](https://github.com/Sendmux/sendmux-sdk/commit/a397e48b0e53dde452f318f77dd40ce3c25d24ec))

## 1.0.0 (2026-06-03)


### Features

* add MCP server package ([b53182a](https://github.com/Sendmux/sendmux-sdk/commit/b53182a16a46d03a7c3a04a072015ec83dc9de4f))
