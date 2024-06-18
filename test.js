const opentype = require('opentype.js');
const bmfont = require('bmfont');
const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

const inputOtfPath = path.join(__dirname, 'Font_Noot.otf');

// Load the OTF font
opentype.load(inputOtfPath, (err, font) => {
    if (err) {
        console.error('Error loading font:', err);
        return;
    }

    // Convert OTF to TTF
    const ttfData = font.toArrayBuffer();
    const ttfPath = path.join(__dirname, 'Font_Noot.ttf');
    fs.writeFileSync(ttfPath, Buffer.from(ttfData));
    console.log(`Converted ${inputOtfPath} to ${ttfPath}`);

    // Generate bitmap font using bmfont CLI tool
    const outputDir = __dirname;
    const bmfontCommand = `bmfont ${ttfPath} -o ${outputDir} -t 32`;
    execSync(bmfontCommand, { stdio: 'inherit' });

    // Convert .fnt to .json using bmfont2json
    const fntPath = path.join(outputDir, 'Font_Noot.fnt');
    const jsonPath = path.join(outputDir, 'Font_Noot.json');
    const bmfont2jsonCommand = `bmfont2json ${fntPath} -o ${jsonPath}`;
    execSync(bmfont2jsonCommand, { stdio: 'inherit' });

    console.log('Bitmap font generated successfully.');
});
