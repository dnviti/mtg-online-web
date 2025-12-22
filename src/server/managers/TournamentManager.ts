
import { EventEmitter } from 'events';

export interface TournamentPlayer {
  id: string;
  name: string;
  isBot: boolean;
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
  private tournaments: Map<string, Tournament> = new Map();

  createTournament(roomId: string, players: TournamentPlayer[]): Tournament {
    // 1. Shuffle Players
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    // 2. Generate Bracket (Single Elimination)
    // Calc next power of 2
    const total = shuffled.length;
    const size = Math.pow(2, Math.ceil(Math.log2(total)));
    // const byes = size - total;

    // Distribute byes? Simple method: Add "Bye" players, then resolved them immediately.
    // Actually, let's keep it robust.
    // Round 1:


    // Proper Roster with Byes
    const roster: (TournamentPlayer | null)[] = [...shuffled];
    while (roster.length < size) {
      roster.push(null); // Null = BYE
    }

    // Create Rounds recursively? Or just Round 1 and empty slots for others?
    // Let's pre-allocate the structure
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
      r1[i].status = 'ready'; // Potential auto-resolve if Bye
    }

    const t: Tournament = {
      id: roomId,
      players,
      rounds,
      currentRound: 1,
      status: 'active'
    };

    this.tournaments.set(roomId, t);

    // Auto-resolve Byes and potentially Bot vs Bot in Round 1
    this.checkAutoResolutions(t);

    return t;
  }

  getTournament(roomId: string): Tournament | undefined {
    return this.tournaments.get(roomId);
  }

  // Called when a game ends or a Bye is processed
  recordMatchResult(roomId: string, matchId: string, winnerId: string): Tournament | null {
    const t = this.tournaments.get(roomId);
    if (!t) return null;

    // Find match
    let match: Match | undefined;
    for (const r of t.rounds) {
      match = r.find(m => m.id === matchId);
      if (match) break;
    }

    if (!match) return null;
    if (match.status === 'finished') return t; // Already done

    // Verify winner is part of match
    const winner = (match.player1?.id === winnerId) ? match.player1 : (match.player2?.id === winnerId) ? match.player2 : null;
    if (!winner) {
      // Maybe it was a Bye resolution where winnerId is valid?
      // If bye, player2 is null, winner is player1.
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

    // Advance Winner to Next Round
    this.advanceToNextRound(t, match, winnerId);

    // Trigger further auto-resolutions (e.g. if next match is now Bot vs Bot)
    this.checkAutoResolutions(t);

    return t;
  }

  private advanceToNextRound(t: Tournament, match: Match, winnerId: string) {
    // Logic: Match M in Round R feeds into Match floor(M/2) in Round R+1
    // If M is even (0, 2), it is Player 1 of next match. 
    // If M is odd (1, 3), it is Player 2 of next match.

    const nextRoundIdx = match.round; // rounds is 0-indexed array, so round 1 is at index 0. Next round is at index 1.
    // Wait, I stored round as 1-based in Match interface.
    // rounds[0] = Make Round 1
    // rounds[1] = Make Round 2

    if (nextRoundIdx >= t.rounds.length) {
      // Tournament Over
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

    // Determine slot
    const winner = t.players.find(p => p.id === winnerId);
    if (match.matchIndex % 2 === 0) {
      nextMatch.player1 = winner || null;
    } else {
      nextMatch.player2 = winner || null;
    }

    // Check if next match is now ready
    if (nextMatch.player1 && nextMatch.player2) {
      nextMatch.status = 'ready';
    }
    // If one is BYE (null)? 
    // My roster logic filled byes as nulls. 
    // If we have a Bye in Step 1, it resolves.
    // In later rounds, null means "Waiting for opponent".
    // So status remains 'pending'.
  }

  private checkAutoResolutions(t: Tournament) {


    // Currently we check ALL rounds because a fast resolution might cascade
    for (const r of t.rounds) {
      for (const m of r) {
        if (m.status !== 'ready') continue;

        // 1. Check Byes (Player vs Null)
        if (m.player1 && !m.player2) {
          console.log(`[Tournament] Auto-resolving Bye for ${m.player1.name} in ${m.id}`);
          this.recordMatchResult(t.id, m.id, m.player1.id);
          continue;
        }
        // (Should not happen with my filler logic, but symetrically)
        if (!m.player1 && m.player2) {
          this.recordMatchResult(t.id, m.id, m.player2.id);
          continue;
        }

        // 2. Check Bot vs Bot
        if (m.player1?.isBot && m.player2?.isBot) {
          // Coin flip
          const winner = Math.random() > 0.5 ? m.player1 : m.player2;
          console.log(`[Tournament] Auto-resolving Bot Match ${m.id}: ${m.player1.name} vs ${m.player2.name} -> Winner: ${winner.name}`);
          this.recordMatchResult(t.id, m.id, winner.id);
        }
      }
    }
  }

  // For frontend to know connection status
  getMatch(t: Tournament, matchId: string): Match | undefined {
    for (const r of t.rounds) {
      const m = r.find(x => x.id === matchId);
      if (m) return m;
    }
    return undefined;
  }

  setMatchReady(roomId: string, matchId: string, playerId: string, deck: any[]): { bothReady: boolean, decks: Record<string, any[]> } | null {
    const t = this.getTournament(roomId);
    if (!t) return null;

    const match = this.getMatch(t, matchId);
    if (!match) return null;

    // Update Player Deck in Tournament Roster
    const player = t.players.find(p => p.id === playerId);
    if (player) {
      player.deck = deck;
    }

    // Add to Ready
    if (!match.readyPlayers.includes(playerId)) {
      match.readyPlayers.push(playerId);
    }

    // Check if both ready
    const p1 = match.player1;
    const p2 = match.player2;

    if (p1 && p2) {
      const p1Ready = p1.isBot || match.readyPlayers.includes(p1.id);
      const p2Ready = p2.isBot || match.readyPlayers.includes(p2.id);

      if (p1Ready && p2Ready) {
        match.status = 'in_progress'; // lock it
        // Return decks
        const p1Deck = t.players.find(p => p.id === p1.id)?.deck || [];
        const p2Deck = t.players.find(p => p.id === p2.id)?.deck || [];
        return { bothReady: true, decks: { [p1.id]: p1Deck, [p2.id]: p2Deck } };
      }
    }

    return { bothReady: false, decks: {} };
  }
}
