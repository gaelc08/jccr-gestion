import * as fs from 'fs';
import * as acorn from 'acorn';

const FILE_TO_CHECK = 'public/app-modular.js';

try {
  const source: string = fs.readFileSync(FILE_TO_CHECK, 'utf8');
  acorn.parse(source, { sourceType: 'module', ecmaVersion: 'latest' });
  console.log('No syntax error');
} catch (e: unknown) {
  if (e instanceof SyntaxError && 'loc' in e) {
    const loc = (e as SyntaxError & { loc?: { line: number; column: number } }).loc;
    console.error(e.message, 'at', loc);
  } else if (e instanceof Error) {
    console.error(e.message);
  } else {
    console.error('Unknown error:', e);
  }
}
