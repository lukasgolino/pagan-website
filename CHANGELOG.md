# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `/sitemap.xml` listing every page, referenced from robots.txt; CI checks that every built page is in it
  ([#1](https://github.com/lukasgolino/pagan-website/issues/1)).
- CHANGELOG.md, a check workflow (type-check + build on every push and PR), and a release workflow that publishes
  a GitHub release for each `vX.Y.Z` tag ([#3](https://github.com/lukasgolino/pagan-website/issues/3)).
