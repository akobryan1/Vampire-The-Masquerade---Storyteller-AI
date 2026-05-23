import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';

const dataBuffer = fs.readFileSync('resources/Vampire The Masquerade - 20th Anniversary Edition.pdf');

const parser = new PDFParse({ data: dataBuffer });

parser
	.getText()
	.then((data) => {
		fs.writeFileSync('extracted_text.txt', data.text, 'utf8');
		console.log(`Length: ${data.text.length}`);
		return parser.destroy();
	})
	.catch(async (error) => {
		console.error(error);
		await parser.destroy().catch(() => {});
		process.exitCode = 1;
	});
