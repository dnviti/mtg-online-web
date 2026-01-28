import { StrictGameState, StackObject } from '../types';
import { CardUtils } from './CardUtils';
import { ManaUtils } from './ManaUtils';
import { StateBasedEffects } from './StateBasedEffects';
import { GameLogger } from './GameLogger';
import { OracleEffectResolver } from './OracleEffectResolver';
import { AbilityParser, ParsedAbility } from './AbilityParser';
import { WardHandler } from './WardHandler';
import { TriggeredAbilityHandler } from './TriggeredAbilityHandler';

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
  static moveCardToZone(state: StrictGameState, cardId: string, toZone: any, faceDown = false, position?: { x: number, y: number }, faceIndex?: number, skipLog = false) {
    const card = state.cards[cardId];
    if (card) {
      const fromZone = card.zone;

      // Capture card snapshot BEFORE zone change for LTB triggers (look-back-in-time)
      const wasOnBattlefield = fromZone === 'battlefield';
      const cardSnapshot = wasOnBattlefield ? { ...card } : null;

      if (toZone === 'battlefield' && card.zone !== 'battlefield') {
        card.controlledSinceTurn = state.turnCount;
      }

      card.zone = toZone;

      // Log zone changes (skip library shuffling and initial setup)
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

      // Check for LTB (leaves-the-battlefield) triggers if card left battlefield
      // Note: Death triggers for creatures are handled separately in StateBasedEffects
      // LTB triggers fire for: exile, bounce, sacrifice (non-creature), etc.
      if (wasOnBattlefield && toZone !== 'battlefield' && cardSnapshot) {
        // Skip creature deaths - those are handled by death triggers in StateBasedEffects
        const isCreatureDeath = cardSnapshot.types?.includes('Creature') && toZone === 'graveyard';
        if (!isCreatureDeath) {
          const ltbTriggers = TriggeredAbilityHandler.checkLTBTriggers(state, cardSnapshot, toZone);
          if (ltbTriggers.length > 0) {
            const orderedTriggers = TriggeredAbilityHandler.orderTriggersAPNAP(state, ltbTriggers);
            TriggeredAbilityHandler.putTriggersOnStack(state, orderedTriggers);
            console.log(`[ActionHandler] Added ${ltbTriggers.length} LTB trigger(s) to stack`);
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

    // moveCardToZone with skipLog=true to avoid duplicate "enters battlefield" log
    this.moveCardToZone(state, card.instanceId, 'battlefield', false, position, faceIndex, true);
    state.landsPlayedThisTurn++;

    console.log(`[ActionHandler] Player ${playerId} played land: "${card.name}" (Type: ${typeLine})`);
    GameLogger.logPlayLand(state, card, playerName);

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

    console.log(`[ActionHandler] Player ${playerId} cast spell: "${name}" (Type: ${typeLine})`);

    // Log spell cast with targets
    const playerName = state.players[playerId]?.name || 'Unknown';
    const targetCards = targets.map(t => state.cards[t]).filter(Boolean);
    GameLogger.logCastSpell(state, card, playerName, targetCards);

    // Check for Ward triggers on any targets
    if (targets.length > 0) {
      const wardTriggered = WardHandler.checkWardTrigger(state, stackItem, card);
      if (wardTriggered) {
        // Ward creates a pending choice - priority stays with the spell's controller
        console.log(`[ActionHandler] Ward triggered - waiting for payment decision`);
      }
    }

    // Check for spell cast triggers from other permanents
    const spellCastTriggers = TriggeredAbilityHandler.checkSpellCastTriggers(state, card, playerId);
    if (spellCastTriggers.length > 0) {
      const orderedTriggers = TriggeredAbilityHandler.orderTriggersAPNAP(state, spellCastTriggers);
      TriggeredAbilityHandler.putTriggersOnStack(state, orderedTriggers);
      console.log(`[ActionHandler] Added ${spellCastTriggers.length} spell cast trigger(s) to stack`);
    }

    ActionHandler.resetPriority(state, playerId);
    return true;
  }

  static resolveTopStack(state: StrictGameState) {
    const item = state.stack.pop();
    if (!item) return;

    console.log(`Resolving stack item: ${item.name} (type: ${item.type})`);

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

              // Check for ETB triggers on the aura
              const etbTriggers = TriggeredAbilityHandler.checkETBTriggers(state, card);
              if (etbTriggers.length > 0) {
                TriggeredAbilityHandler.putTriggersOnStack(state, etbTriggers);
              } else {
                // No triggers - resolve static aura effects immediately
                OracleEffectResolver.resolveSpellEffects(state, card, item);
              }
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

            // Check for ETB triggered abilities instead of resolving immediately
            console.log(`[ActionHandler] Checking ETB triggers for ${card.name}, oracle: "${(card.oracleText || card.definition?.oracle_text || '').substring(0, 100)}..."`);
            const etbTriggers = TriggeredAbilityHandler.checkETBTriggers(state, card);
            console.log(`[ActionHandler] Found ${etbTriggers.length} ETB triggers for ${card.name}`);
            if (etbTriggers.length > 0) {
              // Put triggers on the stack - they'll resolve when priority passes
              TriggeredAbilityHandler.putTriggersOnStack(state, etbTriggers);
            }
            // Note: Non-triggered ETB effects (like static abilities) are handled by the continuous effect layer
          }
        } else {
          // Non-permanent spell (instant/sorcery) - resolve effects THEN move to graveyard
          OracleEffectResolver.resolveSpellEffects(state, card, item);
          this.moveCardToZone(state, card.instanceId, 'graveyard');
        }
      }
    } else if (item.type === 'ability') {
      const source = state.cards[item.sourceId];
      if (source) {
        // Equipment special case
        if (CardUtils.isEquipment(source) && source.zone === 'battlefield') {
          const targetId = item.targets[0];
          const target = state.cards[targetId];
          if (target && target.zone === 'battlefield') {
            if (CardUtils.canAttach(source, target)) {
              source.attachedTo = target.instanceId;
              console.log(`[ActionHandler] Equipped ${source.name} to ${target.name}`);
            }
          }
        } else {
          // Generic ability resolution
          // Parse the ability from the stack item text and resolve it
          const abilities = AbilityParser.parseAbilities(source);
          const matchingAbility = abilities.find(a =>
            a.effectText.toLowerCase().includes(item.text.toLowerCase().substring(0, 20)) ||
            item.text.toLowerCase().includes(a.effectText.toLowerCase().substring(0, 20))
          );

          if (matchingAbility) {
            this.resolveAbilityEffect(state, item.controllerId, source, matchingAbility, item.targets);
          } else {
            // Fallback: create a pseudo-ability from the stack item
            const pseudoAbility: ParsedAbility = {
              id: 'stack-ability',
              type: 'activated',
              text: item.text,
              effectText: item.text
            };
            this.resolveAbilityEffect(state, item.controllerId, source, pseudoAbility, item.targets);
          }
        }
      }
    } else if (item.type === 'trigger') {
      // Triggered ability resolution
      const source = state.cards[item.sourceId];
      if (source) {
        console.log(`[ActionHandler] Resolving triggered ability from ${source.name}`);
        const resolved = TriggeredAbilityHandler.resolveTrigger(state, item);

        // If the trigger is waiting for a choice (e.g., "if you do" optional costs),
        // push it back onto the stack so it can continue resolving after the choice
        if (!resolved && state.pendingChoice) {
          console.log(`[ActionHandler] Trigger waiting for choice, pushing back to stack`);
          state.stack.push(item);
          return; // Don't reset priority - let the choice handler manage it
        }
      } else {
        console.warn(`[ActionHandler] Source card not found for trigger: ${item.sourceId}`);
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
    // Resolve properties from root or card_faces[0] (Scryfall tokens may use either)
    const face = definition.card_faces?.[0];

    // Build type_line from types array if not provided directly
    const typeLine = definition.type_line || face?.type_line ||
      [
        ...(definition.supertypes || []),
        'Token',
        ...(definition.types || [])
      ].filter(Boolean).join(' ') +
      (definition.subtypes?.length ? ' — ' + definition.subtypes.join(' ') : '');

    // Resolve power/toughness from root or card_faces[0]
    const power = definition.power ?? face?.power;
    const toughness = definition.toughness ?? face?.toughness;

    // Resolve other properties
    const oracleText = definition.oracle_text || face?.oracle_text || '';
    const keywords = definition.keywords || face?.keywords || [];
    const colors = definition.colors || face?.colors || [];

    // For token images, use ONLY local cached paths (Scryfall URLs are only for downloading to cache)
    const imageUrl = definition.local_path_full || definition.imageUrl || '/images/token.jpg';
    const imageArtCrop = definition.local_path_crop || definition.imageArtCrop || '';

    const token: any = {
      instanceId: Math.random().toString(36).substring(7),
      oracleId: definition.oracle_id || 'token-' + Math.random(),
      scryfallId: definition.id || definition.scryfallId, // Store Scryfall ID for client-side lookups
      setCode: definition.set || definition.setCode, // Store set code for debugging
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
      // Type line for CardVisual creature/land detection
      type_line: typeLine,
      typeLine: typeLine,
      // Oracle text for keyword detection (haste, flying, etc.)
      oracle_text: oracleText,
      oracleText: oracleText,
      basePower: power,
      baseToughness: toughness,
      power: power,
      toughness: toughness,
      imageUrl: imageUrl,
      imageArtCrop: imageArtCrop,
      definition: definition, // Store the full definition for reference
      damageMarked: 0,
      controlledSinceTurn: state.turnCount,
      isToken: true, // Mark as token - tokens cease to exist when leaving the battlefield
      position: position ? { ...position, z: ++state.maxZ } : { x: Math.random() * 80, y: Math.random() * 80, z: ++state.maxZ }
    };
    state.cards[token.instanceId] = token;
    console.log(`[ActionHandler] Player ${playerId} created token: ${token.name} (${typeLine}) P/T: ${power}/${toughness} | Image: ${imageUrl ? 'Yes' : 'No'} | ScryfallId: ${token.scryfallId || 'none'}`);

    const playerName = state.players[playerId]?.name || 'Unknown';
    GameLogger.logTokenCreated(state, token, playerName);

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

    const playerName = state.players[_playerId]?.name || 'Unknown';
    GameLogger.logCounterChange(state, card, type, count, playerName);

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

    // Generic Activated Ability Support using AbilityParser
    const activatableAbilities = AbilityParser.getActivatableAbilities(state, source, playerId);

    if (activatableAbilities.length === 0) {
      throw new Error("No activatable abilities on this card.");
    }

    if (abilityIndex < 0 || abilityIndex >= activatableAbilities.length) {
      throw new Error(`Invalid ability index: ${abilityIndex}. Card has ${activatableAbilities.length} abilities.`);
    }

    const ability = activatableAbilities[abilityIndex];
    console.log(`[ActionHandler] Player ${playerId} activating ability ${abilityIndex} of ${source.name}: "${ability.text.substring(0, 60)}..."`);

    // Validate and pay costs
    this.payAbilityCost(state, playerId, source, ability);

    // Mana abilities don't use the stack
    if (ability.isManaAbility) {
      this.resolveAbilityEffect(state, playerId, source, ability, targets);
      return;
    }

    // Validate targets if required
    if (ability.requiresTarget && targets.length === 0) {
      throw new Error("This ability requires a target.");
    }

    // Put ability on stack
    const stackItem: StackObject = {
      id: Math.random().toString(36).substr(2, 9),
      sourceId: sourceId,
      controllerId: playerId,
      type: 'ability',
      name: `${source.name}: ${ability.effectText.substring(0, 30)}...`,
      text: ability.effectText,
      targets
    };

    state.stack.push(stackItem);

    const playerName = state.players[playerId]?.name || 'Unknown';
    GameLogger.log(state, `${playerName} activates ability of {${source.name}}`, 'action', source.name, [source]);

    ActionHandler.resetPriority(state, playerId);
  }

  /**
   * Pays the cost for an activated ability
   */
  static payAbilityCost(state: StrictGameState, playerId: string, source: any, ability: ParsedAbility) {
    const cost = ability.cost;
    if (!cost) return;

    // Pay tap cost
    if (cost.tap) {
      if (source.tapped) throw new Error(`${source.name} is already tapped.`);

      // Check summoning sickness for creatures
      if (source.types?.includes('Creature')) {
        const hasHaste = source.keywords?.includes('Haste');
        if (source.controlledSinceTurn === state.turnCount && !hasHaste) {
          throw new Error(`${source.name} has summoning sickness.`);
        }
      }

      source.tapped = true;
    }

    // Pay mana cost
    if (cost.mana) {
      ManaUtils.payManaCost(state, playerId, cost.mana);
    }

    // Pay life cost
    if (cost.life) {
      const player = state.players[playerId];
      if (!player || player.life < cost.life) {
        throw new Error(`Not enough life to pay ${cost.life} life.`);
      }
      player.life -= cost.life;
      console.log(`[ActionHandler] Player ${playerId} paid ${cost.life} life`);
    }

    // Sacrifice cost
    if (cost.sacrifice) {
      // For "sacrifice this permanent" or "sacrifice ~"
      const sacrificeThis = cost.sacrifice.toLowerCase().includes('this') ||
                           cost.sacrifice.toLowerCase().includes(source.name.toLowerCase());

      if (sacrificeThis) {
        this.moveCardToZone(state, source.instanceId, 'graveyard');
        console.log(`[ActionHandler] ${source.name} sacrificed as cost`);
      } else {
        // For "sacrifice a creature" etc. - would need additional targeting
        // This is a simplification - full implementation would require choice system
        console.warn(`[ActionHandler] Sacrifice cost "${cost.sacrifice}" requires manual selection`);
      }
    }

    // Remove counters cost
    if (cost.removeCounters) {
      const counterType = cost.removeCounters.type;
      const count = cost.removeCounters.count;
      const counter = source.counters?.find((c: any) => c.type.toLowerCase().includes(counterType.toLowerCase()));

      if (!counter || counter.count < count) {
        throw new Error(`Not enough ${counterType} counters to remove.`);
      }

      counter.count -= count;
      if (counter.count <= 0) {
        source.counters = source.counters.filter((c: any) => c !== counter);
      }
      console.log(`[ActionHandler] Removed ${count} ${counterType} counter(s) from ${source.name}`);
    }
  }

  /**
   * Resolves the effect of an activated ability (for mana abilities or after stack resolution)
   */
  static resolveAbilityEffect(state: StrictGameState, playerId: string, source: any, ability: ParsedAbility, targets: string[] = []) {
    const effectText = ability.effectText.toLowerCase();

    // Mana ability: Add mana
    const manaMatch = effectText.match(/add\s+(\{[wubrgc]\})/i);
    if (manaMatch) {
      const colorSymbol = manaMatch[1].toUpperCase();
      const colorMap: Record<string, string> = {
        '{W}': 'W', '{U}': 'U', '{B}': 'B', '{R}': 'R', '{G}': 'G', '{C}': 'C'
      };
      const color = colorMap[colorSymbol] || 'C';
      ManaUtils.addMana(state, playerId, { color, amount: 1 });
      console.log(`[ActionHandler] ${source.name} added {${color}} mana`);
      return;
    }

    // Add multiple mana (e.g., "Add {G}{G}")
    const multiManaMatch = effectText.match(/add\s+((?:\{[wubrgc]\})+)/gi);
    if (multiManaMatch) {
      const manaString = multiManaMatch[0];
      const symbols = manaString.match(/\{[wubrgc]\}/gi) || [];
      for (const sym of symbols) {
        const color = sym.replace(/[{}]/g, '').toUpperCase();
        ManaUtils.addMana(state, playerId, { color, amount: 1 });
      }
      console.log(`[ActionHandler] ${source.name} added mana: ${symbols.join('')}`);
      return;
    }

    // Firebreathing-style pump ability: +X/+Y until end of turn
    const pumpEffect = AbilityParser.parseFirebreathingAbility(ability);
    if (pumpEffect && source.zone === 'battlefield') {
      if (!source.modifiers) source.modifiers = [];
      source.modifiers.push({
        sourceId: source.instanceId,
        type: 'pt_boost',
        value: { power: pumpEffect.power, toughness: pumpEffect.toughness },
        untilEndOfTurn: true
      });

      // Immediately apply the boost
      source.power += pumpEffect.power;
      source.toughness += pumpEffect.toughness;

      console.log(`[ActionHandler] ${source.name} gets ${pumpEffect.power >= 0 ? '+' : ''}${pumpEffect.power}/${pumpEffect.toughness >= 0 ? '+' : ''}${pumpEffect.toughness} until end of turn`);
      GameLogger.log(state, `{${source.name}} gets ${pumpEffect.power >= 0 ? '+' : ''}${pumpEffect.power}/${pumpEffect.toughness >= 0 ? '+' : ''}${pumpEffect.toughness}`, 'action', source.name, [source]);
      return;
    }

    // Draw cards
    const drawMatch = effectText.match(/draw\s+(a card|(\d+)\s+cards?)/i);
    if (drawMatch) {
      const count = drawMatch[2] ? parseInt(drawMatch[2]) : 1;
      for (let i = 0; i < count; i++) {
        this.drawCard(state, playerId);
      }
      return;
    }

    // Gain life
    const lifeMatch = effectText.match(/gain\s+(\d+)\s+life/i);
    if (lifeMatch) {
      const amount = parseInt(lifeMatch[1]);
      this.changeLife(state, playerId, amount);
      return;
    }

    // Damage to target
    if (targets.length > 0) {
      const damageMatch = effectText.match(/deals?\s+(\d+)\s+damage/i);
      if (damageMatch) {
        const damage = parseInt(damageMatch[1]);
        for (const targetId of targets) {
          const targetCard = state.cards[targetId];
          const targetPlayer = state.players[targetId];

          if (targetCard && targetCard.zone === 'battlefield') {
            targetCard.damageMarked = (targetCard.damageMarked || 0) + damage;
            console.log(`[ActionHandler] ${source.name} deals ${damage} damage to ${targetCard.name}`);
            GameLogger.log(state, `{${source.name}} deals ${damage} damage to {${targetCard.name}}`, 'action', source.name, [source, targetCard]);
          } else if (targetPlayer) {
            targetPlayer.life -= damage;
            console.log(`[ActionHandler] ${source.name} deals ${damage} damage to ${targetPlayer.name}`);
            GameLogger.log(state, `{${source.name}} deals ${damage} damage to ${targetPlayer.name}`, 'action', source.name, [source]);
          }
        }
        StateBasedEffects.process(state);
        return;
      }
    }

    // Fallback: Use OracleEffectResolver for complex effects
    console.log(`[ActionHandler] Using OracleEffectResolver for ability: ${ability.effectText.substring(0, 50)}...`);
    // Create a pseudo-stack item for the resolver
    const pseudoStackItem: StackObject = {
      id: 'ability-resolve',
      sourceId: source.instanceId,
      controllerId: playerId,
      type: 'ability',
      name: source.name,
      text: ability.effectText,
      targets
    };
    OracleEffectResolver.resolveSpellEffects(state, source, pseudoStackItem);
  }

  static resetPriority(state: StrictGameState, playerId: string) {
    StateBasedEffects.process(state);
    state.priorityPlayerId = playerId;
    state.passedPriorityCount = 0;
    Object.values(state.players).forEach(p => p.hasPassed = false);
    console.log(`[ActionHandler] Priority reset to ${playerId}`);
  }
}
