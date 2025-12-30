import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const templatePath = path.join(__dirname, '../prisma/schema.template.prisma');
const schemaPath = path.join(__dirname, '../prisma/schema.prisma');

const provider = process.env.DATABASE_PROVIDER === 'mysql' ? 'mysql' : 'sqlite';

console.log(`[Config] Configuring Prisma for provider: ${provider}`);

try {
  let schemaContent = fs.readFileSync(templatePath, 'utf-8');
  schemaContent = schemaContent.replace('{{DATABASE_PROVIDER}}', provider);

  fs.writeFileSync(schemaPath, schemaContent);
  console.log(`[Config] Generated prisma/schema.prisma`);
} catch (error) {
  console.error('[Config] Error generating schema:', error);
  process.exit(1);
}
