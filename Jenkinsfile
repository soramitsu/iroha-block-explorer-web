@Library('jenkins-library')

def pipeline = new org.js.AppPipeline(
    packageManager:     'pnpm',
    buildCmds:          [
        'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright sh scripts/bootstrap-exact-toolchain.sh node scripts/run-ci-gates.mjs',
    ],
    steps:              this,
    test:               false,
    dockerImageName:    'iroha2/iroha2-block-explorer-web',
    // This digest retains Playwright 1.58.2 Chromium and its Noble system dependencies. The
    // published image contains Node 24.13.0, so a shell bootstrap installs and verifies the
    // SHA-256-pinned Node 24.19.0 runtime before that image's Node executes repository code.
    buildDockerImage:   'mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d',
    dockerRegistryCred: 'bot-iroha2-rw',
    sonarProjectName:   'iroha2-block-explorer-web',
    sonarProjectKey:    'jp.co.soramitsu:iroha2-block-explorer-web',
)
pipeline.runPipeline() 
