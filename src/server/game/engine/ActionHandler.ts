import { StrictGameState } from '../types';
import { CardUtils } from './CardUtils';
import { ManaUtils } from './ManaUtils';
import { StateBasedEffects } from './StateBasedEffects';

/**
 * ActionHandler
 * 
 * Responsible for executing discrete player actions that change the game state.
 * This includes moving cards between zones, casting spells, playing lands,
 * and creating tokens. It ensures that priority is correctly reset after actions
 * and that appropriate validation (permissions, zones) is performed.
 */
export class ActionHandler {

  /**
   * Moves a card from one zone to another, handling all side-effects of zone transitions
   * such as clearing memory, resetting counters, and detaching auras/equipment.
   */
  static moveCardToZone(state: StrictGameState, cardId: string, toZone: any, faceDown = false, position?: { x: number, y: number }, faceIndex?: number) {
    const card = state.cards[cardId];
    if (card) {

      if (toZone === 'battlefield' && card.zone !== 'battlefield') {
        card.controlledSinceTurn = state.turnCount;
      }

      card.zone = toZone;
      card.faceDown = faceDown;
      card.tapped = false;

      if (position) {
        card.position = { ...position, z: ++state.maxZ };
      } else {
        card.position = { x: 0, y: 0, z: ++state.maxZ };
      }

      // Rule 400.7: Clear memory on zone change
      if (toZone !== 'battlefield') {
        card.attacking = undefined;
        card.blocking = [];
        card.damageMarked = 0;
        card.counters = [];
        card.modifiers = [];
        card.activeFaceIndex = undefined;
        card.isDoubleFaced = (card.definition?.card_faces?.length || 0) > 1;

        if (card.definition) {
          card.name = card.definition.name || card.name;
          card.power = parseFloat(card.definition.power || card.power || '0');
          card.toughness = parseFloat(card.definition.toughness || card.toughness || '0');
          card.basePower = card.power;
          card.baseToughness = card.toughness;
          card.types = card.definition.types || card.types;
          card.subtypes = card.definition.subtypes || card.subtypes;
          card.colors = card.definition.colors || card.colors;
          card.manaCost = card.definition.mana_cost || card.manaCost;
          card.typeLine = card.definition.type_line || card.typeLine;
          card.oracleText = card.definition.oracle_text || card.oracleText;
          card.defense = parseFloat(card.definition.defense || card.defense || '0');
          card.baseDefense = card.defense;
        }

        card.attachedTo = undefined;
        Object.values(state.cards).forEach(other => {
          if (other.attachedTo === cardId) {
            other.attachedTo = undefined;
          }
        });
      } else {
        // Entering Battlefield
        if (faceIndex !== undefined) {
          card.activeFaceIndex = faceIndex;
          const faces = card.definition?.card_faces;
          if (faces && faces[faceIndex]) {
            const face = faces[faceIndex];
            card.name = face.name;
            card.typeLine = face.type_line;
            const typeLine = face.type_line || "";
            const parts = typeLine.split('—');
            card.types = parts[0].trim().split(' ');
            card.subtypes = parts[1] ? parts[1].trim().split(' ') : [];

            card.colors = face.colors || card.definition.colors;
            card.manaCost = face.mana_cost;
            card.oracleText = face.oracle_text;

            if (face.power !== undefined) {
              card.basePower = parseFloat(face.power);
              card.power = card.basePower;
            }
            if (face.toughness !== undefined) {
              card.baseToughness = parseFloat(face.toughness);
              card.toughness = card.baseToughness;
            }
            if (face.defense !== undefined) {
              card.baseDefense = parseFloat(face.defense);
              card.defense = card.baseDefense;
            }
          }
        }
      }
    }
  }

  static playLand(state: StrictGameState, playerId: string, cardId: string, position?: { x: number, y: number }, faceIndex?: number): boolean {
    if (state.priorityPlayerId !== playerId) throw new Error("Not your priority.");
    if (state.stack.length > 0) throw new Error("Stack must be empty to play a land.");
    if (state.phase !== 'main1' && state.phase !== 'main2') throw new Error("Can only play lands in Main Phase.");
    if (state.landsPlayedThisTurn >= 1) throw new Error("Already played a land this turn.");

    const card = state.cards[cardId];
    if (!card || card.controllerId !== playerId || card.zone !== 'hand') throw new Error("Invalid card.");

    let typeLine = card.typeLine || card.definition?.type_line || "";
    let types = card.types || card.definition?.types || [];

    if (faceIndex !== undefined) {
      const faces = card.definition?.card_faces;
      if (faces && faces[faceIndex]) {
        typeLine = faces[faceIndex].type_line || "";
        types = typeLine.split('—')[0].trim().split(' ');
      }
    }

    if (!typeLine.includes('Land') && !types.includes('Land')) throw new Error("Not a land card.");

    this.moveCardToZone(state, card.instanceId, 'battlefield', false, position, faceIndex);
    state.landsPlayedThisTurn++;

    console.log(`[ActionHandler] Player ${playerId} played land: "${card.name}" (Type: ${typeLine})`);

    ActionHandler.resetPriority(state, playerId);
    return true;
  }

  static castSpell(state: StrictGameState, playerId: string, cardId: string, targets: string[] = [], position?: { x: number, y: number }, faceIndex?: number) {
    if (state.priorityPlayerId !== playerId) throw new Error("Not your priority.");

    const card = state.cards[cardId];
    if (!card || (card.zone !== 'hand' && card.zone !== 'command')) throw new Error("Invalid card source (must be Hand or Command Zone).");

    // Determine types and Flash status
    let typeLine = card.typeLine || card.definition?.type_line || "";
    let types = card.types || card.definition?.types || [];
    let keywords = card.keywords || card.definition?.keywords || [];

    if (faceIndex !== undefined) {
      const faces = card.definition?.card_faces;
      if (faces && faces[faceIndex]) {
        typeLine = faces[faceIndex].type_line || "";
        types = typeLine.split('—')[0].trim().split(' ');
        // Oracle text often contains keywords like Flash
        if (faces[faceIndex].oracle_text?.toLowerCase().includes('flash')) {
          keywords = [...keywords, 'Flash'];
        }
      }
    } else {
      // Double check keywords from text if not populated
      if (card.oracleText?.toLowerCase().includes('flash')) {
        keywords = [...(card.keywords || []), 'Flash'];
      }
    }

    // Ensure types is populated if missing
    if ((!types || types.length === 0) && typeLine) {
      types = typeLine.split('—')[0].trim().split(' ');
    }

    // STRICT RULE: Lands cannot be cast. They must be played using PLAY_LAND.
    if (types.includes('Land') || typeLine.includes('Land')) {
      throw new Error("Lands cannot be cast as spells. Use PLAY_LAND action.");
    }

    const isInstant = types.includes('Instant') || typeLine.includes('Instant');
    const hasFlash = keywords.some(k => k.toLowerCase() === 'flash');

    // Timing Rules
    if (!isInstant && !hasFlash) {
      // Sorcery Speed: Main Phase, Stack Empty, Active Player
      if (state.activePlayerId !== playerId) throw new Error("Can only cast Sorcery-speed spells on your turn.");
      if (state.phase !== 'main1' && state.phase !== 'main2') throw new Error("Can only cast Sorcery-speed spells during Main Phase.");
      if (state.stack.length > 0) throw new Error("Stack must be empty to cast Sorcery-speed spells.");
    }

    let name = card.name || card.definition?.name || "Unknown Card";
    let text = card.oracleText || "";

    if (faceIndex !== undefined) {
      const faces = card.definition?.card_faces;
      if (faces && faces[faceIndex]) {
        name = faces[faceIndex].name;
        text = faces[faceIndex].oracle_text || "";
        const manaCost = faces[faceIndex].mana_cost;
        if (manaCost) ManaUtils.payManaCost(state, playerId, manaCost);
      } else {
        if (card.manaCost) ManaUtils.payManaCost(state, playerId, card.manaCost);
      }
    } else {
      if (card.manaCost) {
        ManaUtils.payManaCost(state, playerId, card.manaCost);
      }
    }

    if (CardUtils.isAura(card)) {
      if (targets.length === 0) throw new Error("Aura requires a target.");
    }

    card.zone = 'stack';

    state.stack.push({
      id: Math.random().toString(36).substr(2, 9),
      sourceId: cardId,
      controllerId: playerId,
      type: 'spell',
      name: name,
      text: text,
      targets,
      resolutionPosition: position,
      faceIndex: faceIndex
    } as any);

    console.log(`[ActionHandler] Player ${playerId} cast spell: "${name}" (Type: ${typeLine})`);

    ActionHandler.resetPriority(state, playerId);
    return true;
  }

  static resolveTopStack(state: StrictGameState) {
    const item = state.stack.pop();
    if (!item) return;

    console.log(`Resolving stack item: ${item.name}`);

    if (item.type === 'spell') {
      const card = state.cards[item.sourceId];
      if (card) {
        // Ensure types is populated
        if (!card.types && card.typeLine) {
          card.types = card.typeLine.split('—')[0].trim().split(' ');
        }
        const isPermanent = CardUtils.isPermanent(card);

        // Extra safety: If it's a Land, it MUST go to battlefield.
        // (Lands shouldn't be on stack, but if they are, don't graveyard them)
        const isLand = (card.types?.includes('Land')) || (card.typeLine?.includes('Land'));

        if (isPermanent || isLand) {
          if (CardUtils.isAura(card)) {
            const targetId = item.targets[0];
            const target = state.cards[targetId];
            if (target && target.zone === 'battlefield' && CardUtils.canAttach(card, target)) {
              this.moveCardToZone(state, card.instanceId, 'battlefield', false, item.resolutionPosition);
              card.attachedTo = target.instanceId;
              console.log(`${card.name} enters attached to ${target.name}`);
            } else {
              console.log(`${card.name} failed to attach. Putting into GY.`);
              this.moveCardToZone(state, card.instanceId, 'graveyard');
            }
          } else {
            const faceIndex = (item as any).faceIndex;
            this.moveCardToZone(state, card.instanceId, 'battlefield', false, item.resolutionPosition, faceIndex);

            // Battles enter with defense counters
            if (CardUtils.isBattle(card) && card.baseDefense) {
              this.addCounter(state, state.activePlayerId, card.instanceId, 'defense', card.baseDefense);
            }
          }
        } else {
          this.moveCardToZone(state, card.instanceId, 'graveyard');
        }
      }
    } else if (item.type === 'ability') {
      const source = state.cards[item.sourceId];
      if (source && source.zone === 'battlefield') {
        if (CardUtils.isEquipment(source)) {
          const targetId = item.targets[0];
          const target = state.cards[targetId];
          if (target && target.zone === 'battlefield') { // removed validateTarget check for internal simplicity or duplicate logic
            // Simplified Equip logic
            if (CardUtils.canAttach(source, target)) {
              source.attachedTo = target.instanceId;
              console.log(`[ActionHandler] Equipped ${source.name} to ${target.name}`);
            }
          }
        }
      }
    }

    ActionHandler.resetPriority(state, state.activePlayerId);
  }

  static drawCard(state: StrictGameState, playerId: string) {
    const allCards = Object.values(state.cards);
    // Debug logging for empty library issue
    const library = allCards.filter(c => c.ownerId === playerId && c.zone === 'library');

    if (library.length > 0) {
      // Sort by Z index descending (Highest Z is top card)
      library.sort((a, b) => (b.position?.z || 0) - (a.position?.z || 0));

      const card = library[0]; // Take top card
      this.moveCardToZone(state, card.instanceId, 'hand');
      console.log(`Player ${playerId} draws ${card.name}`);
    } else {
      console.warn(`[RulesEngine] Player ${playerId} attempts to draw from empty library. Total cards in state: ${allCards.length}. Cards owned by player: ${allCards.filter(c => c.ownerId === playerId).length}. Cards in library: 0`);
      // Log distribution of zones for this player
      const zones: Record<string, number> = {};
      allCards.filter(c => c.ownerId === playerId).forEach(c => {
        zones[c.zone] = (zones[c.zone] || 0) + 1;
      });
      console.log(`[RulesEngine] Player ${playerId} card distribution:`, zones);
    }
  }

  static createToken(state: StrictGameState, playerId: string, definition: any, position?: { x: number, y: number }) {
    const token: any = {
      instanceId: Math.random().toString(36).substring(7),
      oracleId: 'token-' + Math.random(),
      name: definition.name,
      controllerId: playerId,
      ownerId: playerId,
      zone: 'battlefield',
      tapped: false,
      faceDown: false,
      counters: [],
      keywords: definition.keywords || [],
      modifiers: [],
      colors: definition.colors,
      types: definition.types,
      subtypes: definition.subtypes,
      supertypes: [],
      basePower: definition.power,
      baseToughness: definition.toughness,
      power: definition.power,
      toughness: definition.toughness,
      imageUrl: definition.local_path_full || definition.imageUrl || '',
      imageArtCrop: definition.local_path_crop || definition.imageArtCrop || '',
      definition: definition, // Store the full definition for reference
      damageMarked: 0,
      controlledSinceTurn: state.turnCount,
      position: position ? { ...position, z: ++state.maxZ } : { x: Math.random() * 80, y: Math.random() * 80, z: ++state.maxZ }
    };
    state.cards[token.instanceId] = token;
    console.log(`[ActionHandler] Player ${playerId} created token: ${definition.name}`);
    StateBasedEffects.process(state);
  }

  static changeLife(state: StrictGameState, playerId: string, amount: number) {
    const player = state.players[playerId];
    if (!player) throw new Error("Player not found");

    player.life += amount;
    console.log(`[ActionHandler] Player ${playerId} life changed by ${amount}. New life: ${player.life}`);

    // Check for state-based effects like losing the game
    StateBasedEffects.process(state);
  }

  static addCounter(state: StrictGameState, _playerId: string, cardId: string, type: string, count: number = 1) {
    const card = state.cards[cardId];
    if (!card || card.zone !== 'battlefield') throw new Error("Card not on battlefield");

    if (!card.counters) card.counters = [];
    let remaining = count;

    if (type === '+1/+1') {
      const minusIndex = card.counters.findIndex(c => c.type === '-1/-1');
      if (minusIndex !== -1) {
        const minusCounter = card.counters[minusIndex];
        const toCancel = Math.min(remaining, minusCounter.count);
        minusCounter.count -= toCancel;
        remaining -= toCancel;
        if (minusCounter.count <= 0) card.counters.splice(minusIndex, 1);
      }
    } else if (type === '-1/-1') {
      const plusIndex = card.counters.findIndex(c => c.type === '+1/+1');
      if (plusIndex !== -1) {
        const plusCounter = card.counters[plusIndex];
        const toCancel = Math.min(remaining, plusCounter.count);
        plusCounter.count -= toCancel;
        remaining -= toCancel;
        if (plusCounter.count <= 0) card.counters.splice(plusIndex, 1);
      }
    }

    if (remaining > 0) {
      const existing = card.counters.find(c => c.type === type);
      if (existing) {
        existing.count += remaining;
      } else {
        card.counters.push({ type, count: remaining });
      }
    }

    console.log(`[ActionHandler] Player ${_playerId} added ${count} ${type} counter(s) to ${card.name}`);
    StateBasedEffects.process(state);
  }

  static tapCard(state: StrictGameState, _playerId: string, cardId: string) {
    const card = state.cards[cardId];
    if (!card) throw new Error("Card not found");

    // If tapping a land on the battlefield, automatically add mana
    if (!card.tapped && card.zone === 'battlefield' && (card.types?.includes('Land') || card.typeLine?.includes('Land'))) {
      const availableColors = ManaUtils.getAvailableManaColors(card);

      if (availableColors.length > 0) {
        card.tapped = true;

        // For lands that produce a single color, automatically add it
        if (availableColors.length === 1) {
          ManaUtils.addMana(state, _playerId, { color: availableColors[0], amount: 1 });
          console.log(`[ActionHandler] Player ${_playerId} tapped ${card.name} and added ${availableColors[0]} mana`);
        } else {
          // For lands that produce multiple colors, add the first color
          // (In the future, we could prompt the player to choose)
          const colorToProduce = availableColors[0];
          ManaUtils.addMana(state, _playerId, { color: colorToProduce, amount: 1 });
          console.log(`[ActionHandler] Player ${_playerId} tapped ${card.name} and added ${colorToProduce} mana (options: ${availableColors.join(', ')})`);
        }
        return;
      }
    }

    // For non-lands or untapping, just toggle the tap state
    card.tapped = !card.tapped;
    console.log(`[ActionHandler] Player ${_playerId} ${card.tapped ? 'tapped' : 'untapped'} ${card.name}`);
  }

  static activateAbility(state: StrictGameState, playerId: string, sourceId: string, abilityIndex: number, targets: string[] = []) {
    if (state.priorityPlayerId !== playerId) throw new Error("Not your priority.");

    const source = state.cards[sourceId];
    if (!source) throw new Error("Source card not found");

    // Land Mana Ability Support
    if (source.zone === 'battlefield' && (source.types?.includes('Land') || source.typeLine?.includes('Land'))) {
      if (source.tapped) throw new Error("Land is already tapped.");

      // Determine color to produce
      const availableColors = ManaUtils.getAvailableManaColors(source);
      if (availableColors.length === 0) throw new Error("This land cannot produce mana.");

      let colorToProduce = availableColors[0];
      if (abilityIndex >= 0 && abilityIndex < availableColors.length) {
        colorToProduce = availableColors[abilityIndex];
      }

      source.tapped = true;
      ManaUtils.addMana(state, playerId, { color: colorToProduce, amount: 1 });
      console.log(`[ActionHandler] Player ${playerId} activated mana ability of ${source.name} producing ${colorToProduce}`);
      // Mana abilities do not use the stack.
      return;
    }

    // Equip Logic (Hardcoded for now as per previous RulesEngine)
    if (CardUtils.isEquipment(source) && source.zone === 'battlefield') {
      if (state.stack.length > 0 || (state.phase !== 'main1' && state.phase !== 'main2')) {
        throw new Error("Equip can only be used as a sorcery.");
      }
      if (targets.length !== 1) throw new Error("Equip requires exactly one target.");

      state.stack.push({
        id: Math.random().toString(36).substr(2, 9),
        sourceId: sourceId,
        controllerId: playerId,
        type: 'ability',
        name: `Equip ${source.name}`,
        text: `Attach to target`,
        targets
      });
      ActionHandler.resetPriority(state, playerId);
      return;
    }

    // TODO: Generic Activated Ability support
    throw new Error("Ability not implemented/supported for this card.");
  }

  static resetPriority(state: StrictGameState, playerId: string) {
    StateBasedEffects.process(state);
    state.priorityPlayerId = playerId;
    state.passedPriorityCount = 0;
    Object.values(state.players).forEach(p => p.hasPassed = false);
    console.log(`[ActionHandler] Priority reset to ${playerId}`);
  }
}
