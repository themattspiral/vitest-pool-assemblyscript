import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';

// Read version from BINARYEN_VERSION file
const BINARYEN_VERSION = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'BINARYEN_VERSION'),
  'utf8'
).trim();

const IS_MACOS = process.platform === 'darwin';

// Detect platform for prebuilt binaries (non-macOS only)
function detectPlatform() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'linux' && arch === 'x64') {
    return 'x86_64-linux';
  } else if (platform === 'linux' && arch === 'arm64') {
    return 'aarch64-linux';
  } else if (platform === 'darwin' && arch === 'x64') {
    return 'x86_64-macos';
  } else if (platform === 'darwin' && arch === 'arm64') {
    return 'arm64-macos';
  } else if (platform === 'win32' && arch === 'x64') {
    return 'x86_64-windows';
  } else if (platform === 'win32' && arch === 'arm64') {
    return 'arm64-windows';
  } else {
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
  }
}

// Map Node.js arch to CMake OSX architecture identifier
function getCmakeOsxArch() {
  if (process.arch === 'arm64') return 'arm64';
  if (process.arch === 'x64') return 'x86_64';
  throw new Error(`Unsupported macOS architecture: ${process.arch}`);
}

// Check if a command is available on PATH
function isCommandAvailable(command) {
  try {
    execSync(`which ${command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const PLATFORM = detectPlatform();
const PREBUILT_URL = `https://github.com/WebAssembly/binaryen/releases/download/${BINARYEN_VERSION}/binaryen-${BINARYEN_VERSION}-${PLATFORM}.tar.gz`;
const SOURCE_URL = `https://github.com/WebAssembly/binaryen/archive/refs/tags/${BINARYEN_VERSION}.tar.gz`;
const PREBUILT_ARCHIVE = path.join(import.meta.dirname, '..', 'binaryen-prebuilt.tar.gz');
const SOURCE_ARCHIVE = path.join(import.meta.dirname, '..', 'binaryen-source.tar.gz');
const THIRD_PARTY_DIR = path.join(import.meta.dirname, '..', 'third_party');
const BINARYEN_DIR = path.join(THIRD_PARTY_DIR, 'binaryen');
const TEMP_DIR = path.join(THIRD_PARTY_DIR, 'binaryen-temp');

console.log(`Setting up Binaryen ${BINARYEN_VERSION}...`);
console.log(`Platform: ${PLATFORM}`);

if (IS_MACOS) {
  console.log('macOS detected: will build static library from source');
}

console.log('');

if (IS_MACOS) {
  // macOS: Build Binaryen from source to produce libbinaryen.a
  // The official macOS prebuilt release only ships libbinaryen.dylib (shared),
  // which cannot be statically linked into our .node addon. Building from source
  // with BUILD_STATIC_LIB=ON produces the .a file our binding.gyp expects.
  setupMacOS();
} else {
  // Linux/Windows: Download prebuilt static library + source headers
  setupWithPrebuilt();
}

// ---------------------------------------------------------------------------
// macOS: build from source
// ---------------------------------------------------------------------------

function setupMacOS() {
  if (!isCommandAvailable('cmake')) {
    console.error('Error: cmake is required to build Binaryen on macOS but was not found.');
    console.error('Install it with: brew install cmake');
    process.exit(1);
  }

  console.log('Step 1: Downloading source code...');
  console.log(`URL: ${SOURCE_URL}`);
  downloadFile(SOURCE_URL, SOURCE_ARCHIVE, () => {
    console.log('✓ Source code downloaded');
    console.log('');
    extractAndBuildFromSource();
  });
}

function extractAndBuildFromSource() {
  console.log('Step 2: Extracting source code...');

  ensureCleanDirs();

  try {
    execSync(`tar -xzf "${SOURCE_ARCHIVE}" -C "${TEMP_DIR}"`, { stdio: 'pipe' });
    const sourceDir = path.join(TEMP_DIR, `binaryen-${BINARYEN_VERSION}`);

    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Expected source directory not found: ${sourceDir}`);
    }

    console.log('✓ Source code extracted');
    console.log('');

    // Build static library with cmake
    console.log('Step 3: Building static library with cmake...');

    const buildDir = path.join(sourceDir, 'build');
    const osxArch = getCmakeOsxArch();
    const cpuCount = os.cpus().length;
    const useNinja = isCommandAvailable('ninja');
    const generatorArgs = useNinja ? ['-G', 'Ninja'] : [];

    console.log(`  Architecture: ${osxArch}`);
    console.log(`  Generator: ${useNinja ? 'Ninja' : 'Unix Makefiles (default)'}`);
    console.log(`  Parallel jobs: ${cpuCount}`);
    console.log('');

    // Configure
    console.log('  Configuring...');
    const configureArgs = [
      'cmake',
      '-S', sourceDir,
      '-B', buildDir,
      ...generatorArgs,
      '-DCMAKE_BUILD_TYPE=Release',
      '-DBUILD_STATIC_LIB=ON',
      `-DCMAKE_OSX_ARCHITECTURES=${osxArch}`,
    ];
    execSync(configureArgs.join(' '), { stdio: 'pipe' });
    console.log('  ✓ Configure complete');

    // Build (only the binaryen library target, not CLI tools)
    console.log('  Building (this may take several minutes)...');
    execSync(`cmake --build "${buildDir}" --target binaryen -j${cpuCount}`, { stdio: 'pipe' });
    console.log('  ✓ Build complete');
    console.log('');

    // Assemble third_party/binaryen/ with lib/ and src/
    console.log('Step 4: Installing to third_party/binaryen/...');

    fs.mkdirSync(BINARYEN_DIR, { recursive: true });

    // Copy static library
    const builtLib = path.join(buildDir, 'lib', 'libbinaryen.a');
    if (!fs.existsSync(builtLib)) {
      throw new Error(`Built static library not found at ${builtLib}`);
    }
    const destLibDir = path.join(BINARYEN_DIR, 'lib');
    fs.mkdirSync(destLibDir, { recursive: true });
    fs.cpSync(builtLib, path.join(destLibDir, 'libbinaryen.a'));
    console.log('  ✓ Copied libbinaryen.a');

    // Copy C++ headers from source
    const sourceSrcDir = path.join(sourceDir, 'src');
    const destSrcDir = path.join(BINARYEN_DIR, 'src');
    if (fs.existsSync(sourceSrcDir)) {
      fs.cpSync(sourceSrcDir, destSrcDir, { recursive: true });
      console.log('  ✓ Copied C++ headers');
    } else {
      throw new Error('Source src/ directory not found');
    }

    // Clean up
    console.log('  Cleaning up...');
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.unlinkSync(SOURCE_ARCHIVE);

    printResult();
  } catch (err) {
    console.error('macOS source build failed:', err.message);
    console.error('Ensure cmake is installed: brew install cmake');
    console.error('For faster builds, also install ninja: brew install ninja');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Linux/Windows: download prebuilt static library + source headers
// ---------------------------------------------------------------------------

function setupWithPrebuilt() {
  console.log('Step 1: Downloading prebuilt binaries...');
  console.log(`URL: ${PREBUILT_URL}`);
  downloadFile(PREBUILT_URL, PREBUILT_ARCHIVE, () => {
    console.log('✓ Prebuilt binaries downloaded');
    console.log('');

    console.log('Step 2: Downloading source code for headers...');
    console.log(`URL: ${SOURCE_URL}`);
    downloadFile(SOURCE_URL, SOURCE_ARCHIVE, () => {
      console.log('✓ Source code downloaded');
      console.log('');

      extractAndCombine();
    });
  });
}

function extractAndCombine() {
  console.log('Step 3: Extracting and combining...');

  ensureCleanDirs();

  try {
    // Extract prebuilt binaries
    console.log('  Extracting prebuilt binaries...');
    execSync(`tar -xzf "${PREBUILT_ARCHIVE}" -C "${THIRD_PARTY_DIR}"`, { stdio: 'pipe' });
    const prebuiltDir = path.join(THIRD_PARTY_DIR, `binaryen-${BINARYEN_VERSION}`);
    fs.renameSync(prebuiltDir, BINARYEN_DIR);

    // Extract source code to temp
    console.log('  Extracting source code...');
    execSync(`tar -xzf "${SOURCE_ARCHIVE}" -C "${TEMP_DIR}"`, { stdio: 'pipe' });
    const sourceDir = path.join(TEMP_DIR, `binaryen-${BINARYEN_VERSION}`);

    // Copy src/ directory from source to our binaryen dir (for C++ headers)
    console.log('  Copying C++ headers from source...');
    const sourceSrcDir = path.join(sourceDir, 'src');
    const destSrcDir = path.join(BINARYEN_DIR, 'src');

    if (fs.existsSync(sourceSrcDir)) {
      fs.cpSync(sourceSrcDir, destSrcDir, { recursive: true });
    } else {
      throw new Error('Source src/ directory not found');
    }

    // Clean up
    console.log('  Cleaning up...');
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.unlinkSync(PREBUILT_ARCHIVE);
    fs.unlinkSync(SOURCE_ARCHIVE);

    printResult();
  } catch (err) {
    console.error('Extraction/combination failed:', err.message);
    console.error('Make sure tar is available on your system.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function ensureCleanDirs() {
  if (!fs.existsSync(THIRD_PARTY_DIR)) {
    fs.mkdirSync(THIRD_PARTY_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  if (fs.existsSync(BINARYEN_DIR)) {
    fs.rmSync(BINARYEN_DIR, { recursive: true, force: true });
  }
}

function printResult() {
  console.log('');
  console.log(`✓ Binaryen ${BINARYEN_VERSION} installed to third_party/binaryen`);
  console.log('');
  console.log('Contents:');
  const contents = fs.readdirSync(BINARYEN_DIR);
  console.log(contents.map(f => `  ${f}`).join('\n'));

  const libDir = path.join(BINARYEN_DIR, 'lib');
  if (fs.existsSync(libDir)) {
    console.log('');
    console.log('Library files:');
    const libFiles = fs.readdirSync(libDir);
    console.log(libFiles.map(f => `  ${f}`).join('\n'));
  }

  console.log('');
  console.log('Setup complete!');
}

function downloadFile(url, dest, callback) {
  const file = fs.createWriteStream(dest);

  const handleResponse = (response) => {
    response.pipe(file);
    file.on('finish', () => {
      file.close(() => {
        response.destroy();
        callback();
      });
    });
    file.on('error', (err) => {
      response.destroy();
      if (fs.existsSync(dest)) {
        fs.unlinkSync(dest);
      }
      console.error(`File write failed: ${err.message}`);
      process.exit(1);
    });
  };

  const request = https.get(url, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
      // Follow redirect
      response.destroy();
      const redirectRequest = https.get(response.headers.location, handleResponse);
      redirectRequest.on('error', (err) => {
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
        }
        console.error(`Download failed: ${err.message}`);
        process.exit(1);
      });
    } else {
      handleResponse(response);
    }
  });

  request.on('error', (err) => {
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
    }
    console.error(`Download failed: ${err.message}`);
    process.exit(1);
  });
}
