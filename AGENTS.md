# Repository Guidelines

## Project Structure & Module Organization
- `parser/` (Rust): Core parsing library + CLI entry (`src/`, `tests/`, benches). Part of Rust workspace with `cli/`.
- `cli/` (Rust): Thin wrapper binary around parser utilities.
- `api/` (TypeScript): Cloudflare Workers API (Wrangler, Vitest, ESLint/Prettier).
- `dashboard/` (Next.js/TS): Web UI (Jest, ESLint, Prettier, Tailwind).
- `scripts/` and root tooling: CI helpers, Dockerfile, GitHub Action assets. See `README.md` for context.

## Build, Test, and Development Commands
- Rust workspace (root): `cargo build` (build all), `cargo test -p swiftconcur-parser`, `cargo run -p swiftconcur-parser -- --help`.
- Parser benches: `cargo bench -p swiftconcur-parser` (requires Criterion).
- API (Cloudflare Worker): `cd api && npm i && npm run dev` (local), `npm run test` (Vitest), `npm run deploy` (Wrangler deploy), `npm run lint`.
- Dashboard (Next.js): `cd dashboard && npm i && npm run dev`, `npm run test`, `npm run lint`, `npm run build`.

## Coding Style & Naming Conventions
- Rust: `cargo fmt` (see `parser/rustfmt.toml`), `cargo clippy` (see `.clippy.toml`). Snake_case modules, PascalCase types, 4‑space indent.
- TypeScript/JS: Prettier + ESLint configs in `api/` and `dashboard/`. Use camelCase for vars/functions, PascalCase for React components. Keep files kebab-case where applicable.
- Commit style: Conventional Commits seen in history (e.g., `feat: …`, `fix: …`, `docs: …`).

## Testing Guidelines
- Rust: `cargo test -p swiftconcur-parser`; integration fixtures under `parser/tests/fixtures`. Optional coverage via Tarpaulin (`parser/tarpaulin.toml`), e.g., `cargo tarpaulin --out Html`.
- API: Vitest with coverage: `cd api && npm run test:coverage`.
- Dashboard: Jest + RTL: `cd dashboard && npm run test` or `npm run test:coverage`.
- Name tests clearly (e.g., `*_tests.rs`, `*.test.ts(x)`), and keep them close to sources or under `tests/`.

## Commit & Pull Request Guidelines
- Commit messages: Use present tense and conventional prefixes (`feat`, `fix`, `docs`, etc.). Scope when helpful.
- PRs: Include a clear description, linked issues, testing notes, and screenshots/GIFs for UI changes. Ensure `lint`, `format`, and tests pass for touched packages.

## Security & Configuration
- Do not commit secrets. Use `.env.local` (dashboard) and Wrangler secrets (api). Reference `.env.example` where provided.
- Review `wrangler.toml` (api) and `next.config.js` (dashboard) before changing prod behavior.
