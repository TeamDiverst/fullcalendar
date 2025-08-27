#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import {execSync} from 'child_process'
import {fileURLToPath} from 'url'

const HELP_TEXT = `
Script to update the version of Fullcalendar packages

It takes a version as an argument and:
1. Updates version field in root package.json and all packages/[name]/package.json
2. Updates all @teamdiverst/fullcalendar-dependencies to the new version
3. Creates a git commit for the version update
4. Creates git tag "v<version>"

Usage:
 scripts/update-version.js <version>
 or
 npm run update-version <version>

Note: After updating the version, remember to run 'npm install' to install
the updated dependencies and update the lock file with the new version.
`

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function findProjectRoot() {
  let currentDir = __dirname
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json')) &&
      fs.existsSync(path.join(currentDir, 'packages'))) {
      return currentDir
    }
    currentDir = path.dirname(currentDir)
  }
  throw new Error(
    'Could not find project root (looking for package.json and packages/ directory)')
}

function updatePackageJsonFile(filePath, packageName, version) {
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  // Update the version property
  json.version = version

  // Update all @teamdiverst dependencies to same version (use exact version)
  const depTypes = ['dependencies', 'devDependencies', 'peerDependencies']
  depTypes.forEach(depType => {
    if (json[depType]) {
      Object.keys(json[depType]).forEach(dep => {
        if (dep.startsWith('@teamdiverst/fullcalendar-')) {
          json[depType][dep] = `~${version}`
        }
      })
    }
  })

  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n')
  console.log(`Updated package ${packageName}`)
}

function main() {
  const args = process.argv.slice(2)
  const version = args[0]

  if (args.includes('-h') || args.includes('--help')) {
    console.log(HELP_TEXT)
    process.exit()
  }

  if (!version) {
    console.error('Error: No version provided')
    console.error(HELP_TEXT)
    process.exit(1)
  }

  if (!/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*))?$/.test(
    version)) {
    console.error(`Error: Invalid SemVer format "${version}"`)
    console.error('Expected format: X.Y.Z-pre-release.build')
    console.error('Examples: 6.1.19, 6.1.19-alpha, 6.1.19-a11y.1')
    process.exit(1)
  }

  try {
    const projectRoot = findProjectRoot()
    let oldVersion = null
    const tag = `v${version}`

    // Check if there are uncommitted changes
    if (execSync('git status --porcelain', {encoding: 'utf8'}).trim()) {
      console.error('Error: There are uncommitted changes in the repository')
      console.error('Please commit or stash your changes before running this script')
      process.exit(1)
    }

    // Check if a git tag for the new version already exists
    if (execSync(`git tag -l ${tag}`, {encoding: 'utf8'}).trim()) {
      console.error(`Error: Git tag "${tag}" already exists`)
      process.exit(1)
    }

    // Update root package.json
    const rootPackageFile = path.join(projectRoot, 'package.json')
    if (fs.existsSync(rootPackageFile)) {
      const rootData = JSON.parse(fs.readFileSync(rootPackageFile, 'utf8'))
      oldVersion = rootData.version
      rootData.version = version
      fs.writeFileSync(rootPackageFile,
        JSON.stringify(rootData, null, 2) + '\n')
      console.log(`Updated root package.json to ${version}`)
    }

    // Find packages
    const packagesDir = path.join(projectRoot, 'packages')
    const packages = fs.readdirSync(packagesDir).filter(dir =>
      fs.statSync(path.join(packagesDir, dir)).isDirectory(),
    ).map(pkg => ({name: pkg, dir: path.join(packagesDir, pkg)}))
    // Also include the bundle pacakge
    packages.push({name: 'bundle', dir: path.join(projectRoot, 'bundle')})

    // Update package.json files
    packages.forEach(({name, dir}) => {
      const packageFile = path.join(dir, 'package.json')
      if (fs.existsSync(packageFile)) {
        updatePackageJsonFile(packageFile, name, version)
      }
    })

    execSync('git add package.json packages/*/package.json bundle/package.json',
      {stdio: 'inherit'})
    execSync(`git commit -m "Updated version from ${oldVersion} to ${version}"`,
      {stdio: 'inherit'})
    console.log('Committed changes on affected files')

    execSync(`git tag ${tag}`, {stdio: 'inherit'})
    console.log(`Created git tag ${tag}`)

    console.log(`\nSuccessfully updated all packages from ${oldVersion} to ${version}`)
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

main()
