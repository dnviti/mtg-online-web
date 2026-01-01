import { MinimalScryfallCard, MinimalCardFace } from '../types';

export class CardOptimization {
  static optimize(fullCard: any): MinimalScryfallCard {
    if (!fullCard) return fullCard;

    // Helper to safely extract image URIs
    const extractImages = (uris: any) => {
      if (!uris) return undefined;
      return {
        normal: uris.normal,
        art_crop: uris.art_crop
      };
    };

    // Helper for faces
    const optimizeFace = (face: any): MinimalCardFace => ({
      name: face.name,
      mana_cost: face.mana_cost,
      type_line: face.type_line,
      oracle_text: face.oracle_text,
      colors: face.colors,
      power: face.power,
      toughness: face.toughness,
      defense: face.defense,
      image_uris: extractImages(face.image_uris)
    });

    const optimized: MinimalScryfallCard = {
      id: fullCard.id,
      name: fullCard.name,
      set: fullCard.set,
      type_line: fullCard.type_line,
      mana_cost: fullCard.mana_cost,
      oracle_text: fullCard.oracle_text,
      colors: fullCard.colors,
      power: fullCard.power,
      toughness: fullCard.toughness,
      defense: fullCard.defense,
      keywords: fullCard.keywords,
      layout: fullCard.layout,
      image_uris: extractImages(fullCard.image_uris),
      // Preserve pre-parsed types if they exist, or let ActionHandler parse them later
      // But for optimization, let's just keep the raw strings mostly.
      // Actually, ActionHandler expects 'types' and 'subtypes' on the card object, 
      // often derived from definition. Let's populate them if missing to save runtime parsing?
      // No, let's keep it minimal.
    };

    if (fullCard.card_faces) {
      optimized.card_faces = fullCard.card_faces.map(optimizeFace);
    }

    return optimized;
  }
}
