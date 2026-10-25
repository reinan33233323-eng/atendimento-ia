import { writeFile } from 'node:fs/promises';
// Read the secret without terminal echo and never print it or send it to the browser.
process.stdout.write('Cole a chave da OpenAI (entrada oculta) e pressione Enter: ');
if (!process.stdin.isTTY) throw new Error('Execute em um terminal interativo.');
process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
let secret = '';
process.stdin.on('data', async chunk => {
  for (const char of chunk) {
    if (char === '\u0003') { process.stdin.setRawMode(false); process.exit(130); }
    if (char === '\r' || char === '\n') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      secret = secret.trim();
      if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(secret)) { console.error('\nFormato de chave inválido.'); process.exit(1); }
      await writeFile(new URL('../.env', import.meta.url), `OPENAI_API_KEY=${secret}\nOPENAI_MODEL=gpt-6-luna\n`, { mode: 0o600 });
      secret = '';
      console.log('\nChave configurada no servidor local.');
      process.exit(0);
    } else if (char === '\u007f') secret = secret.slice(0, -1);
    else secret += char;
  }
});
