import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';

// Read version from BINARYEN_VERSION file
const BINARYEN_VERSION = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'BINARYEN_VERSION'),
  'utf8'
).trim();

// Detect platform for prebuilt binaries
function detectPlatform() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'linux' && arch === 'x64') {
    return 'x86_64-linux';
  } else if (platform === 'darwin' && arch === 'x64') {
    return 'x86_64-macos';
  } else if (platform === 'darwin' && arch === 'arm64') {
    return 'arm64-macos';
  } else if (platform === 'win32' && arch === 'x64') {
    return 'x86_64-windows';
  } else {
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
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
console.log('');

// Step 1: Download prebuilt binaries
console.log('Step 1: Downloading prebuilt binaries...');
console.log(`URL: ${PREBUILT_URL}`);
downloadFile(PREBUILT_URL, PREBUILT_ARCHIVE, () => {
  console.log('✓ Prebuilt binaries downloaded');
  console.log('');

  // Step 2: Download source code (for C++ headers)
  console.log('Step 2: Downloading source code for headers...');
  console.log(`URL: ${SOURCE_URL}`);
  downloadFile(SOURCE_URL, SOURCE_ARCHIVE, () => {
    console.log('✓ Source code downloaded');
    console.log('');

    extractAndCombine();
  });
});

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

function extractAndCombine() {
  console.log('Step 3: Extracting and combining...');

  // Create directories
  if (!fs.existsSync(THIRD_PARTY_DIR)) {
    fs.mkdirSync(THIRD_PARTY_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Remove existing binaryen directory if it exists
  if (fs.existsSync(BINARYEN_DIR)) {
    fs.rmSync(BINARYEN_DIR, { recursive: true, force: true });
  }

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
  } catch (err) {
    console.error('Extraction/combination failed:', err.message);
    console.error('Make sure tar is available on your system.');
    process.exit(1);
  }
}
