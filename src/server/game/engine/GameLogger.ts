import { StrictGameState, GameLogEntry, CardObject } from '../types';

/**
 * GameLogger
 *
 * Utility class for adding game log entries that will be sent to clients.
 * Log messages use {CardName} syntax for card references that will be
 * rendered with hover previews on the client.
 */
export class GameLogger {

  /**
   * Add a log entry to both the persistent logs and pending logs
   */
  static log(
    state: StrictGameState,
    message: string,
    type: GameLogEntry['type'] = 'info',
    source: string = 'Game',
    cards?: CardObject[]
  ) {
    // Initialize arrays if needed
    if (!state.logs) {
      state.logs = [];
    }
    if (!state.pendingLogs) {
      state.pendingLogs = [];
    }

    const cardRefs = cards?.map(c => ({
      name: c.name,
      imageUrl: c.imageUrl || c.definition?.local_path_full,
      imageArtCrop: c.imageArtCrop || c.definition?.local_path_crop,
      manaCost: c.manaCost || c.definition?.mana_cost,
      typeLine: c.typeLine || c.definition?.type_line,
      oracleText: c.oracleText || c.definition?.oracle_text
    }));

    const logEntry: GameLogEntry = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: Date.now(),
      message,
      type,
      source,
      cards: cardRefs
    };

    // Add to persistent logs (saved with game state)
    state.logs.push(logEntry);

    // Add to pending logs (for real-time emission to clients)
    state.pendingLogs.push(logEntry);
  }

  /**
   * Log a zone change event (card moving between zones)
   */
  static logZoneChange(
    state: StrictGameState,
    card: CardObject,
    fromZone: string,
    toZone: string,
    playerName?: string
  ) {
    const source = playerName || state.players[card.controllerId]?.name || 'Unknown';

    // Format zone names for readability
    const formatZone = (zone: string) => {
      const zoneNames: Record<string, string> = {
        'battlefield': 'battlefield',
        'graveyard': 'graveyard',
        'hand': 'hand',
        'library': 'library',
        'exile': 'exile',
        'stack': 'stack',
        'command': 'command zone'
      };
      return zoneNames[zone] || zone;
    };

    const msg = `{${card.name}} moved from ${formatZone(fromZone)} to ${formatZone(toZone)}`;
    this.log(state, msg, 'zone', source, [card]);
  }

  /**
   * Log when a card enters the battlefield
   */
  static logEntersBattlefield(state: StrictGameState, card: CardObject, playerName?: string) {
    const source = playerName || state.players[card.controllerId]?.name || 'Unknown';
    const msg = `{${card.name}} enters the battlefield`;
    this.log(state, msg, 'action', source, [card]);
  }

  /**
   * Log when a card leaves the battlefield
   */
  static logLeavesBattlefield(state: StrictGameState, card: CardObject, destination: string, reason?: string) {
    const source = state.players[card.controllerId]?.name || 'Game';
    const destName = destination === 'graveyard' ? 'graveyard' :
                     destination === 'exile' ? 'exile' :
                     destination === 'hand' ? 'hand' : destination;

    let msg = `{${card.name}} left the battlefield`;
    if (reason) {
      msg += ` (${reason})`;
    }
    msg += ` -> ${destName}`;

    this.log(state, msg, 'zone', source, [card]);
  }

  /**
   * Log a land play
   */
  static logPlayLand(state: StrictGameState, card: CardObject, playerName: string) {
    const msg = `Played {${card.name}}`;
    this.log(state, msg, 'action', playerName, [card]);
  }

  /**
   * Log a spell cast
   */
  static logCastSpell(state: StrictGameState, card: CardObject, playerName: string, targets?: CardObject[]) {
    let msg = `Cast {${card.name}}`;
    if (targets && targets.length > 0) {
      const targetNames = targets.map(t => `{${t.name}}`).join(', ');
      msg += ` targeting ${targetNames}`;
    }
    this.log(state, msg, 'action', playerName, [card, ...(targets || [])]);
  }

  /**
   * Log combat damage
   */
  static logCombatDamage(state: StrictGameState, attacker: CardObject, target: CardObject | string, damage: number) {
    const attackerName = state.players[attacker.controllerId]?.name || 'Unknown';

    if (typeof target === 'string') {
      // Damage to player
      const playerName = state.players[target]?.name || 'Unknown';
      const msg = `{${attacker.name}} dealt ${damage} damage to ${playerName}`;
      this.log(state, msg, 'combat', attackerName, [attacker]);
    } else {
      // Damage to creature
      const msg = `{${attacker.name}} dealt ${damage} damage to {${target.name}}`;
      this.log(state, msg, 'combat', attackerName, [attacker, target]);
    }
  }

  /**
   * Log creature death
   */
  static logCreatureDied(state: StrictGameState, card: CardObject, reason: string) {
    const source = state.players[card.controllerId]?.name || 'Game';
    const msg = `{${card.name}} died (${reason})`;
    this.log(state, msg, 'zone', source, [card]);
  }

  /**
   * Log token creation
   */
  static logTokenCreated(state: StrictGameState, token: CardObject, playerName: string) {
    const msg = `Created {${token.name}} token`;
    this.log(state, msg, 'action', playerName, [token]);
  }

  /**
   * Log attacker declaration
   */
  static logDeclareAttacker(state: StrictGameState, attacker: CardObject, playerName: string) {
    const msg = `{${attacker.name}} attacks`;
    this.log(state, msg, 'combat', playerName, [attacker]);
  }

  /**
   * Log blocker declaration
   */
  static logDeclareBlocker(state: StrictGameState, blocker: CardObject, attacker: CardObject, playerName: string) {
    const msg = `{${blocker.name}} blocks {${attacker.name}}`;
    this.log(state, msg, 'combat', playerName, [blocker, attacker]);
  }

  /**
   * Log counter added/removed
   */
  static logCounterChange(state: StrictGameState, card: CardObject, counterType: string, amount: number, playerName: string) {
    const action = amount > 0 ? 'added' : 'removed';
    const absAmount = Math.abs(amount);
    const plural = absAmount !== 1 ? 's' : '';
    const msg = `${action} ${absAmount} ${counterType} counter${plural} on {${card.name}}`;
    this.log(state, msg, 'action', playerName, [card]);
  }

  /**
   * Log phase change
   */
  static logPhaseChange(state: StrictGameState, phase: string, step?: string) {
    const playerName = state.players[state.activePlayerId]?.name || 'Unknown';
    const stepText = step ? ` - ${step}` : '';
    const msg = `${phase}${stepText}`;
    this.log(state, msg, 'info', playerName);
  }

  /**
   * Log turn change
   */
  static logTurnChange(state: StrictGameState, playerName: string, turnNumber: number) {
    const msg = `Turn ${turnNumber}`;
    this.log(state, msg, 'info', playerName);
  }

  /**
   * Log spell countered
   */
  static logSpellCountered(state: StrictGameState, card: CardObject) {
    const msg = `{${card.name}} was countered`;
    this.log(state, msg, 'action', 'Game', [card]);
  }

  /**
   * Log damage dealt (non-combat)
   */
  static logDamageDealt(state: StrictGameState, source: CardObject, targetName: string, damage: number) {
    const sourceName = state.players[source.controllerId]?.name || 'Unknown';
    const msg = `{${source.name}} dealt ${damage} damage to ${targetName}`;
    this.log(state, msg, 'action', sourceName, [source]);
  }

  /**
   * Log board wipe
   */
  static logBoardWipe(state: StrictGameState, source: CardObject, count: number) {
    const sourceName = state.players[source.controllerId]?.name || 'Unknown';
    const msg = `{${source.name}} destroyed ${count} permanent(s)`;
    this.log(state, msg, 'action', sourceName, [source]);
  }

  /**
   * Log destruction effect
   */
  static logDestroy(state: StrictGameState, source: CardObject, target: CardObject) {
    const sourceName = state.players[source.controllerId]?.name || 'Unknown';
    const msg = `{${source.name}} destroyed {${target.name}}`;
    this.log(state, msg, 'action', sourceName, [source, target]);
  }

  /**
   * Log exile effect
   */
  static logExile(state: StrictGameState, source: CardObject, target: CardObject) {
    const sourceName = state.players[source.controllerId]?.name || 'Unknown';
    const msg = `{${source.name}} exiled {${target.name}}`;
    this.log(state, msg, 'action', sourceName, [source, target]);
  }

  /**
   * Log bounce effect (return to hand)
   */
  static logBounce(state: StrictGameState, source: CardObject, target: CardObject) {
    const sourceName = state.players[source.controllerId]?.name || 'Unknown';
    const msg = `{${source.name}} returned {${target.name}} to its owner's hand`;
    this.log(state, msg, 'action', sourceName, [source, target]);
  }

  /**
   * Log pump effect (+X/+X)
   */
  static logPump(state: StrictGameState, source: CardObject, target: CardObject, power: number, toughness: number) {
    const sourceName = state.players[source.controllerId]?.name || 'Unknown';
    const sign = (n: number) => n >= 0 ? `+${n}` : `${n}`;
    const msg = `{${source.name}} gave {${target.name}} ${sign(power)}/${sign(toughness)}`;
    this.log(state, msg, 'action', sourceName, [source, target]);
  }

  /**
   * Log card draw effect
   */
  static logDraw(state: StrictGameState, source: CardObject, playerName: string, count: number) {
    const sourceName = state.players[source.controllerId]?.name || 'Unknown';
    const plural = count !== 1 ? 's' : '';
    const msg = `{${source.name}} caused ${playerName} to draw ${count} card${plural}`;
    this.log(state, msg, 'action', sourceName, [source]);
  }

  /**
   * Log life gain
   */
  static logLifeGain(state: StrictGameState, source: CardObject, playerName: string, amount: number) {
    const sourceName = state.players[source.controllerId]?.name || 'Unknown';
    const msg = `{${source.name}} caused ${playerName} to gain ${amount} life`;
    this.log(state, msg, 'action', sourceName, [source]);
  }

  /**
   * Log tap effect
   */
  static logTap(state: StrictGameState, source: CardObject, target: CardObject) {
    const sourceName = state.players[source.controllerId]?.name || 'Unknown';
    const msg = `{${source.name}} tapped {${target.name}}`;
    this.log(state, msg, 'action', sourceName, [source, target]);
  }

  /**
   * Clear pending logs (call after sending to clients)
   */
  static clearPendingLogs(state: StrictGameState) {
    state.pendingLogs = [];
  }

  /**
   * Get and clear pending logs
   */
  static flushLogs(state: StrictGameState): GameLogEntry[] {
    const logs = state.pendingLogs || [];
    state.pendingLogs = [];
    return logs;
  }
}
