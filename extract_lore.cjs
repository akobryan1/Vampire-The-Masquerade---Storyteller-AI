const fs = require('fs');
const pdf = require('pdf-parse');

const dataBuffer = fs.readFileSync('resources/pdfcoffee.com_v20-lore-of-the-clans--5-pdf-free.pdf');

pdf(dataBuffer).then(function(data) {
    fs.writeFileSync('lore_of_the_clans.txt', data.text, 'utf8');
    console.log('Extraction succeeded');
    console.log('Output file path: e:\\VTM CHAT BOT\\lore_of_the_clans.txt');
}).catch(err => {
    console.error(err);
    process.exit(1);
});
