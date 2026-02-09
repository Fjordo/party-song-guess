# GitHub Actions CI/CD Setup

## Overview

This repository includes automated testing via GitHub Actions that runs on every push and pull request to the `main` branch.

## Workflow Structure

### File: [`.github/workflows/node.js.yml`](.github/workflows/node.js.yml)

The workflow consists of two parallel jobs:

1. **test-server**: Tests the backend (Node.js + Express + Socket.io)
2. **build-client**: Builds the frontend (React + Vite)

## What Gets Tested

### Server Tests (107 tests)

- ✅ Answer validation (checkAnswer) - 43 tests
- ✅ Language detection - 19 tests
- ✅ iTunes API integration (musicService) - 14 tests
- ✅ Gemini AI integration (aiService) - 11 tests
- ✅ Game flow integration - 20 tests

### Client Build

- ✅ Vite build succeeds
- ✅ `dist/` directory is created

## Node.js Versions Tested

- **Node.js 20.x** (LTS)
- **Node.js 22.x** (Current)

## Coverage Reporting

Coverage reports are automatically generated and uploaded to Codecov (optional) on Node.js 22.x runs.

Current coverage: **97.91%** on services, **100%** on utilities.

## Setting Up Badges (Optional)

To add status badges to your README, replace `YOUR_USERNAME` with your GitHub username:

```markdown
[![Node.js CI](https://github.com/YOUR_USERNAME/party-song-guess/actions/workflows/node.js.yml/badge.svg)](https://github.com/YOUR_USERNAME/party-song-guess/actions/workflows/node.js.yml)
```

## Codecov Integration (Optional)

To enable coverage reporting on Codecov:

1. Sign up at [codecov.io](https://codecov.io) with your GitHub account
2. Add this repository to Codecov
3. No token needed - the workflow will automatically upload coverage

The workflow already includes Codecov upload with `fail_ci_if_error: false` and `continue-on-error: true`, so it won't fail the build if Codecov is not set up.

## Triggering the Workflow

The workflow runs automatically on:

- **Push to main branch**
- **Pull requests targeting main branch**

You can also trigger it manually:

1. Go to **Actions** tab in GitHub
2. Select **Node.js CI** workflow
3. Click **Run workflow**

## Local Testing Before Push

Before pushing, run tests locally to catch issues early:

```bash
# Server tests
cd app/server
npm test

# Client build
cd app/client
npm run build
```

## Troubleshooting

### Workflow Fails on `npm ci`

- **Cause**: Missing or outdated `package-lock.json`
- **Fix**: Run `npm install` locally and commit `package-lock.json`

### Tests Pass Locally But Fail in CI

- **Cause**: Environment differences (Node.js version, OS)
- **Fix**: Check which Node.js version is failing, test locally with that version

### Client Build Fails

- **Cause**: Missing dependencies or build errors
- **Fix**: Run `npm run build` locally in `app/client` to debug

### Coverage Upload Fails

- **Cause**: Codecov token missing or network issue
- **Fix**: This is non-critical and won't fail the build (set to `continue-on-error: true`)

## Customization

### Add More Node.js Versions

Edit the `matrix.node-version` array:

```yaml
strategy:
  matrix:
    node-version: [18.x, 20.x, 22.x]
```

### Add Linting

Uncomment the lint job at the bottom of the workflow and add lint scripts to `package.json`:

```json
{
  "scripts": {
    "lint": "eslint ."
  }
}
```

### Add More Jobs

Add additional jobs like deployment, security scanning, or integration tests by creating new job blocks in the workflow file.

## Best Practices

1. **Keep Tests Fast**: Current test suite runs in ~1 second
2. **Mock External APIs**: All external APIs (iTunes, Gemini) are mocked
3. **Don't Skip Tests**: Never push with `--no-verify` to bypass tests
4. **Update on Breaking Changes**: If tests break due to legitimate code changes, update tests accordingly

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Node.js CI/CD Guide](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Codecov Documentation](https://docs.codecov.com/docs)
