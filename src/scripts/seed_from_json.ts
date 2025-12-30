
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const SETS_DIR = path.resolve(process.cwd(), 'server/public/cards/sets');

async function main() {
  console.log('Starting seed from JSON...');

  if (!fs.existsSync(SETS_DIR)) {
    console.error(`Sets directory not found at ${SETS_DIR}`);
    return;
  }

  const files = fs.readdirSync(SETS_DIR).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} set files.`);

  // Define useful keys for Card mapping
  // We don't restrict reading, but we only map to the schema fields.

  for (const file of files) {
    const filePath = path.join(SETS_DIR, file);
    console.log(`Processing ${file}...`);

    try {
      const rawData = fs.readFileSync(filePath, 'utf-8');
      const cards = JSON.parse(rawData);

      if (!Array.isArray(cards) || cards.length === 0) {
        console.log(`Skipping empty or invalid file ${file}`);
        continue;
      }

      // Check the first card to get set info if possible, or use the file name
      // Usually scryfall set files contain an array of card objects.
      // The set object itself might not be explicitly separate, but cards have set codes.

      const firstCard = cards[0];
      const setCode = firstCard.set; // e.g. "eoe"
      const setName = firstCard.set_name || setCode;
      const setUri = firstCard.set_uri || "";

      // Upsert Set
      if (setCode) {
        await prisma.set.upsert({
          where: { code: setCode },
          update: {
            name: setName,
            uri: setUri,
            card_count: cards.length // Approximation
          },
          create: {
            id: firstCard.set_id || setCode, // Use set_id if available, else code as ID fallback
            code: setCode,
            name: setName,
            uri: setUri,
            card_count: cards.length
          }
        });
      }

      // Upsert Cards - transactional or batch might be too big for SQLite, so we do chunked or sequential
      // SQLite handle transaction limit.

      let processed = 0;
      for (const card of cards) {
        if (card.object !== 'card') continue;

        // Pruning: Map only schema fields
        await prisma.card.upsert({
          where: { id: card.id },
          update: {
            oracle_id: card.oracle_id,
            name: card.name,
            set: card.set,
            collector_number: card.collector_number,
            rarity: card.rarity,
            mana_cost: card.mana_cost,
            cmc: card.cmc,
            type_line: card.type_line,
            oracle_text: card.oracle_text,
            colors: JSON.stringify(card.colors || []),
            color_identity: JSON.stringify(card.color_identity || []),
            image_uris: JSON.stringify(card.image_uris || {}),
            layout: card.layout,
            card_faces: JSON.stringify(card.card_faces || [])
          },
          create: {
            id: card.id,
            oracle_id: card.oracle_id,
            name: card.name,
            set: card.set,
            collector_number: card.collector_number,
            rarity: card.rarity,
            mana_cost: card.mana_cost,
            cmc: card.cmc,
            type_line: card.type_line,
            oracle_text: card.oracle_text,
            colors: JSON.stringify(card.colors || []),
            color_identity: JSON.stringify(card.color_identity || []),
            image_uris: JSON.stringify(card.image_uris || {}),
            layout: card.layout,
            card_faces: JSON.stringify(card.card_faces || [])
          }
        });
        processed++;
      }
      console.log(`Processed ${processed} cards for set ${setCode}`);

    } catch (e) {
      console.error(`Error processing file ${file}:`, e);
    }
  }

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
