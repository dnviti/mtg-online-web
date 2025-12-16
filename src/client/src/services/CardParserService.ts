export interface CardIdentifier {
  type: 'id' | 'name';
  value: string;
  quantity: number;
  finish?: 'foil' | 'normal';
}

export class CardParserService {
  parse(text: string): CardIdentifier[] {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const rawCardList: CardIdentifier[] = [];
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    lines.forEach(line => {
      // Skip header
      if (line.toLowerCase().startsWith('quantity') && line.toLowerCase().includes('name')) return;

      const idMatch = line.match(uuidRegex);
      if (idMatch) {
        // Extract quantity if present before ID, otherwise default to 1
        // Simple check: Look for "Nx ID" or "N, ID" pattern? 
        // The previous/standard logic usually treats ID lines as 1x unless specified. 
        // Let's try to find a quantity at the start if it exists differently from UUID.
        // But usually UUID lines are direct from export.

        // But our CSV template puts ID at the end.
        // If UUID is present anywhere in the line, we might trust it over the name.
        // Let's stick to the previous logic: if UUID is found, use it.
        // BUT, we should try to parse the whole CSV line if possible to get Finish and Quantity.

        // Let's parse with CSV logic first.
        const parts = this.parseCsvLine(line);
        if (parts.length >= 2) {
          const qty = parseInt(parts[0]);
          // If valid CSV structure
          if (!isNaN(qty)) {
            // const name = parts[1]; // We can keep name for reference, but we use ID if present
            const finishRaw = parts[2]?.toLowerCase();
            const finish = (finishRaw === 'foil' || finishRaw === 'etched') ? 'foil' : (finishRaw === 'normal' ? 'normal' : undefined);

            // If the last part has UUID, use it.
            const uuidPart = parts.find(p => uuidRegex.test(p));
            if (uuidPart) {
              const uuid = uuidPart.match(uuidRegex)![0];
              rawCardList.push({ type: 'id', value: uuid, quantity: qty, finish });
              return;
            }
          }
        }

        // Fallback ID logic
        rawCardList.push({ type: 'id', value: idMatch[0], quantity: 1 }); // Default simple UUID match
        return;
      }

      // Not an ID match, try parsing as name
      const parts = this.parseCsvLine(line);

      if (parts.length >= 2 && !isNaN(parseInt(parts[0]))) {
        // It looks like result of our CSV: Quantity, Name, Finish, ...
        const quantity = parseInt(parts[0]);
        const name = parts[1];
        const finishRaw = parts[2]?.toLowerCase();
        const finish = (finishRaw === 'foil' || finishRaw === 'etched') ? 'foil' : (finishRaw === 'normal' ? 'normal' : undefined);

        if (name && name.length > 0) {
          rawCardList.push({ type: 'name', value: name, quantity, finish });
          return;
        }
      }

      // Fallback to simple Arena/MTGO text format: "4 Lightning Bolt"
      const cleanLine = line.replace(/['"]/g, '');
      const simpleMatch = cleanLine.match(/^(\d+)[xX\s]+(.+)$/);
      if (simpleMatch) {
        let name = simpleMatch[2].trim();
        // cleanup
        name = name.replace(/\s*[\(\[].*?[\)\]]/g, ''); // remove set codes
        name = name.replace(/\s+\d+$/, ''); // remove collector number

        rawCardList.push({ type: 'name', value: name, quantity: parseInt(simpleMatch[1]) });
      } else {
        // Maybe just "Lightning Bolt" (1x)
        let name = cleanLine.trim();
        if (name) {
          rawCardList.push({ type: 'name', value: name, quantity: 1 });
        }
      }
    });

    if (rawCardList.length === 0) throw new Error("No valid cards found.");
    return rawCardList;
  }

  private parseCsvLine(line: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        parts.push(current.trim().replace(/^"|"$/g, '')); // Parsing finished, strip outer quotes if just accumulated
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim().replace(/^"|"$/g, ''));
    return parts;
  }
}
