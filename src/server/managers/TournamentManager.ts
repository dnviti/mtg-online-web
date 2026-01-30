
import { EventEmitter } from 'events';

export interface TournamentPlayer {
  id: string;
  name: string;
  deck?: any[]; // Snapshot of deck
}

export interface Match {
  id: string; // "round-X-match-Y"
  round: number;
  matchIndex: number; // 0-based index in the round
  player1: TournamentPlayer | null; // Null if bye or waiting for previous match
  player2: TournamentPlayer | null;
  winnerId?: string;
  status: 'pending' | 'ready' | 'in_progress' | 'finished';
  startTime?: number;
  endTime?: number;
  readyPlayers: string[]; // IDs of players who have submitted deck
}

export interface Tournament {
  id: string; // usually roomId
  players: TournamentPlayer[];
  rounds: Match[][]; // Array of rounds, each containing matches
  currentRound: number;
  status: 'setup' | 'active' | 'finished';
  winner?: TournamentPlayer;
}

export class TournamentManager extends EventEmitter {
  // Stateless Manager - operates on passed Tournament object.

  createTournament(roomId: string, players: TournamentPlayer[]): Tournament {
    // 1. Shuffle Players
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    // Guard: Need at least 2 players
    if (shuffled.length < 2) {
      console.warn(`[TournamentManager] Cannot create tournament with ${shuffled.length} players. Need at least 2.`);
      return {
        id: roomId,
        players,
        rounds: [],
        currentRound: 0,
        status: 'finished'
      };
    }

    // 2. Generate Bracket (Single Elimination)
    const total = shuffled.length;
    const size = Math.pow(2, Math.ceil(Math.log2(total)));

    const roster: (TournamentPlayer | null)[] = [...shuffled];
    while (roster.length < size) {
      roster.push(null); // Null = BYE
    }

    const rounds: Match[][] = [];
    let currentSize = size;
    let roundNum = 1;

    while (currentSize > 1) {
      const matchCount = currentSize / 2;
      const roundMatches: Match[] = [];
      for (let i = 0; i < matchCount; i++) {
        roundMatches.push({
          id: `r${roundNum}-m${i}`,
          round: roundNum,
          matchIndex: i,
          player1: null,
          player2: null,
          status: 'pending',
          readyPlayers: []
        });
      }
      rounds.push(roundMatches);
      currentSize = matchCount;
      roundNum++;
    }

    // Fill Round 1
    const r1 = rounds[0];
    for (let i = 0; i < r1.length; i++) {
      r1[i].player1 = roster[i * 2];
      r1[i].player2 = roster[i * 2 + 1];
      r1[i].status = 'ready';
    }

    const t: Tournament = {
      id: roomId,
      players,
      rounds,
      currentRound: 1,
      status: 'active'
    };

    // Auto-resolve Byes
    this.checkAutoResolutions(t);

    return t;
  }

  // Helper
  getMatch(t: Tournament, matchId: string): Match | undefined {
    for (const r of t.rounds) {
      const m = r.find(x => x.id === matchId);
      if (m) return m;
    }
    return undefined;
  }

  // Mutates t
  recordMatchResult(t: Tournament, matchId: string, winnerId: string): Tournament | null {
    const match = this.getMatch(t, matchId);
    if (!match) return null;
    if (match.status === 'finished') return t;

    const winner = (match.player1?.id === winnerId) ? match.player1 : (match.player2?.id === winnerId) ? match.player2 : null;
    if (!winner) {
      if (match.player2 === null && match.player1?.id === winnerId) {
        // ok
      } else if (match.player1 === null && match.player2?.id === winnerId) {
        // ok
      } else {
        console.warn(`Invalid winner ${winnerId} for match ${matchId}`);
        return null;
      }
    }

    match.status = 'finished';
    match.winnerId = winnerId;
    match.endTime = Date.now();

    this.advanceToNextRound(t, match, winnerId);
    this.checkAutoResolutions(t);

    return t;
  }

  private advanceToNextRound(t: Tournament, match: Match, winnerId: string) {
    const nextRoundIdx = match.round; // Match round is 1-based, index is 0-based. So round 1 (idx 0) leads to round 2 (idx 1).
    if (nextRoundIdx >= t.rounds.length) {
      t.status = 'finished';
      t.winner = t.players.find(p => p.id === winnerId);
      return;
    }

    const nextRound = t.rounds[nextRoundIdx];
    const nextMatchIndex = Math.floor(match.matchIndex / 2);
    const nextMatch = nextRound[nextMatchIndex];

    if (!nextMatch) {
      console.error("Critical: Next match not found in bracket logic.");
      return;
    }

    const winner = t.players.find(p => p.id === winnerId);
    if (match.matchIndex % 2 === 0) {
      nextMatch.player1 = winner || null;
    } else {
      nextMatch.player2 = winner || null;
    }

    if (nextMatch.player1 && nextMatch.player2) {
      nextMatch.status = 'ready';
    }
  }

  private checkAutoResolutions(t: Tournament) {
    for (const r of t.rounds) {
      for (const m of r) {
        if (m.status !== 'ready') continue;

        if (m.player1 && !m.player2) {
          console.log(`[Tournament] Auto-resolving Bye for ${m.player1.name} in ${m.id}`);
          this.recordMatchResult(t, m.id, m.player1.id);
          continue;
        }
        if (!m.player1 && m.player2) {
          this.recordMatchResult(t, m.id, m.player2.id);
          continue;
        }

      }
    }
  }

  setMatchReady(t: Tournament, matchId: string, playerId: string, deck: any[]): { bothReady: boolean, decks: Record<string, any[]> } | null {
    const match = this.getMatch(t, matchId);
    if (!match) return null;

    const player = t.players.find(p => p.id === playerId);
    if (player) {
      if (deck && deck.length > 0) {
        player.deck = deck;
      }
    }

    if (!match.readyPlayers.includes(playerId)) {
      match.readyPlayers.push(playerId);
    }

    const p1 = match.player1;
    const p2 = match.player2;

    if (p1 && p2) {
      const p1Ready = match.readyPlayers.includes(p1.id);
      const p2Ready = match.readyPlayers.includes(p2.id);

      if (p1Ready && p2Ready) {
        match.status = 'in_progress';
        const p1Deck = t.players.find(p => p.id === p1.id)?.deck || [];
        const p2Deck = t.players.find(p => p.id === p2.id)?.deck || [];
        return { bothReady: true, decks: { [p1.id]: p1Deck, [p2.id]: p2Deck } };
      }
    }

    return { bothReady: false, decks: {} };
  }
}
