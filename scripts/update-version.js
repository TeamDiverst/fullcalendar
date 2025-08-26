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
  throw new Error('Could not find project root (looking for package.json and packages/ directory)')
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

  if (!/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*))?$/.test(version)) {
    console.error(`Error: Invalid SemVer format "${version}"`)
    console.error('Expected format: X.Y.Z-pre-release.build')
    console.error('Examples: 6.1.19, 6.1.19-alpha, 6.1.19-a11y.1')
    process.exit(1)
  }

  try {
    const projectRoot = findProjectRoot()
    let oldVersion = null

    // Update root package.json
    const rootPackageFile = path.join(projectRoot, 'package.json')
    if (fs.existsSync(rootPackageFile)) {
      const rootData = JSON.parse(fs.readFileSync(rootPackageFile, 'utf8'))
      oldVersion = rootData.version
      rootData.version = version
      fs.writeFileSync(rootPackageFile, JSON.stringify(rootData, null, 2) + '\n')
      console.log(`Updated root package.json to ${version}`)
    }

    // Find Fullcalendar packages
    const packagesDir = path.join(projectRoot, 'packages')
    const packages = fs.readdirSync(packagesDir).filter(dir =>
      fs.statSync(path.join(packagesDir, dir)).isDirectory(),
    )

    // Update package.json files on all packages
    packages.forEach(pkg => {
      const packageFile = path.join(packagesDir, pkg, 'package.json')
      if (fs.existsSync(packageFile)) {
        const json = JSON.parse(fs.readFileSync(packageFile, 'utf8'))

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

        fs.writeFileSync(packageFile, JSON.stringify(json, null, 2) + '\n')
        console.log(`Updated package ${pkg}`)
      }
    })

    execSync('git add package.json packages/*/package.json', {stdio: 'inherit'})
    execSync(`git commit -m "Updated version from ${oldVersion} to ${version}"`, {stdio: 'inherit'})
    console.log('Committed changes on affected files')

    const tag = `v${version}`
    execSync(`git tag ${tag}`, {stdio: 'inherit'})
    console.log(`Created git tag ${tag}`)

    console.log(`\nSuccessfully updated all packages from ${oldVersion} to ${version}`)
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

main()
