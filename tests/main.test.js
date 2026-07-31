/**
 * @jest-environment node
 */

const path = require('path');
const fs = require('fs');

describe('Nexus Browser - Main Module Tests', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  
  test('main.js exists', () => {
    const mainPath = path.join(srcDir, 'main.js');
    expect(fs.existsSync(mainPath)).toBe(true);
  });

  test('preload.js exists', () => {
    const preloadPath = path.join(srcDir, 'preload.js');
    expect(fs.existsSync(preloadPath)).toBe(true);
  });

  test('site-preload.js exists', () => {
    const sitePreloadPath = path.join(srcDir, 'site-preload.js');
    expect(fs.existsSync(sitePreloadPath)).toBe(true);
  });

  test('UI files exist', () => {
    const uiDir = path.join(srcDir, 'ui');
    expect(fs.existsSync(path.join(uiDir, 'app.js'))).toBe(true);
    expect(fs.existsSync(path.join(uiDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(uiDir, 'styles.css'))).toBe(true);
  });

  test('Internal pages exist', () => {
    const internalDir = path.join(srcDir, 'internal');
    expect(fs.existsSync(path.join(internalDir, 'settings.html'))).toBe(true);
    expect(fs.existsSync(path.join(internalDir, 'profiles.html'))).toBe(true);
    expect(fs.existsSync(path.join(internalDir, 'downloads.html'))).toBe(true);
    expect(fs.existsSync(path.join(internalDir, 'history.html'))).toBe(true);
  });

  test('New tab files exist', () => {
    const newtabDir = path.join(srcDir, 'newtab');
    expect(fs.existsSync(path.join(newtabDir, 'newtab.html'))).toBe(true);
    expect(fs.existsSync(path.join(newtabDir, 'nexus-search.html'))).toBe(true);
  });

  test('Search engine exists', () => {
    const enginePath = path.join(srcDir, 'search-engine', 'engine.js');
    expect(fs.existsSync(enginePath)).toBe(true);
  });

  test('Package.json has required fields', () => {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    
    expect(pkg.name).toBeDefined();
    expect(pkg.version).toBeDefined();
    expect(pkg.main).toBeDefined();
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.start).toBeDefined();
    expect(pkg.scripts.check).toBeDefined();
  });

  test('README exists', () => {
    const readmePath = path.join(__dirname, '..', 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);
  });
});
