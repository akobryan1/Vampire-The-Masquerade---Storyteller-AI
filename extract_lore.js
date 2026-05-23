import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';

const dataBuffer = fs.readFileSync('resources/pdfcoffee.com_v20-lore-of-the-clans--5-pdf-free.pdf');

const parser = new PDFParse({ data: dataBuffer });

parser
        .getText()
        .then((data) => {
                fs.writeFileSync('lore_of_the_clans.txt', data.text, 'utf8');
                console.log('Extraction succeeded');
                console.log('Output file path: e:\\VTM CHAT BOT\\lore_of_the_clans.txt');
                return parser.destroy();
        })
        .catch(async (error) => {
                console.error(error);
                await parser.destroy().catch(() => {});
                process.exitCode = 1;
        });
