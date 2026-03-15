// src/utils/deckManager.ts
import type { Card, Suit, CardValue } from '../types/game';

const SUITS: Suit[] = ['spade', 'heart', 'diamond', 'club'];
const VALUES: CardValue[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// 카드 텍스트를 기반으로 기본 점수(score)를 반환하는 헬퍼 함수
const getCardScore = (value: CardValue): number => {
    if (value === 'A') return 1; // Ace는 기본 1로 계산 (이후 gameLogic에서 11로 변환 가능성 체크)
    if (['J', 'Q', 'K'].includes(value)) return 10;
    return parseInt(value, 10);
};

// 104장(52장 * 2덱)의 카드를 생성하는 함수
export const generateDeck = (): Card[] => {
    const deck: Card[] = [];
    for (let i = 0; i < 2; i++) { // 2벌의 덱
        SUITS.forEach((suit) => {
            VALUES.forEach((value) => {
                deck.push({
                    suit,
                    value,
                    score: getCardScore(value),
                });
            });
        });
    }
    return deck;
};

// 피셔-예이츠(Fisher-Yates) 알고리즘을 사용한 완벽한 덱 셔플 함수
export const shuffleDeck = (deck: Card[]): Card[] => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};
