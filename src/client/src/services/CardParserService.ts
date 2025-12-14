export interface CardIdentifier {
  type: 'id' | 'name';
  value: string;
  quantity: number;
}

export class CardParserService {
  parse(text: string): CardIdentifier[] {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const rawCardList: CardIdentifier[] = [];
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    lines.forEach(line => {
      if (line.toLowerCase().startsWith('quantity') || line.toLowerCase().startsWith('count,name')) return;

      const idMatch = line.match(uuidRegex);
      const cleanLineForQty = line.replace(/['"]/g, '');
      const quantityMatch = cleanLineForQty.match(/^(\d+)[xX\s,;]/);
      const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;

      let identifier: { type: 'id' | 'name', value: string } | null = null;

      if (idMatch) {
        identifier = { type: 'id', value: idMatch[0] };
      } else {
        const cleanLine = line.replace(/['"]/g, '');
        // Remove leading quantity
        let name = cleanLine.replace(/^(\d+)[xX\s,;]+/, '').trim();

        // Remove set codes in parentheses/brackets e.g. (M20), [STA]
        // This regex looks for ( starts, anything inside, ) ends, or same for []
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
        // Return one entry per quantity? Or aggregated?
        // The original code pushed multiple entries to an array.
        // For a parser service, returning the count is better, but to match logic:
        // "for (let i = 0; i < quantity; i++) rawCardList.push(identifier);"
        // I will return one object with Quantity property to be efficient.

        rawCardList.push({
          type: identifier.type,
          value: identifier.value,
          quantity: quantity
        });
      }
    });

    if (rawCardList.length === 0) throw new Error("No valid cards found.");
    return rawCardList;
  }
}
