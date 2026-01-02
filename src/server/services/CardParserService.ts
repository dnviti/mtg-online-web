
export interface CardIdentifier {
  type: 'id' | 'name';
  value: string;
  quantity: number;
  finish?: 'foil' | 'normal';
  setCode?: string;
}

export class CardParserService {
  parse(text: string): CardIdentifier[] {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const rawCardList: CardIdentifier[] = [];
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    let colMap = { qty: 0, name: 1, finish: 2, id: -1, found: false };

    // Check header to determine column indices dynamically
    if (lines.length > 0) {
      const headerLine = lines[0].toLowerCase();
      // Heuristic: if it has Quantity and Name, it's likely our CSV
      if (headerLine.includes('quantity') && headerLine.includes('name')) {
        const headers = this.parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
        const qtyIndex = headers.indexOf('quantity');
        const nameIndex = headers.indexOf('name');

        if (qtyIndex !== -1 && nameIndex !== -1) {
          colMap.qty = qtyIndex;
          colMap.name = nameIndex;
          colMap.finish = headers.indexOf('finish');
          // Find ID column: could be 'scryfall id', 'scryfall_id', 'id'
          colMap.id = headers.findIndex(h => h === 'scryfall id' || h === 'scryfall_id' || h === 'id' || h === 'uuid');
          colMap.found = true;

          // Remove header row
          lines.shift();
        }
      }
    }

    lines.forEach(line => {
      // Skip generic header repetition if it occurs
      if (line.toLowerCase().startsWith('quantity') && line.toLowerCase().includes('name')) return;

      // Try parsing as CSV line first if we detected a header or if it looks like CSV
      const parts = this.parseCsvLine(line);

      // If we have a detected map, use it strict(er)
      if (colMap.found && parts.length > Math.max(colMap.qty, colMap.name)) {
        const qty = parseInt(parts[colMap.qty]);
        if (!isNaN(qty)) {
          const name = parts[colMap.name];
          let finish: 'foil' | 'normal' | undefined = undefined;

          if (colMap.finish !== -1 && parts[colMap.finish]) {
            const finishRaw = parts[colMap.finish].toLowerCase();
            finish = (finishRaw === 'foil' || finishRaw === 'etched') ? 'foil' : (finishRaw === 'normal' ? 'normal' : undefined);
          } else if (!colMap.found) {
            const finishRaw = parts[2]?.toLowerCase();
            finish = (finishRaw === 'foil' || finishRaw === 'etched') ? 'foil' : (finishRaw === 'normal' ? 'normal' : undefined);
          }

          let idValue: string | null = null;

          // If we have an ID column, look there
          if (colMap.id !== -1 && parts[colMap.id]) {
            const match = parts[colMap.id].match(uuidRegex);
            if (match) idValue = match[0];
          }

          if (idValue) {
            rawCardList.push({ type: 'id', value: idValue, quantity: qty, finish });
            return;
          } else if (name) {
            rawCardList.push({ type: 'name', value: name, quantity: qty, finish });
            return;
          }
        }
      }

      // --- Fallback / Original Logic for non-header formats or failed parsings ---

      const idMatch = line.match(uuidRegex);
      if (idMatch) {
        // It has a UUID, try to extract generic CSV info if possible
        if (parts.length >= 2) {
          const qty = parseInt(parts[0]);
          if (!isNaN(qty)) {
            // Assuming default 0=Qty, 2=Finish if no header map found
            const finishRaw = parts[2]?.toLowerCase();
            const finish = (finishRaw === 'foil' || finishRaw === 'etched') ? 'foil' : (finishRaw === 'normal' ? 'normal' : undefined);

            // Use the regex match found
            rawCardList.push({ type: 'id', value: idMatch[0], quantity: qty, finish });
            return;
          }
        }
        // Just ID flow
        rawCardList.push({ type: 'id', value: idMatch[0], quantity: 1 });
        return;
      }

      // Name-based generic parsing (Arena/MTGO or simple CSV without ID)
      if (parts.length >= 2 && !isNaN(parseInt(parts[0]))) {
        const quantity = parseInt(parts[0]);
        const name = parts[1];
        const finishRaw = parts[2]?.toLowerCase();
        const finish = (finishRaw === 'foil' || finishRaw === 'etched') ? 'foil' : (finishRaw === 'normal' ? 'normal' : undefined);

        if (name && name.length > 0) {
          rawCardList.push({ type: 'name', value: name, quantity, finish });
          return;
        }
      }

      // "4 Lightning Bolt (set)" format
      const cleanLine = line.replace(/['"]/g, '');
      const simpleMatch = cleanLine.match(/^(\d+)[xX\s]+(.+)$/);
      if (simpleMatch) {
        let name = simpleMatch[2].trim();
        let setCode: string | undefined;

        // Extract (SET) or [SET]
        const setMatch = name.match(/[\(\[]([0-9a-zA-Z]{3,})[\)\]]/);
        if (setMatch) {
          setCode = setMatch[1].toLowerCase();
        }

        name = name.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
        name = name.replace(/\s+\d+$/, '');

        rawCardList.push({ type: 'name', value: name, quantity: parseInt(simpleMatch[1]), setCode });
      } else {
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
