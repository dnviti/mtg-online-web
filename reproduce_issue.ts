
import { RulesEngine } from './src/server/game/RulesEngine';
import { StrictGameState } from './src/server/game/types';
import { ActionHandler } from './src/server/game/engine/ActionHandler';

const mockState: StrictGameState = {
    id: 'test',
    roomId: 'test',
    players: {
        'p1': { id: 'p1', name: 'Player 1', life: 20, handKept: true, manaPool: {} }
    },
    cards: {
        'c1': {
            instanceId: 'c1',
            ownerId: 'p1',
            controllerId: 'p1',
            zone: 'hand',
            name: 'Forest',
            typeLine: 'Basic Land — Forest',
            types: ['Land'],
            subtypes: ['Forest'],
            definition: {
                name: 'Forest',
                type_line: 'Basic Land — Forest',
                types: ['Land'],
                subtypes: ['Forest']
            }
        }
    },
    turnOrder: ['p1'],
    activePlayerId: 'p1',
    priorityPlayerId: 'p1',
    phase: 'main1',
    step: 'main1', // assuming step matches phase roughly or is custom
    stack: [],
    turnCount: 1,
    landsPlayedThisTurn: 0,
    maxZ: 1
} as any;

const engine = new RulesEngine(mockState);

console.log('--- Test 1: Play Land correctly ---');
try {
    engine.playLand('p1', 'c1');
    console.log('Land processed. Zone:', mockState.cards['c1'].zone);
} catch (e) {
    console.error('Play Land Error:', e.message);
}

// Reset
mockState.cards['c1'].zone = 'hand';
mockState.landsPlayedThisTurn = 0;
mockState.cards['c1'].types = ['Land']; // Ensure types present

console.log('\n--- Test 2: Attempt to Cast Land ---');
try {
    engine.castSpell('p1', 'c1');
    console.log('Cast Spell processed (Unexpected). Stack:', mockState.stack.length);
} catch (e) {
    console.log('Cast Spell blocked correctly:', e.message);
}
