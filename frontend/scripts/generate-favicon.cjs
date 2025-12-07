const sharp = require('sharp');

async function run() {
  await sharp('public/npalogo.svg')
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile('public/npalogo-512.png');

  await sharp('public/npalogo-512.png')
    .resize(256, 256)
    .png()
    .toFile('public/npalogo-256.png');

  await sharp('public/npalogo-512.png')
    .resize(128, 128)
    .png()
    .toFile('public/npalogo-128.png');

  await sharp('public/npalogo-512.png')
    .resize(64, 64)
    .png()
    .toFile('public/npalogo-64.png');

  await sharp('public/npalogo-512.png')
    .resize(32, 32)
    .png()
    .toFile('public/npalogo-32.png');

  await sharp('public/npalogo-512.png')
    .resize(16, 16)
    .png()
    .toFile('public/npalogo-16.png');

  await sharp([
    'public/npalogo-16.png',
    'public/npalogo-32.png',
    'public/npalogo-64.png',
    'public/npalogo-128.png',
    'public/npalogo-256.png',
    'public/npalogo-512.png',
  ])
    .toFile('public/favicon.ico');

  console.log('Favicon and PNGs generated.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
