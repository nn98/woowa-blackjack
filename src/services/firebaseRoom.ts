// src/services/firebaseRoom.ts
import { ref, get, set, onValue, off, update, increment, push, child } from 'firebase/database';
import { db } from './firebase';
import { generateDeck, shuffleDeck } from '../utils/deckManager';
import { calculateTotalScore } from '../utils/gameLogic';
import type { Room as RoomType, User } from '../types/game';

export const initGameDatabase = async () => {
    const snapshot = await get(ref(db, 'rooms'));
    if (!snapshot.exists()) {
        const initialRooms: Record<string, any> = {};
        for (let i = 1; i <= 6; i++) {
            initialRooms[`room_${i}`] = { id: `room_${i}`, status: 'WAITING', hostEmail: '', dealer: { cards: [], score: 0, isBust: false }, players: {}, deck: [] };
        }
        await set(ref(db, 'rooms'), initialRooms);

        // [신규] 카지노 전체 전역 통계 노드 생성 (글로벌 딜러 손익)
        await set(ref(db, 'casinoStats'), { globalDealerPnL: 0 });

        const participants = [
            { nickname: '글렌', email: 'jkllhgb@gmail.com' }, { nickname: '시오', email: 'mathasdf0@gmail.com' }, { nickname: '아이큐', email: 'ark182818@gmail.com' }, { nickname: '에버', email: 'galmeagi2@gmail.com' },
            { nickname: '영기', email: 'cla12093@gmail.com' }, { nickname: '우디', email: 'armd479@gmail.com' }, { nickname: '제이콥', email: 'khcho1492@gmail.com' }, { nickname: '제이크', email: 'kde2800623@gmail.com' },
            { nickname: '캐리', email: 'ksc73450056@gmail.com' }, { nickname: '캐모', email: 'jjason0904@gmail.com' }, { nickname: '티뉴', email: 'johnprk1993@gmail.com' }, { nickname: '티모', email: 'dbsghwns1209@gmail.com' },
            { nickname: '티온', email: 'kys990814@gmail.com' }, { nickname: '나무', email: 'symflee@gmail.com' }, { nickname: '라이', email: 'dahye90110@gmail.com' }, { nickname: '레서', email: 'seunggyuhan0423@gmail.com' },
            { nickname: '루디', email: 'sunwoo005@gmail.com' }, { nickname: '보예', email: 'new.sumyang@gmail.com' }, { nickname: '봉구스', email: 'ypungkyu0317@gmail.com' }, { nickname: '서여', email: 'parkseongyeol2110@gmail.com' },
            { nickname: '고래', email: 'rkdalswoals@gmail.com' }, { nickname: '그해', email: 'khyej.h@gmail.com' }, { nickname: '리사', email: 'lisa@woowahan.com' }, { nickname: '구구', email: 'gugu@woowahan.com' }
        ];

        const initialUsers: Record<string, any> = {};
        participants.forEach(p => {
            const emailKey = p.email.replace(/\./g, '_');
            initialUsers[emailKey] = { email: p.email, nickname: p.nickname, credit: 1000, maxCredit: 1000 };
        });
        await set(ref(db, 'users'), initialUsers);
    }
};

export const forceResetAllRooms = async () => {
    const updates: Record<string, any> = {};
    for (let i = 1; i <= 6; i++) {
        const roomId = `room_${i}`;
        updates[`rooms/${roomId}/status`] = 'WAITING';
        updates[`rooms/${roomId}/hostEmail`] = '';
        updates[`rooms/${roomId}/dealer`] = { cards: [], score: 0, isBust: false };
        updates[`rooms/${roomId}/players`] = null;
        updates[`rooms/${roomId}/deck`] = [];
        updates[`rooms/${roomId}/activePlayerEmail`] = '';
        updates[`rooms/${roomId}/skipVotes`] = null;
    }
    // [수정] 강제 초기화 시 글로벌 손익도 0으로 초기화할지 여부 (필요 시 주석 해제)
    // updates[`casinoStats/globalDealerPnL`] = 0;
    await update(ref(db), updates);
};

export const subscribeToRooms = (onUpdate: (rooms: RoomType[]) => void) => {
    const unsubscribe = onValue(ref(db, 'rooms'), (snapshot) => {
        if (snapshot.exists()) onUpdate(Object.values(snapshot.val()));
    });
    return () => off(ref(db, 'rooms'), 'value', unsubscribe);
};

export const validateLogin = async (email: string, nickname: string): Promise<User | null> => {
    const snap = await get(ref(db, `users/${email.replace(/\./g, '_')}`));
    if (snap.exists() && snap.val().nickname === nickname) return snap.val();
    return null;
};

export const joinRoom = async (roomId: string, user: User) => {
    const emailKey = user.email.replace(/\./g, '_');
    const roomSnap = await get(ref(db, `rooms/${roomId}`));
    const roomData = roomSnap.val() as RoomType;
    const updates: Record<string, any> = {};

    if (!roomData.hostEmail) updates[`rooms/${roomId}/hostEmail`] = emailKey;

    updates[`rooms/${roomId}/players/${emailKey}`] = {
        nickname: user.nickname, credit: user.credit, betAmount: 0, cards: [], visibleCards: 1, status: 'READY', score: 0, isReady: false, joinedAt: Date.now()
    };
    await update(ref(db), updates);
};

export const leaveRoom = async (roomId: string, userEmail: string) => {
    const emailKey = userEmail.replace(/\./g, '_');
    const roomRef = ref(db, `rooms/${roomId}`);
    const roomSnap = await get(roomRef);

    if (!roomSnap.exists()) return;

    const roomData = roomSnap.val();
    const players = roomData.players || {};
    const remainingPlayerKeys = Object.keys(players).filter(k => k !== emailKey);

    if (remainingPlayerKeys.length === 0) {
        await update(roomRef, {
            status: 'WAITING',
            hostEmail: '',
            dealer: { cards: [], score: 0, isBust: false },
            players: null,
            deck: [],
            activePlayerEmail: '',
            skipVotes: null
        });
    } else {
        const updates: Record<string, any> = {};
        updates[`players/${emailKey}`] = null;
        updates[`skipVotes/${emailKey}`] = null;

        if (roomData.hostEmail === emailKey) {
            updates['hostEmail'] = remainingPlayerKeys[0];
        }

        if (roomData.activePlayerEmail === emailKey) {
            const idx = Object.keys(players).indexOf(emailKey);
            let nextActive = '';
            const keys = Object.keys(players);
            for (let i = idx + 1; i < keys.length; i++) {
                if (players[keys[i]].status === 'PLAYING') { nextActive = keys[i]; break; }
            }
            updates['activePlayerEmail'] = nextActive;
        }
        await update(roomRef, updates);
    }
};

export const toggleReady = (roomId: string, userEmail: string, isReady: boolean) => {
    set(ref(db, `rooms/${roomId}/players/${userEmail.replace(/\./g, '_')}/isReady`), isReady);
};

export const changeRoomStatus = (roomId: string, status: string) => {
    set(ref(db, `rooms/${roomId}/status`), status);
};

export const submitBet = (roomId: string, userEmail: string, amount: number, credit: number) => {
    const key = userEmail.replace(/\./g, '_');
    const finalCredit = credit - amount;
    update(ref(db), {
        [`rooms/${roomId}/players/${key}/betAmount`]: amount,
        [`rooms/${roomId}/players/${key}/credit`]: finalCredit,
        [`users/${key}/credit`]: finalCredit
    });
};

export const dealInitialCards = async (roomId: string, roomData: RoomType) => {
    const deck = shuffleDeck(generateDeck());
    const updates: Record<string, any> = {};
    updates[`rooms/${roomId}/dealer/cards`] = [deck.pop()];
    Object.keys(roomData.players || {}).forEach(key => {
        updates[`rooms/${roomId}/players/${key}/cards`] = [deck.pop(), deck.pop()];
        updates[`rooms/${roomId}/players/${key}/status`] = 'DECIDING';
    });
    updates[`rooms/${roomId}/deck`] = deck;
    updates[`rooms/${roomId}/status`] = 'PRE_DECISION';
    await update(ref(db), updates);
};

export const submitPreDecision = async (roomId: string, email: string, isContinue: boolean, credit: number, bet: number) => {
    const key = email.replace(/\./g, '_');
    const updates: Record<string, any> = {};
    if (isContinue) updates[`rooms/${roomId}/players/${key}/status`] = 'CONTINUE';
    else {
        const finalCredit = credit + (bet / 2);
        updates[`rooms/${roomId}/players/${key}/status`] = 'SURRENDER';
        updates[`rooms/${roomId}/players/${key}/credit`] = finalCredit;
        updates[`users/${key}/credit`] = finalCredit;

        // [수정] Surrender 시 전역(Global) 딜러 손익 누적
        updates[`casinoStats/globalDealerPnL`] = increment(bet / 2);

        const userSnap = await get(ref(db, `users/${key}`));
        if (userSnap.exists()) {
            const maxC = userSnap.val().maxCredit || 1000;
            if (finalCredit > maxC) updates[`users/${key}/maxCredit`] = finalCredit;
        }
    }
    update(ref(db), updates);
};

export const startPlayingPhase = async (roomId: string, roomData: RoomType) => {
    const updates: Record<string, any> = {};
    let firstActive = '';
    Object.entries(roomData.players || {}).forEach(([key, p]) => {
        if (p.status === 'CONTINUE') {
            const score = calculateTotalScore((p.cards || []).slice(0, 2));
            updates[`rooms/${roomId}/players/${key}/visibleCards`] = 2;
            if (score === 21) updates[`rooms/${roomId}/players/${key}/status`] = 'STAND';
            else {
                updates[`rooms/${roomId}/players/${key}/status`] = 'PLAYING';
                if (!firstActive) firstActive = key;
            }
        }
    });
    updates[`rooms/${roomId}/status`] = 'PLAYING';
    updates[`rooms/${roomId}/activePlayerEmail`] = firstActive;
    await update(ref(db), updates);
};

export const playerAction = async (roomId: string, roomData: RoomType, email: string, action: 'HIT' | 'STAND') => {
    const key = email.replace(/\./g, '_');
    const player = roomData.players[key];
    const deck = [...roomData.deck];
    const cards = [...(player.cards || [])];
    let status = player.status;

    if (action === 'HIT') {
        cards.push(deck.pop()!);
        const score = calculateTotalScore(cards);
        if (score > 21) status = 'BUST';
        else if (score === 21) status = 'STAND';
    } else status = 'STAND';

    const updates: Record<string, any> = {};
    updates[`rooms/${roomId}/deck`] = deck;
    updates[`rooms/${roomId}/players/${key}/cards`] = cards;
    updates[`rooms/${roomId}/players/${key}/visibleCards`] = cards.length;
    updates[`rooms/${roomId}/players/${key}/status`] = status;

    if (status === 'BUST' || status === 'STAND') {
        const keys = Object.keys(roomData.players);
        const idx = keys.indexOf(key);
        let next = '';
        for (let i = idx + 1; i < keys.length; i++) {
            if (roomData.players[keys[i]].status === 'PLAYING') { next = keys[i]; break; }
        }
        updates[`rooms/${roomId}/activePlayerEmail`] = next;
    }
    await update(ref(db), updates);
};

export const voteSkip = async (roomId: string, userEmail: string) => {
    const emailKey = userEmail.replace(/\./g, '_');
    await update(ref(db), {
        [`rooms/${roomId}/skipVotes/${emailKey}`]: true
    });
};

export const resetToWaiting = async (roomId: string) => {
    const roomSnap = await get(ref(db, `rooms/${roomId}`));
    if (!roomSnap.exists()) return;
    const roomData = roomSnap.val() as RoomType;
    if (roomData.status !== 'RESULT') return;
    const resetUpdates: Record<string, any> = {};
    resetUpdates[`rooms/${roomId}/status`] = 'WAITING';
    resetUpdates[`rooms/${roomId}/dealer`] = { cards: [], score: 0, isBust: false };
    resetUpdates[`rooms/${roomId}/deck`] = [];
    resetUpdates[`rooms/${roomId}/activePlayerEmail`] = '';
    resetUpdates[`rooms/${roomId}/skipVotes`] = null;

    Object.keys(roomData.players || {}).forEach(k => {
        const cp = roomData.players[k];
        if (cp.status !== 'SPECTATING') {
            resetUpdates[`rooms/${roomId}/players/${k}/isReady`] = false;
            resetUpdates[`rooms/${roomId}/players/${k}/status`] = 'READY';
            resetUpdates[`rooms/${roomId}/players/${k}/betAmount`] = 0;
            resetUpdates[`rooms/${roomId}/players/${k}/cards`] = [];
            resetUpdates[`rooms/${roomId}/players/${k}/visibleCards`] = 1;
            resetUpdates[`rooms/${roomId}/players/${k}/score`] = 0;
        }
    });
    await update(ref(db), resetUpdates);
};

export const executeDealerAndResult = async (roomId: string, roomData: RoomType) => {
    await changeRoomStatus(roomId, 'DEALER_TURN');
    const deck = [...roomData.deck];
    const dealerCards = [...(roomData.dealer.cards || [])];
    while (calculateTotalScore(dealerCards) <= 16) { dealerCards.push(deck.pop()!); }

    const dScore = calculateTotalScore(dealerCards);
    const updates: Record<string, any> = {};
    updates[`rooms/${roomId}/dealer/cards`] = dealerCards;
    updates[`rooms/${roomId}/dealer/score`] = dScore;
    updates[`rooms/${roomId}/status`] = 'RESULT';

    const userSnap = await get(ref(db, 'users'));
    const usersData = userSnap.exists() ? userSnap.val() : {};

    let dealerRoundProfit = 0;
    const historyPlayers: Record<string, any> = {};

    Object.entries(roomData.players || {}).forEach(([key, p]) => {
        if (p.status === 'STAND' || p.status === 'PLAYING' || p.status === 'BUST') {
            const pScore = calculateTotalScore(p.cards || []);
            const pBJ = pScore === 21 && (p.cards || []).length === 2;
            const dBJ = dScore === 21 && dealerCards.length === 2;
            let reward = 0;

            if (p.status !== 'BUST') {
                if (pBJ && dBJ) reward = p.betAmount;
                else if (pBJ && !dBJ) reward = p.betAmount * 2.5;
                else if (!pBJ && dBJ) reward = 0;
                else if (dScore > 21 || pScore > dScore) reward = p.betAmount * 2;
                else if (pScore === dScore) reward = p.betAmount;
            }

            const netProfitForDealer = p.betAmount - reward;
            dealerRoundProfit += netProfitForDealer;

            historyPlayers[key] = {
                nickname: p.nickname,
                status: p.status,
                bet: p.betAmount,
                reward: reward,
                netProfit: reward - p.betAmount,
                score: pScore
            };

            const finalCredit = p.credit + reward;
            updates[`rooms/${roomId}/players/${key}/credit`] = finalCredit;
            updates[`users/${key}/credit`] = finalCredit;

            const maxC = usersData[key]?.maxCredit || 1000;
            if (finalCredit > maxC) updates[`users/${key}/maxCredit`] = finalCredit;

        } else if (p.status === 'SURRENDER') {
            historyPlayers[key] = {
                nickname: p.nickname,
                status: 'SURRENDER',
                bet: p.betAmount,
                reward: p.betAmount / 2,
                netProfit: -(p.betAmount / 2),
                score: calculateTotalScore((p.cards || []).slice(0, 2))
            };
        }
    });

    // [수정] 라운드 종료 시 발생한 딜러 손익을 전역(Global) 노드에 누적 반영
    if (dealerRoundProfit !== 0) {
        updates[`casinoStats/globalDealerPnL`] = increment(dealerRoundProfit);
    }

    const historyKey = push(child(ref(db), `gameHistory/${roomId}`)).key;
    updates[`gameHistory/${roomId}/${historyKey}`] = {
        timestamp: Date.now(),
        dealerRoundProfit: dealerRoundProfit,
        dealer: { score: dScore, isBust: dScore > 21 },
        players: historyPlayers
    };

    await update(ref(db), updates);

    setTimeout(() => { resetToWaiting(roomId); }, 7000);
};
