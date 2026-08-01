/**
 * Generate favicons + PWA/platform icons from the eArena "E" logo.
 * - Favicons / any-purpose: transparent (no background)
 * - Splash / Apple / maskable tiles: white background
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'public/icons/ios/1024.png');
const OUT = path.join(ROOT, 'public/icons');
const APP_DIR = path.join(ROOT, 'src/app');

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function removeNearBlackBackground(inputPath, threshold = 28) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Pure/near-black canvas only — keep dark navy bevels on the logo
    if (r <= threshold && g <= threshold && b <= threshold) {
      data[i + 3] = 0;
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png();
}

async function writePng(pipeline, filePath, size, { background, fitPadding = 0.82 } = {}) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  let img = pipeline.clone();
  if (background) {
    // Fit logo inside canvas with padding, then flatten onto solid bg
    const inner = Math.round(size * fitPadding);
    const buffer = await img
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background,
      },
    })
      .composite([{ input: buffer, gravity: 'centre' }])
      .png()
      .toFile(filePath);
    return;
  }

  await img
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(filePath);
}

async function writeSplash(pipeline, filePath, width, height) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const logoSize = Math.round(Math.min(width, height) * 0.55);
  const logoBuf = await pipeline
    .clone()
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: WHITE,
    },
  })
    .composite([{ input: logoBuf, gravity: 'centre' }])
    .png()
    .toFile(filePath);
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Source icon missing: ${SOURCE}`);
  }

  console.log('Removing black background from', SOURCE);
  const transparentMaster = await removeNearBlackBackground(SOURCE);
  const masterBuf = await transparentMaster.png().toBuffer();
  const master = () => sharp(masterBuf);

  // Master assets
  await master().png().toFile(path.join(OUT, 'icon-transparent.png'));
  await writePng(master(), path.join(OUT, 'icon-white-bg.png'), 1024, {
    background: WHITE,
    fitPadding: 0.78,
  });

  // Favicons (transparent)
  const favSizes = [16, 32, 48];
  for (const size of favSizes) {
    await writePng(master(), path.join(OUT, `favicon-${size}x${size}.png`), size);
  }

  // Multi-size ICO via PNG pack (browsers accept PNG favicons; also write app/icon.png)
  await writePng(master(), path.join(APP_DIR, 'icon.png'), 32);
  await writePng(master(), path.join(APP_DIR, 'apple-icon.png'), 180, {
    background: WHITE,
    fitPadding: 0.8,
  });

  // Copy transparent favicon into public root for legacy links
  await writePng(master(), path.join(ROOT, 'public/favicon.ico.png'), 32);
  await writePng(master(), path.join(ROOT, 'public/favicon-32x32.png'), 32);
  await writePng(master(), path.join(ROOT, 'public/favicon-16x16.png'), 16);

  // Android launcher — white splash-style bg (replaces black)
  const android = [
    [48, 'android-launchericon-48-48.png'],
    [72, 'android-launchericon-72-72.png'],
    [96, 'android-launchericon-96-96.png'],
    [144, 'android-launchericon-144-144.png'],
    [192, 'android-launchericon-192-192.png'],
    [512, 'android-launchericon-512-512.png'],
  ];
  for (const [size, name] of android) {
    await writePng(master(), path.join(OUT, 'android', name), size, {
      background: WHITE,
      fitPadding: 0.78,
    });
  }

  // Maskable (more padding) — white
  await writePng(master(), path.join(OUT, 'android/maskable-192.png'), 192, {
    background: WHITE,
    fitPadding: 0.62,
  });
  await writePng(master(), path.join(OUT, 'android/maskable-512.png'), 512, {
    background: WHITE,
    fitPadding: 0.62,
  });

  // Any-purpose transparent PWA icons
  await writePng(master(), path.join(OUT, 'android/any-192.png'), 192);
  await writePng(master(), path.join(OUT, 'android/any-512.png'), 512);

  // iOS sizes — Apple requires opaque; use white
  const iosSizes = [
    16, 20, 29, 32, 40, 50, 57, 58, 60, 64, 72, 76, 80, 87, 100, 114, 120, 128, 144, 152, 167, 180, 192, 256, 512, 1024,
  ];
  for (const size of iosSizes) {
    await writePng(master(), path.join(OUT, 'ios', `${size}.png`), size, {
      background: WHITE,
      fitPadding: 0.8,
    });
  }

  // Windows tiles — white bg
  const winTiles = [
    ['SmallTile.scale-100.png', 71],
    ['SmallTile.scale-125.png', 89],
    ['SmallTile.scale-150.png', 107],
    ['SmallTile.scale-200.png', 142],
    ['SmallTile.scale-400.png', 284],
    ['Square150x150Logo.scale-100.png', 150],
    ['Square150x150Logo.scale-125.png', 188],
    ['Square150x150Logo.scale-150.png', 225],
    ['Square150x150Logo.scale-200.png', 300],
    ['Square150x150Logo.scale-400.png', 600],
    ['LargeTile.scale-100.png', 310],
    ['LargeTile.scale-125.png', 388],
    ['LargeTile.scale-150.png', 465],
    ['LargeTile.scale-200.png', 620],
    ['LargeTile.scale-400.png', 1240],
    ['Square44x44Logo.scale-100.png', 44],
    ['Square44x44Logo.scale-125.png', 55],
    ['Square44x44Logo.scale-150.png', 66],
    ['Square44x44Logo.scale-200.png', 88],
    ['Square44x44Logo.scale-400.png', 176],
    ['StoreLogo.scale-100.png', 50],
    ['StoreLogo.scale-125.png', 63],
    ['StoreLogo.scale-150.png', 75],
    ['StoreLogo.scale-200.png', 100],
    ['StoreLogo.scale-400.png', 200],
  ];
  for (const [name, size] of winTiles) {
    await writePng(master(), path.join(OUT, 'windows11', name), size, {
      background: WHITE,
      fitPadding: 0.78,
    });
  }

  const targetSizes = [16, 20, 24, 30, 32, 36, 40, 44, 48, 60, 64, 72, 80, 96, 256];
  for (const size of targetSizes) {
    for (const prefix of [
      'Square44x44Logo.targetsize',
      'Square44x44Logo.altform-unplated_targetsize',
      'Square44x44Logo.altform-lightunplated_targetsize',
    ]) {
      const bg = prefix.includes('unplated') ? undefined : WHITE;
      await writePng(
        master(),
        path.join(OUT, 'windows11', `${prefix}-${size}.png`),
        size,
        bg ? { background: WHITE, fitPadding: 0.78 } : undefined
      );
    }
  }

  // Wide + splash — white
  const wides = [
    ['Wide310x150Logo.scale-100.png', 310, 150],
    ['Wide310x150Logo.scale-125.png', 388, 188],
    ['Wide310x150Logo.scale-150.png', 465, 225],
    ['Wide310x150Logo.scale-200.png', 620, 300],
    ['Wide310x150Logo.scale-400.png', 1240, 600],
    ['SplashScreen.scale-100.png', 620, 300],
    ['SplashScreen.scale-125.png', 775, 375],
    ['SplashScreen.scale-150.png', 930, 450],
    ['SplashScreen.scale-200.png', 1240, 600],
    ['SplashScreen.scale-400.png', 2480, 1200],
  ];
  for (const [name, w, h] of wides) {
    await writeSplash(master(), path.join(OUT, 'windows11', name), w, h);
  }

  // Shared roots
  await writePng(master(), path.join(OUT, 'icon.png'), 512, {
    background: WHITE,
    fitPadding: 0.78,
  });
  await writePng(master(), path.join(OUT, 'icon-512x512.png'), 512, {
    background: WHITE,
    fitPadding: 0.78,
  });
  await writePng(master(), path.join(OUT, 'icon2.png'), 512); // transparent copy

  // images/icons path referenced in layout
  const imagesIcons = path.join(ROOT, 'public/images/icons');
  await fs.promises.mkdir(imagesIcons, { recursive: true });
  await writePng(master(), path.join(imagesIcons, 'icon-512x512.png'), 512, {
    background: WHITE,
    fitPadding: 0.78,
  });

  // Proper .ico (multi-res) using sharp pngs packed — write PNG as favicon.ico fallback not ideal;
  // generate real ICO with 16+32 via toFormat if available. Sharp doesn't write ICO natively —
  // use 32png named favicon.ico is wrong. Prefer public/favicon.ico as PNG renamed is bad.
  // Copy 32 transparent to public/favicon.ico won't work in all browsers.
  // Use png-to-ico if available, else write SVG + PNG links in metadata.
  try {
    const pngToIcoMod = require('png-to-ico');
    const pngToIco = pngToIcoMod.default || pngToIcoMod;
    const buf16 = await master().resize(16, 16).png().toBuffer();
    const buf32 = await master().resize(32, 32).png().toBuffer();
    const buf48 = await master().resize(48, 48).png().toBuffer();
    const ico = await pngToIco([buf16, buf32, buf48]);
    await fs.promises.writeFile(path.join(ROOT, 'public/favicon.ico'), ico);
    await fs.promises.writeFile(path.join(APP_DIR, 'favicon.ico'), ico);
    console.log('Wrote favicon.ico');
  } catch (err) {
    console.log('png-to-ico failed — using PNG favicons only:', err.message);
  }

  console.log('Icon generation complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
