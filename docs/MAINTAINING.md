# Repository maintenance

## GitHub settings

The public repository is `JerrettDavis/symbiosis-lab`, with `main` as its default
branch. Enable squash merges, auto-merge, and deletion of merged branches. Protect
`main` with the `Required checks` status from GitHub Actions, require branches to be
up to date, and block force pushes and deletion. No mandatory approval count is set
so Dependabot can merge tested patch/minor updates without a separate bot account.
Major updates stay open for maintainer review.

Enable dependency alerts, security updates, private vulnerability reporting, secret
scanning, and push protection. The Actions token defaults to read-only; only the
Dependabot auto-merge workflow requests repository write permissions. It reads
trusted Dependabot metadata and never checks out PR code.

Labels include `bug`, `enhancement`, `documentation`, `dependencies`, `github-actions`,
`docker`, `good first issue`, `help wanted`, `question`, `invalid`, `duplicate`,
`wontfix`, and `security`.

## Dependency updates

`.github/dependabot.yml` groups weekly updates by ecosystem, including Actions.
Actions use immutable commit SHAs with version comments. Dependabot updates those
pins. The Docker image follows the current Node 26 tag; review major runtime
updates together with the CI matrix and runtime documentation.

The auto-merge workflow enables squash auto-merge for patch/minor updates. GitHub
branch protection waits for all application, browser, container, and package jobs.
Investigate failed checks before merging; never bypass checks to clear the PR list.

## Releases

1. Update `package.json`, lockfile version, changelog, and relevant docs.
2. Merge the release change and wait for the complete `Verify` workflow on `main`.
3. Download the `release-archive` artifact from that successful run. Its ZIP contains
   compiled output, source, `BUILDINFO.json` with the source commit, and `SHA256SUMS`.
4. Create a tag matching `v<package version>` on the verified commit and publish a
   GitHub release with that ZIP. Mark alpha versions as prereleases.
5. Extract the archive, verify its checksums, and confirm `npm start` works without
   installing build dependencies. GitHub's automatic source archives require `npm ci`
   and `npm run build`; use the attached ZIP for prebuilt output.

For local packaging, run `npm ci`, `npm run verify`, `python scripts/test-package.py`,
then `python scripts/package.py`. Packaging uses an explicit set of project paths;
always inspect archive contents before uploading.
