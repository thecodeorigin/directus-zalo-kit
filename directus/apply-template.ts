/* eslint-disable no-console */
import { spawnSync } from 'node:child_process'

// ENV
const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://directus:8055'
const DIRECTUS_TEMPLATE_COLLECTION = process.env.DIRECTUS_TEMPLATE_COLLECTION
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in environment variables.')
  process.exit(1)
}

// Helper sleep using Atomics (works in Bun/Node.js)
function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function searchForTemplateFolder(): boolean {
  const res = spawnSync('ls', ['/directus/template'])
  return res.status === 0
}

if (!searchForTemplateFolder()) {
  console.log('No template folder found at /directus/template. Exiting.')
  process.exit(0)
}

function waitForDirectus() {
  process.stdout.write('Waiting for Directus to be up...')
  while (true) {
    const res = spawnSync('curl', [
      '--output',
      '/dev/null',
      '--silent',
      '--head',
      '--fail',
      `${DIRECTUS_URL}/server/ping`,
    ])
    if (res.status === 0)
      break
    process.stdout.write('.')
    sleep(5000)
  }
  console.log('\nDirectus is up!')
}

function getAccessToken(): string {
  process.stdout.write('Getting Directus access token...\n')
  const loginPayload = JSON.stringify({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })
  const res = spawnSync('curl', [
    '-s',
    '-X',
    'POST',
    `${DIRECTUS_URL}/auth/login`,
    '-H',
    'Content-Type: application/json',
    '--data-raw',
    loginPayload,
  ])
  const output = res.stdout?.toString() || ''
  const match = output.match(/"access_token"\s*:\s*"([^"]+)"/)
  if (!match) {
    console.error('Error: Failed to get access token.')
    console.error('Response:', output)
    process.exit(1)
  }
  console.log('Access token obtained successfully.')
  return match[1]
}

function checkExistingTemplate(token: string): boolean {
  process.stdout.write('Checking for existing template data...\n')
  const res = spawnSync('curl', [
    '--output',
    '/dev/null',
    '--silent',
    '--head',
    '--fail',
    '-H',
    `Authorization: Bearer ${token}`,
    `${DIRECTUS_URL}/collections/${DIRECTUS_TEMPLATE_COLLECTION}`,
  ])
  if (res.status === 0) {
    console.log('Template has already been applied. Exiting.')
    return true
  }
  console.log('Template not found. Proceeding with application.')
  return false
}

function applyTemplate(token: string) {
  console.log('Applying template...')
  // Use bunx to run directus-template-cli without global install
  const result = spawnSync(
    'bunx',
    [
      'directus-template-cli',
      'apply',
      '-p',
      `--directusUrl=${DIRECTUS_URL}`,
      `--directusToken=${token}`,
      '--templateLocation=/directus/template',
      '--templateType=local',
      '--disableTelemetry',
    ],
    { stdio: 'inherit', shell: true },
  )
  if (result.status !== 0) {
    console.error('directus-template-cli failed.')
    process.exit(1)
  }
  console.log('Template applied successfully!')
}

// Main
waitForDirectus()
const token = getAccessToken()
const exists = checkExistingTemplate(token)
if (exists)
  process.exit(0)
applyTemplate(token)
