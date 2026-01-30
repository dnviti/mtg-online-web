import { StrictGameState, StackObject } from '../types';
import { CardUtils } from './CardUtils';
import { ManaUtils } from './ManaUtils';
import { GameLogger } from './GameLogger';

/**
 * ActionHandler - Manual Play Mode
 *
 * Handles discrete player actions in a Cockatrice/Tabletop Simulator style.
 * All automation has been removed - players manually control all game effects.
 *
 * The system manages:
 * - Turn structure, phases, and priority
 * - The stack (spells/abilities go on stack, resolve in LIFO order)
 * - Zone transitions
 * - Basic state tracking (life, counters, tapped state)
 *
 * Players manually handle:
 * - Triggered abilities (they add them to stack manually)
 * - Effect resolution (they apply effects themselves)
 * - State-based actions (they move creatures to graveyard when appropriate)
 */
export class ActionHandler {

  /**
   * Moves a card from one zone to another.
   * No automatic triggers - just zone transition and state reset.
   */
  static moveCardToZone(state: StrictGameState, cardId: string, toZone: any, faceDown = false, position?: { x: number, y: number }, faceIndex?: number, skipLog = false) {
    const card = state.cards[cardId];
    if (card) {
      const fromZone = card.zone;

      if (toZone === 'battlefield' && card.zone !== 'battlefield') {
        card.controlledSinceTurn = state.turnCount;
      }

      card.zone = toZone;

      // Log zone changes
      if (!skipLog && fromZone !== toZone && fromZone !== 'library' && toZone !== 'library') {
        if (fromZone === 'battlefield') {
          GameLogger.logLeavesBattlefield(state, card, toZone);
        } else if (toZone === 'battlefield') {
          GameLogger.logEntersBattlefield(state, card);
        } else {
          GameLogger.logZoneChange(state, card, fromZone, toZone);
        }
      }
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
          card.loyalty = undefined;
          card.baseLoyalty = undefined;
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

    const playerName = state.players[playerId]?.name || 'Unknown';

    this.moveCardToZone(state, card.instanceId, 'battlefield', false, position, faceIndex, true);
    state.landsPlayedThisTurn++;

    console.log(`[ActionHandler] Player ${playerId} played land: "${card.name}"`);
    GameLogger.logPlayLand(state, card, playerName);

    ActionHandler.resetPriority(state, playerId);
    return true;
  }

  static castSpell(state: StrictGameState, playerId: string, cardId: string, targets: string[] = [], position?: { x: number, y: number }, faceIndex?: number) {
    if (state.priorityPlayerId !== playerId) throw new Error("Not your priority.");

    const card = state.cards[cardId];
    if (!card || (card.zone !== 'hand' && card.zone !== 'command')) throw new Error("Invalid card source.");

    let typeLine = card.typeLine || card.definition?.type_line || "";
    let types = card.types || card.definition?.types || [];
    let keywords = card.keywords || card.definition?.keywords || [];

    if (faceIndex !== undefined) {
      const faces = card.definition?.card_faces;
      if (faces && faces[faceIndex]) {
        typeLine = faces[faceIndex].type_line || "";
        types = typeLine.split('—')[0].trim().split(' ');
        if (faces[faceIndex].oracle_text?.toLowerCase().includes('flash')) {
          keywords = [...keywords, 'Flash'];
        }
      }
    } else {
      if (card.oracleText?.toLowerCase().includes('flash')) {
        keywords = [...(card.keywords || []), 'Flash'];
      }
    }

    if ((!types || types.length === 0) && typeLine) {
      types = typeLine.split('—')[0].trim().split(' ');
    }

    if (types.includes('Land') || typeLine.includes('Land')) {
      throw new Error("Lands cannot be cast as spells. Use PLAY_LAND action.");
    }

    const isInstant = types.includes('Instant') || typeLine.includes('Instant');
    const hasFlash = keywords.some(k => k.toLowerCase() === 'flash');

    if (!isInstant && !hasFlash) {
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

    card.zone = 'stack';

    const stackItem: StackObject = {
      id: Math.random().toString(36).substr(2, 9),
      sourceId: cardId,
      controllerId: playerId,
      type: 'spell',
      name: name,
      text: text,
      targets,
      resolutionPosition: position,
      faceIndex: faceIndex
    } as any;

    state.stack.push(stackItem);

    console.log(`[ActionHandler] Player ${playerId} cast spell: "${name}"`);

    const playerName = state.players[playerId]?.name || 'Unknown';
    const targetCards = targets.map(t => state.cards[t]).filter(Boolean);
    GameLogger.logCastSpell(state, card, playerName, targetCards);

    ActionHandler.resetPriority(state, playerId);
    return true;
  }

  /**
   * Resolves the top item on the stack.
   * In manual mode, permanents go to battlefield, instants/sorceries go to graveyard.
   * All effects must be applied manually by players.
   */
  static resolveTopStack(state: StrictGameState) {
    const item = state.stack.pop();
    if (!item) return;

    console.log(`Resolving stack item: ${item.name} (type: ${item.type})`);

    if (item.type === 'spell') {
      const card = state.cards[item.sourceId];
      if (card) {
        if (!card.types || card.types.length === 0) {
          const typeLine = card.typeLine || card.definition?.type_line || '';
          if (typeLine) {
            card.types = typeLine.split('—')[0].trim().split(' ').filter(Boolean);
          }
        }

        const isPermanent = CardUtils.isPermanent(card);
        const isLand = (card.types?.includes('Land')) || (card.typeLine?.includes('Land'));

        if (isPermanent || isLand) {
          // Auras need to be attached to target
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

            // Planeswalkers enter with loyalty counters
            if (CardUtils.isPlaneswalker(card)) {
              const faces = card.definition?.card_faces;
              const faceLoyalty = faces?.[0]?.loyalty || faces?.[1]?.loyalty;
              const loyaltyStr = card.definition?.loyalty || (card as any).loyalty || faceLoyalty;
              const baseLoyalty = card.baseLoyalty || (loyaltyStr ? parseInt(loyaltyStr) : 0);
              if (baseLoyalty > 0) {
                card.baseLoyalty = baseLoyalty;
                card.loyalty = baseLoyalty;
                this.addCounter(state, state.activePlayerId, card.instanceId, 'loyalty', baseLoyalty);
              }
            }

            // Battles enter with defense counters
            if (CardUtils.isBattle(card) && card.baseDefense) {
              this.addCounter(state, state.activePlayerId, card.instanceId, 'defense', card.baseDefense);
            }
          }
        } else {
          // Instant/sorcery - goes to graveyard after "resolving"
          // Players apply effects manually
          this.moveCardToZone(state, card.instanceId, 'graveyard');
        }
      }
    } else if (item.type === 'ability') {
      const source = state.cards[item.sourceId];
      if (source) {
        // Equipment equip ability
        if (CardUtils.isEquipment(source) && source.zone === 'battlefield') {
          const targetId = item.targets[0];
          const target = state.cards[targetId];
          if (target && target.zone === 'battlefield') {
            if (CardUtils.canAttach(source, target)) {
              source.attachedTo = target.instanceId;
              console.log(`[ActionHandler] Equipped ${source.name} to ${target.name}`);
            }
          }
        }
        // Other abilities - players handle effects manually
        console.log(`[ActionHandler] Ability from ${source.name} resolved - apply effects manually`);
      }
    } else if (item.type === 'trigger') {
      // Triggered ability - players handle effects manually
      const source = state.cards[item.sourceId];
      console.log(`[ActionHandler] Trigger from ${source?.name || 'unknown'} resolved - apply effects manually`);
    }

    ActionHandler.resetPriority(state, state.activePlayerId);
  }

  static drawCard(state: StrictGameState, playerId: string) {
    const allCards = Object.values(state.cards);
    const library = allCards.filter(c => c.ownerId === playerId && c.zone === 'library');

    if (library.length > 0) {
      library.sort((a, b) => (b.position?.z || 0) - (a.position?.z || 0));
      const card = library[0];
      this.moveCardToZone(state, card.instanceId, 'hand');
      console.log(`Player ${playerId} draws ${card.name}`);
    } else {
      console.warn(`[ActionHandler] Player ${playerId} attempts to draw from empty library.`);
    }
  }

  static createToken(state: StrictGameState, playerId: string, definition: any, position?: { x: number, y: number }) {
    const face = definition.card_faces?.[0];

    const typeLine = definition.type_line || face?.type_line ||
      [
        ...(definition.supertypes || []),
        'Token',
        ...(definition.types || [])
      ].filter(Boolean).join(' ') +
      (definition.subtypes?.length ? ' — ' + definition.subtypes.join(' ') : '');

    const power = definition.power ?? face?.power;
    const toughness = definition.toughness ?? face?.toughness;
    const oracleText = definition.oracle_text || face?.oracle_text || '';
    const keywords = definition.keywords || face?.keywords || [];
    const colors = definition.colors || face?.colors || [];
    const imageUrl = definition.local_path_full || definition.imageUrl || '/images/token.jpg';
    const imageArtCrop = definition.local_path_crop || definition.imageArtCrop || '';

    const token: any = {
      instanceId: Math.random().toString(36).substring(7),
      oracleId: definition.oracle_id || 'token-' + Math.random(),
      scryfallId: definition.id || definition.scryfallId,
      setCode: definition.set || definition.setCode,
      name: definition.name || face?.name,
      controllerId: playerId,
      ownerId: playerId,
      zone: 'battlefield',
      tapped: false,
      faceDown: false,
      counters: [],
      keywords: keywords,
      modifiers: [],
      colors: colors,
      types: definition.types || [],
      subtypes: definition.subtypes || [],
      supertypes: definition.supertypes || [],
      type_line: typeLine,
      typeLine: typeLine,
      oracle_text: oracleText,
      oracleText: oracleText,
      basePower: power,
      baseToughness: toughness,
      power: power,
      toughness: toughness,
      imageUrl: imageUrl,
      imageArtCrop: imageArtCrop,
      definition: definition,
      damageMarked: 0,
      controlledSinceTurn: state.turnCount,
      isToken: true,
      position: position ? { ...position, z: ++state.maxZ } : { x: Math.random() * 80, y: Math.random() * 80, z: ++state.maxZ }
    };
    state.cards[token.instanceId] = token;
    console.log(`[ActionHandler] Player ${playerId} created token: ${token.name}`);

    const playerName = state.players[playerId]?.name || 'Unknown';
    GameLogger.logTokenCreated(state, token, playerName);
  }

  static changeLife(state: StrictGameState, playerId: string, amount: number) {
    const player = state.players[playerId];
    if (!player) throw new Error("Player not found");

    player.life += amount;
    console.log(`[ActionHandler] Player ${playerId} life changed by ${amount}. New life: ${player.life}`);
  }

  static addCounter(state: StrictGameState, _playerId: string, cardId: string, type: string, count: number = 1) {
    const card = state.cards[cardId];
    if (!card || card.zone !== 'battlefield') throw new Error("Card not on battlefield");

    if (!card.counters) card.counters = [];
    let remaining = count;

    // +1/+1 and -1/-1 counters cancel each other (Rule 122.3)
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

    console.log(`[ActionHandler] Added ${count} ${type} counter(s) to ${card.name}`);

    const playerName = state.players[_playerId]?.name || 'Unknown';
    GameLogger.logCounterChange(state, card, type, count, playerName);
  }

  static tapCard(state: StrictGameState, _playerId: string, cardId: string) {
    const card = state.cards[cardId];
    if (!card) throw new Error("Card not found");

    // If tapping a land, auto-add mana
    if (!card.tapped && card.zone === 'battlefield' && (card.types?.includes('Land') || card.typeLine?.includes('Land'))) {
      const availableColors = ManaUtils.getAvailableManaColors(card);

      if (availableColors.length > 0) {
        card.tapped = true;
        if (availableColors.length === 1) {
          ManaUtils.addMana(state, _playerId, { color: availableColors[0], amount: 1 });
          console.log(`[ActionHandler] Player ${_playerId} tapped ${card.name} for ${availableColors[0]}`);
        } else {
          const colorToProduce = availableColors[0];
          ManaUtils.addMana(state, _playerId, { color: colorToProduce, amount: 1 });
          console.log(`[ActionHandler] Player ${_playerId} tapped ${card.name} for ${colorToProduce}`);
        }
        return;
      }
    }

    card.tapped = !card.tapped;
    console.log(`[ActionHandler] Player ${_playerId} ${card.tapped ? 'tapped' : 'untapped'} ${card.name}`);
  }

  /**
   * Activates an ability - in manual mode, just puts it on the stack.
   * Players handle timing restrictions and costs manually.
   */
  static activateAbility(state: StrictGameState, playerId: string, sourceId: string, abilityIndex: number, targets: string[] = []) {
    if (state.priorityPlayerId !== playerId) throw new Error("Not your priority.");

    const source = state.cards[sourceId];
    if (!source) throw new Error("Source card not found");

    // Land mana ability - doesn't use stack
    if (source.zone === 'battlefield' && (source.types?.includes('Land') || source.typeLine?.includes('Land'))) {
      if (source.tapped) throw new Error("Land is already tapped.");

      const availableColors = ManaUtils.getAvailableManaColors(source);
      if (availableColors.length === 0) throw new Error("This land cannot produce mana.");

      let colorToProduce = availableColors[0];
      if (abilityIndex >= 0 && abilityIndex < availableColors.length) {
        colorToProduce = availableColors[abilityIndex];
      }

      source.tapped = true;
      ManaUtils.addMana(state, playerId, { color: colorToProduce, amount: 1 });
      console.log(`[ActionHandler] Player ${playerId} activated mana ability of ${source.name}`);
      return;
    }

    // Equipment equip ability
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
        text: `Attach to target creature`,
        targets
      });
      ActionHandler.resetPriority(state, playerId);
      return;
    }

    // Generic ability - put on stack, players handle the rest
    const stackItem: StackObject = {
      id: Math.random().toString(36).substr(2, 9),
      sourceId: sourceId,
      controllerId: playerId,
      type: 'ability',
      name: `${source.name} ability`,
      text: `Ability ${abilityIndex}`,
      targets
    };

    state.stack.push(stackItem);

    const playerName = state.players[playerId]?.name || 'Unknown';
    GameLogger.log(state, `${playerName} activates ability of {${source.name}}`, 'action', source.name, [source]);

    ActionHandler.resetPriority(state, playerId);
  }

  /**
   * Put a triggered ability on the stack manually.
   * In manual mode, players decide when triggers go on the stack.
   */
  static addTriggerToStack(state: StrictGameState, playerId: string, sourceId: string, triggerName: string, triggerText: string, targets: string[] = []) {
    const source = state.cards[sourceId];
    if (!source) throw new Error("Source card not found");

    const stackItem: StackObject = {
      id: Math.random().toString(36).substr(2, 9),
      sourceId: sourceId,
      controllerId: playerId,
      type: 'trigger',
      name: triggerName || `${source.name} trigger`,
      text: triggerText || 'Triggered ability',
      targets
    };

    state.stack.push(stackItem);

    const playerName = state.players[playerId]?.name || 'Unknown';
    GameLogger.log(state, `${playerName} puts {${source.name}} trigger on stack`, 'action', source.name, [source]);

    console.log(`[ActionHandler] Trigger added to stack: ${stackItem.name}`);
  }

  static resetPriority(state: StrictGameState, playerId: string) {
    state.priorityPlayerId = playerId;
    state.passedPriorityCount = 0;
    Object.values(state.players).forEach(p => p.hasPassed = false);
    console.log(`[ActionHandler] Priority reset to ${playerId}`);
  }
}
