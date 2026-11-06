# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-11-06

### Changed

- KILN links point at its own domain, https://kiln3d.dev/ ([#9](https://github.com/lukasgolino/pagan-website/issues/9)).
- CI checks are cheap, so they run on every push (and on demand).
  Deploys skip pushes that only touch the changelog, README or CI-only workflows.

## [0.1.0] - 2026-11-05

### Added

- Cloudflare Web Analytics beacon on every page (cookieless); CI checks it's on each built page
  ([#2](https://github.com/lukasgolino/pagan-website/issues/2)).
- `/sitemap.xml` listing every page, referenced from robots.txt; CI checks that every built page is in it
  ([#1](https://github.com/lukasgolino/pagan-website/issues/1)).
- CHANGELOG.md, a check workflow (type-check + build on every push and PR), and a release workflow that publishes
  a GitHub release for each `vX.Y.Z` tag ([#3](https://github.com/lukasgolino/pagan-website/issues/3)).

[Unreleased]: https://github.com/lukasgolino/pagan-website/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/lukasgolino/pagan-website/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/lukasgolino/pagan-website/releases/tag/v0.1.0
