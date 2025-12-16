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
      const cleanLineForQty = line.replace(/['"]/g, '');
      const quantityMatch = cleanLineForQty.match(/^(\d+)[xX\s,;]/);
      const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;

      // Detect Finish from CSV (Comma Separated)
      let finish: 'foil' | 'normal' | undefined = undefined;
      const parts = line.split(',');
      if (parts.length >= 3) {
        // Assuming format: Quantity,Name,Finish,...
        // If the line started with a number, parts[0] is quantity. parts[1] is name. parts[2] is Finish.
        // We should be careful about commas in names, but the user example shows a clean structure.
        // If the name is quoted, split(',') might be naive, but valid for the provided example.
        // Let's assume the user provided format: Quantity,Name,Finish,Edition Name,Scryfall ID

        const possibleFinish = parts[2].trim().toLowerCase();
        if (possibleFinish === 'foil' || possibleFinish === 'etched') finish = 'foil';
        else if (possibleFinish === 'normal') finish = 'normal';
      }

      let identifier: { type: 'id' | 'name', value: string } | null = null;

      if (idMatch) {
        identifier = { type: 'id', value: idMatch[0] };
      } else {
        const cleanLine = line.replace(/['"]/g, '');
        // Remove leading quantity
        let name = cleanLine.replace(/^(\d+)[xX\s,;]+/, '').trim();

        // Remove set codes in parentheses/brackets e.g. (M20), [STA]
        name = name.replace(/\s*[\(\[].*?[\)\]]/g, '');

        // Remove trailing collector numbers (digits at the very end)
        name = name.replace(/\s+\d+$/, '');

        // Remove trailing punctuation
        name = name.replace(/^[,;]+|[,;]+$/g, '').trim();

        // If CSV like "Name, SetCode", take first part
        if (name.includes(',')) name = name.split(',')[0].trim();

        if (name && name.length > 1) identifier = { type: 'name', value: name };
      }

      if (identifier) {
        rawCardList.push({
          type: identifier.type,
          value: identifier.value,
          quantity: quantity,
          finish: finish
        });
      }
    });

    if (rawCardList.length === 0) throw new Error("No valid cards found.");
    return rawCardList;
  }
}
