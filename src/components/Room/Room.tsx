// src/components/Room/Room.tsx
import { useEffect, useState } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { db } from '../../services/firebase';
import { joinRoom, leaveRoom, toggleReady, changeRoomStatus, submitBet, dealInitialCards, submitPreDecision, startPlayingPhase, playerAction, executeDealerAndResult, resetToWaiting, voteSkip } from '../../services/firebaseRoom';
import { calculateTotalScore } from '../../utils/gameLogic';
import { useGameStore } from '../../store/gameStore';
import type { Room as RoomType } from '../../types/game';
import { Box, Typography, Button, Paper, Stack, Snackbar, Alert, Divider } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import PersonIcon from '@mui/icons-material/Person';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';

const getCardImageUrl = (suit: string, value: string) => {
    const suitChar = suit.charAt(0).toUpperCase();
    const valueChar = value === '10' ? '0' : value;
    return `https://deckofcardsapi.com/static/img/${valueChar}${suitChar}.png`;
};
const CARD_BACK_URL = "https://deckofcardsapi.com/static/img/back.png";

const MINT = '#0CEFD3';
const DARK_BG = '#121212';
const TABLE_BG = '#11221b';
const PANEL_BG = '#1e272e';

const getRomanName = (roomId: string) => {
    const num = parseInt(roomId.split('_')[1], 10);
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI'][num - 1] || num;
    return `테이블 ${roman}`;
};

const chipColors = { 500: '#8e44ad', 100: '#2c3e50', 50: '#2980b9', 10: '#27ae60' };

const renderPokerChips = (amount: number, scale = 1) => {
    if (amount === 0) return null;
    let remaining = amount;
    const chips: number[] = [];
    [500, 100, 50, 10].forEach(val => { while (remaining >= val) { chips.push(val); remaining -= val; } });

    return (
        <Box sx={{ position: 'relative', height: 40 * scale, width: 40 * scale, mx: 'auto', mt: 1 }}>
            {chips.map((val, i) => (
                <motion.div key={i} initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5, delay: i * 0.05 }}
                            style={{
                                position: 'absolute', bottom: i * (4 * scale), left: 0, width: 40 * scale, height: 40 * scale, borderRadius: '50%',
                                backgroundColor: chipColors[val as keyof typeof chipColors], border: `${2 * scale}px dashed white`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontWeight: 'bold', fontSize: `${0.6 * scale}rem`, boxShadow: '0 4px 6px rgba(0,0,0,0.6)', zIndex: i
                            }}>
                    {val}
                </motion.div>
            ))}
        </Box>
    );
};

const InteractiveChip = ({ value, color, onClick }: { value: string | number, color: string, onClick: () => void }) => (
    <Box component={motion.div} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onClick}
         sx={{ width: 50, height: 50, borderRadius: '50%', bgcolor: color, border: '3px dashed white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.5)' }}>
        {value}
    </Box>
);

const getDealerStateImage = (status: string, outcomeColor: string, isDealerBJ: boolean) => {
    if (status === 'WAITING' || status === 'BETTING') return '/dealer_waiting.png';
    if (status === 'RESULT') {
        if (isDealerBJ) return '/dealer_blackjack.png';
        if (outcomeColor === MINT) return '/dealer_defeat.png';
        if (outcomeColor === '#ff4757') return '/dealer_win.png';
        return '/dealer_draw.png';
    }
    return '/dealer_playing.png';
};

export default function Room() {
    const currentUser = useGameStore((state) => state.currentUser);
    const setCurrentUser = useGameStore((state) => state.setCurrentUser);
    const currentRoomInfo = useGameStore((state) => state.currentRoom);
    const setCurrentRoom = useGameStore((state) => state.setCurrentRoom);

    const [roomData, setRoomData] = useState<RoomType | null>(null);
    const [betInput, setBetInput] = useState<number>(0);
    const [toast, setToast] = useState({ open: false, msg: '', severity: 'error' as 'error' | 'success' | 'warning' });

    const showToast = (msg: string, severity: 'error' | 'success' | 'warning' = 'warning') => setToast({ open: true, msg, severity });

    const currentUserEmail = currentUser?.email;
    const roomId = currentRoomInfo?.id;

    useEffect(() => {
        if (!currentUserEmail || !roomId) return;
        const initialUser = useGameStore.getState().currentUser;
        if (initialUser) joinRoom(roomId, initialUser);

        const unsubscribe = onValue(ref(db, `rooms/${roomId}`), (snapshot) => {
            if (snapshot.exists()) setRoomData(snapshot.val() as RoomType);
        });

        return () => {
            off(ref(db, `rooms/${roomId}`), 'value', unsubscribe);
            leaveRoom(roomId, currentUserEmail);
        };
    }, [currentUserEmail, roomId]);

    useEffect(() => {
        if (!roomData || !currentUserEmail || !roomData.players) return;
        const emailKey = currentUserEmail.replace(/\./g, '_');
        const isHost = roomData.hostEmail === emailKey;
        const players = Object.values(roomData.players);
        const activePlayers = players.filter(p => p.status !== 'SPECTATING');

        if (roomData.status === 'RESULT') {
            const skipVotesCount = Object.keys((roomData as any).skipVotes || {}).length;
            const requiredVotes = Math.floor(activePlayers.length / 2) + 1;
            if (skipVotesCount >= requiredVotes && isHost) resetToWaiting(roomData.id);
        }

        if (roomData.status === 'WAITING' && activePlayers.length > 0 && activePlayers.every(p => p.isReady)) {
            changeRoomStatus(roomData.id, 'BETTING');
        }
        if (roomData.status === 'BETTING' && activePlayers.length > 0 && activePlayers.every(p => p.betAmount > 0)) {
            dealInitialCards(roomData.id, roomData);
        }
        if (roomData.status === 'PRE_DECISION' && players.every(p => p.status !== 'DECIDING' && p.status !== 'READY')) {
            startPlayingPhase(roomData.id, roomData);
        }
        if (roomData.status === 'PLAYING' && !roomData.activePlayerEmail) {
            executeDealerAndResult(roomData.id, roomData);
        }
    }, [roomData, currentUserEmail]);

    useEffect(() => {
        if (roomData && currentUserEmail) {
            const emailKey = currentUserEmail.replace(/\./g, '_');
            const myPlayerData = roomData.players ? roomData.players[emailKey] : null;
            if (myPlayerData && currentUser && myPlayerData.credit !== currentUser.credit) {
                setCurrentUser({ ...currentUser, credit: myPlayerData.credit });
            }
        }
    }, [roomData, currentUserEmail, currentUser, setCurrentUser]);

    useEffect(() => { if (roomData?.status === 'BETTING') setBetInput(0); }, [roomData?.status]);

    if (!roomData || !currentUser) return <Box sx={{ p: 3, color: 'white' }}>로딩 중...</Box>;

    const emailKey = currentUser.email.replace(/\./g, '_');
    const isHost = roomData.hostEmail === emailKey;
    const isMyTurn = roomData.activePlayerEmail === emailKey && roomData.status === 'PLAYING';
    const myPlayerData = roomData.players ? roomData.players[emailKey] : null;

    const sortedPlayers = roomData.players
        ? Object.entries(roomData.players).sort(([, a], [, b]) => ((a as any).joinedAt || 0) - ((b as any).joinedAt || 0))
        : [];

    const handleAddBet = (amount: number, maxCredit: number) => {
        if (betInput + amount <= maxCredit) setBetInput(prev => prev + amount);
        else showToast('보유 크레딧을 초과할 수 없습니다!', 'error');
    };

    const canLeave = roomData.status === 'WAITING';

    const handleLeaveRoom = async () => {
        if (!canLeave) { showToast('게임 진행 중에는 나갈 수 없습니다.', 'warning'); return; }
        if (roomId && currentUserEmail) {
            await leaveRoom(roomId, currentUserEmail);
        }
        setCurrentRoom(null);
    };

    const dScoreGlobal = roomData.dealer?.score || 0;
    const isDBJGlobal = dScoreGlobal === 21 && (roomData.dealer?.cards || []).length === 2;

    let outcomeMainTxt = ''; let outcomeSubTxt = ''; let profitStr = ''; let outcomeColor = '#fff';
    if (roomData.status === 'RESULT' && myPlayerData) {
        const myCards = myPlayerData.cards || [];
        const myScore = calculateTotalScore(myCards.slice(0, myPlayerData.visibleCards || 0));
        const isMyBJ = myScore === 21 && myCards.length === 2;
        const betAmount = myPlayerData.betAmount || 0;

        if (myPlayerData.status === 'SURRENDER') { outcomeMainTxt = '포기'; outcomeSubTxt = '(Surrender)'; profitStr = `-${betAmount / 2} CR`; outcomeColor = '#95a5a6'; }
        else if (myScore > 21) { outcomeMainTxt = '패배'; outcomeSubTxt = '(Bust)'; profitStr = `-${betAmount} CR`; outcomeColor = '#ff4757'; }
        else if (isMyBJ && isDBJGlobal) { outcomeMainTxt = '무승부'; outcomeSubTxt = '(Push)'; profitStr = '0 CR'; outcomeColor = '#f39c12'; }
        else if (isMyBJ) { outcomeMainTxt = '승리'; outcomeSubTxt = '(Blackjack!)'; profitStr = `+${betAmount * 1.5} CR`; outcomeColor = MINT; }
        else if (!isMyBJ && isDBJGlobal) { outcomeMainTxt = '패배'; outcomeSubTxt = '(Dealer Blackjack)'; profitStr = `-${betAmount} CR`; outcomeColor = '#ff4757'; }
        else if (dScoreGlobal > 21 || myScore > dScoreGlobal) { outcomeMainTxt = '승리'; outcomeSubTxt = '(Win)'; profitStr = `+${betAmount} CR`; outcomeColor = MINT; }
        else if (myScore === dScoreGlobal) { outcomeMainTxt = '무승부'; outcomeSubTxt = '(Push)'; profitStr = '0 CR'; outcomeColor = '#f39c12'; }
        else { outcomeMainTxt = '패배'; outcomeSubTxt = '(Lose)'; profitStr = `-${betAmount} CR`; outcomeColor = '#ff4757'; }
    }

    const myCurrentScore = calculateTotalScore((myPlayerData?.cards || []).slice(0, myPlayerData?.visibleCards || 0));
    const myCards = myPlayerData?.cards || [];

    const activePlayersCount = Object.values(roomData.players || {}).filter(p => p.status !== 'SPECTATING').length;
    const skipVotesCount = Object.keys((roomData as any).skipVotes || {}).length;
    const hasVoted = !!(roomData as any).skipVotes?.[emailKey];

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: DARK_BG, color: 'white', py: 2, px: 4, display: 'flex', flexDirection: 'column' }}>
            <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Alert severity={toast.severity} variant="filled" sx={{ width: '100%', fontWeight: 'bold' }}>{toast.msg}</Alert>
            </Snackbar>

            <Box sx={{ maxWidth: 1400, width: '100%', mx: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>

                {/* [완벽 수정 1] 헤더 영역 3등분 강제 분할로 배너 꿀렁임 완전 차단 */}
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, pb: 1, borderBottom: '1px solid #333', height: 60 }}>

                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                        <Typography variant="h5" sx={{ color: MINT, fontWeight: 'bold' }}>{getRomanName(roomData.id)}</Typography>
                        {/* 왕관 아이콘을 고정 너비 박스에 넣어 텍스트 밀림 방지 */}
                        <Box sx={{ width: 40, textAlign: 'center', ml: 1 }}>
                            {isHost && <Typography variant="h5">👑</Typography>}
                        </Box>
                    </Box>

                    <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                        <Box component="img" src="/banner.png" alt="Banner" onClick={handleLeaveRoom} sx={{ height: 50, cursor: canLeave ? 'pointer' : 'default', opacity: canLeave ? 1 : 0.5, transition: 'all 0.3s', '&:hover': canLeave ? { transform: 'scale(1.02)' } : {} }} />
                    </Box>

                    <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button variant="outlined" color="error" onClick={handleLeaveRoom} disabled={!canLeave} sx={{ fontWeight: 'bold' }}>로비로 나가기</Button>
                    </Box>
                </Box>

                <Box sx={{ bgcolor: TABLE_BG, border: `6px solid #08a38f`, borderRadius: '200px', p: 3, pt: 4, minHeight: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', boxShadow: 'inset 0 0 80px rgba(0,0,0,0.8), 0 20px 40px rgba(0,0,0,0.5)' }}>
                    <Box sx={{ textAlign: 'center', mb: 4, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Box sx={{ width: '100%', maxWidth: 200, height: 120, mb: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <img src={getDealerStateImage(roomData.status, outcomeColor, isDBJGlobal)} alt="Dealer Character" style={{ maxWidth: '160px', maxHeight: '100%', objectFit: 'contain', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.6))' }} />
                        </Box>

                        <Typography sx={{ color: 'rgba(255,255,255,0.7)', letterSpacing: 3, mb: 1, fontWeight: 'bold' }}>
                            DEALER {roomData.status === 'RESULT' && <Typography component="span" sx={{ color: MINT, fontWeight: 'bold' }}>({roomData.dealer?.score || 0})</Typography>}
                        </Typography>

                        <Box sx={{ display: 'flex', justifyContent: 'center', height: 120, width: '100%' }}>
                            <AnimatePresence>
                                {(roomData.dealer?.cards || []).map((card, idx) => {
                                    const isHidden = roomData.status !== 'RESULT' && idx > 0;
                                    return (
                                        <motion.img key={`dealer-${idx}`} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                                                    src={isHidden ? CARD_BACK_URL : getCardImageUrl(card.suit, card.value)} alt="카드"
                                                    style={{ width: 80, height: 112, borderRadius: 6, marginLeft: idx > 0 ? -30 : 0, position: 'relative', zIndex: idx, boxShadow: '-4px 4px 8px rgba(0,0,0,0.4)' }}
                                        />
                                    );
                                })}
                            </AnimatePresence>
                        </Box>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', width: '100%', mt: 'auto' }}>
                        {/* [완벽 수정 2] 플레이어 좌석 픽셀 고정. EMPTY 상태도 border-box와 고정 수치로 꿀렁임 원천 차단 */}
                        {[...Array(5)].map((_, i) => {
                            const playerData = sortedPlayers[i];

                            if (playerData) {
                                const [key, player] = playerData;
                                const isMe = key === emailKey;
                                const isActiveTurn = roomData.activePlayerEmail === key;
                                const score = calculateTotalScore((player.cards || []).slice(0, player.visibleCards || 0));

                                return (
                                    <Box key={key} sx={{
                                        width: 140, height: 190, boxSizing: 'border-box', // box-sizing 추가
                                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 3, p: 1.5, textAlign: 'center',
                                        border: isActiveTurn ? `2px solid ${MINT}` : (isMe ? '2px solid grey' : '2px solid rgba(255,255,255,0.05)'),
                                        position: 'relative'
                                    }}>
                                        <Box sx={{ height: 36 }}> {/* 이름 영역 높이 고정 */}
                                            <Typography noWrap sx={{ color: isMe ? MINT : 'white', fontSize: '0.9rem', fontWeight: 'bold' }}>{player.nickname}</Typography>
                                            <Typography sx={{ color: 'grey.500', fontSize: '0.7rem' }}>{player.status}</Typography>
                                        </Box>

                                        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {(roomData.status === 'BETTING' && isMe ? betInput : player.betAmount) > 0 && renderPokerChips(roomData.status === 'BETTING' && isMe ? betInput : player.betAmount, 0.7)}
                                        </Box>

                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: 60, justifyContent: 'flex-end' }}> {/* 카드 영역 높이 고정 */}
                                            {(player.cards || []).length > 0 && (
                                                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                                    {(player.cards || []).map((card, idx) => {
                                                        const isHidden = idx >= player.visibleCards;
                                                        return <img key={idx} src={isHidden ? CARD_BACK_URL : getCardImageUrl(card.suit, card.value)} alt="카드" style={{ width: 36, borderRadius: 4, marginLeft: idx > 0 ? -20 : 0, position: 'relative', zIndex: idx, boxShadow: '-2px 2px 5px rgba(0,0,0,0.5)' }} />
                                                    })}
                                                </Box>
                                            )}
                                            {score > 0 && <Typography sx={{ mt: 0.5, fontSize: '0.8rem', color: score > 21 ? '#ff4757' : MINT, lineHeight: 1, minHeight: '12px' }}>{score}</Typography>}
                                        </Box>
                                    </Box>
                                );
                            } else {
                                return (
                                    <Box key={`empty-${i}`} sx={{
                                        width: 140, height: 190, boxSizing: 'border-box', // box-sizing 추가
                                        bgcolor: 'rgba(0,0,0,0.15)', borderRadius: 3,
                                        border: '2px dashed rgba(255,255,255,0.1)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <PersonOutlineIcon sx={{ color: 'rgba(255,255,255,0.1)', fontSize: 40, mb: 1 }} />
                                        <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem', fontWeight: 'bold', letterSpacing: 1 }}>EMPTY</Typography>
                                    </Box>
                                );
                            }
                        })}
                    </Box>
                </Box>

                <Paper sx={{ mt: 3, p: 3, bgcolor: PANEL_BG, borderRadius: 4, border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, minHeight: 200 }}>

                    <Box sx={{ minWidth: 200 }}>
                        <Typography variant="h5" sx={{ color: MINT, fontWeight: 'bold', mb: 1 }}>{myPlayerData?.nickname} (나)</Typography>
                        <Typography sx={{ color: 'grey.400' }}>보유 크레딧: <Typography component="span" sx={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>{myPlayerData?.credit}</Typography> CR</Typography>
                        <Typography sx={{ color: 'grey.400' }}>현재 베팅: <Typography component="span" sx={{ color: MINT, fontWeight: 'bold', fontSize: '1.2rem' }}>{roomData.status === 'BETTING' ? betInput : (myPlayerData?.betAmount || 0)}</Typography> CR</Typography>
                    </Box>

                    <Divider orientation="vertical" flexItem sx={{ borderColor: '#444' }} />

                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 300, minHeight: 140 }}>

                        {roomData.status === 'WAITING' && myPlayerData?.status !== 'SPECTATING' && (
                            <Button variant="contained" onClick={() => toggleReady(roomData.id, currentUser.email, !myPlayerData?.isReady)}
                                    sx={{ borderRadius: 10, px: 6, py: 1.5, fontSize: '1.1rem', bgcolor: myPlayerData?.isReady ? 'grey.600' : MINT, color: myPlayerData?.isReady ? 'white' : DARK_BG, '&:hover': { bgcolor: myPlayerData?.isReady ? 'grey.700' : '#0ad1b8' } }}>
                                {myPlayerData?.isReady ? '준비 취소' : '게임 준비 (READY)'}
                            </Button>
                        )}

                        {roomData.status === 'BETTING' && myPlayerData?.betAmount === 0 && (
                            <Box sx={{ width: '100%', textAlign: 'center' }}>
                                <Stack direction="row" spacing={2} justifyContent="center" sx={{ mb: 2 }}>
                                    <InteractiveChip value={100} color={chipColors[100]} onClick={() => handleAddBet(100, myPlayerData.credit)} />
                                    <InteractiveChip value={200} color={chipColors[100]} onClick={() => handleAddBet(200, myPlayerData.credit)} />
                                    <InteractiveChip value={500} color={chipColors[500]} onClick={() => handleAddBet(500, myPlayerData.credit)} />
                                    <InteractiveChip value="ALL" color="#e74c3c" onClick={() => handleAddBet(myPlayerData.credit - betInput, myPlayerData.credit)} />
                                    <InteractiveChip value="X" color="#34495e" onClick={() => setBetInput(0)} />
                                </Stack>
                                <Button variant="contained" sx={{ borderRadius: 10, px: 5, bgcolor: MINT, color: DARK_BG, fontWeight: 'bold' }} onClick={() => { if(betInput >= 100) submitBet(roomData.id, currentUser.email, betInput, myPlayerData.credit); else showToast('최소 100 CR 이상 베팅해주세요.', 'error'); }}>
                                    {betInput} CR 베팅 확정
                                </Button>
                            </Box>
                        )}

                        {roomData.status === 'PRE_DECISION' && myPlayerData?.status === 'DECIDING' && (
                            <Stack direction="row" spacing={2}>
                                <Button variant="contained" sx={{ borderRadius: 10, px: 4, py: 1.5, bgcolor: MINT, color: DARK_BG, fontWeight: 'bold', display: 'flex', flexDirection: 'column', lineHeight: 1.2 }} onClick={() => submitPreDecision(roomData.id, currentUser.email, true, myPlayerData.credit, myPlayerData.betAmount)}>
                                    <span>진행</span>
                                </Button>
                                <Button variant="outlined" color="error" sx={{ borderRadius: 10, px: 4, py: 1.5, fontWeight: 'bold', display: 'flex', flexDirection: 'column', lineHeight: 1.2 }} onClick={() => submitPreDecision(roomData.id, currentUser.email, false, myPlayerData.credit, myPlayerData.betAmount)}>
                                    <span style={{ whiteSpace: 'nowrap' }}>포기</span><span style={{ fontSize: '0.8rem', marginTop: '2px', whiteSpace: 'nowrap' }}>(50% 회수)</span>
                                </Button>
                            </Stack>
                        )}

                        {isMyTurn && myCurrentScore < 21 && (
                            <Stack direction="row" spacing={3}>
                                <Button variant="contained" sx={{ borderRadius: 10, px: 5, py: 1.5, fontSize: '1.2rem', bgcolor: MINT, color: DARK_BG, fontWeight: 'bold', display: 'flex', flexDirection: 'column', lineHeight: 1.2, wordBreak: 'keep-all' }} onClick={() => playerAction(roomData.id, roomData, currentUser.email, 'HIT')}>
                                    <span>HIT</span><span style={{ fontSize: '0.8rem', marginTop: '4px', opacity: 0.8, whiteSpace: 'nowrap' }}>(카드 받기)</span>
                                </Button>
                                <Button variant="outlined" sx={{ borderRadius: 10, px: 5, py: 1.5, fontSize: '1.2rem', color: 'white', borderColor: 'grey.500', fontWeight: 'bold', display: 'flex', flexDirection: 'column', lineHeight: 1.2, wordBreak: 'keep-all' }} onClick={() => playerAction(roomData.id, roomData, currentUser.email, 'STAND')}>
                                    <span>STAND</span><span style={{ fontSize: '0.8rem', marginTop: '4px', opacity: 0.8, whiteSpace: 'nowrap' }}>(턴 넘기기)</span>
                                </Button>
                            </Stack>
                        )}

                        {roomData.status !== 'WAITING' && roomData.status !== 'BETTING' && !isMyTurn && myPlayerData?.status !== 'DECIDING' && (
                            <Typography sx={{ color: 'grey.500', fontSize: '1.2rem' }}>대기 중...</Typography>
                        )}
                    </Box>

                    <Divider orientation="vertical" flexItem sx={{ borderColor: '#444' }} />

                    <Box sx={{ minWidth: 200, minHeight: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        {myCards.length > 0 ? (
                            <>
                                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                                    <AnimatePresence>
                                        {myCards.map((card, idx) => {
                                            const isHidden = idx >= (myPlayerData?.visibleCards || 1);
                                            return (
                                                <motion.img
                                                    key={`mycard-${idx}`} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }}
                                                    src={isHidden ? CARD_BACK_URL : getCardImageUrl(card.suit, card.value)} alt="카드"
                                                    style={{ width: 90, borderRadius: 6, marginLeft: idx > 0 ? -45 : 0, position: 'relative', zIndex: idx, boxShadow: '-4px 4px 10px rgba(0,0,0,0.6)' }}
                                                />
                                            );
                                        })}
                                    </AnimatePresence>
                                </Box>
                                <Typography sx={{ fontSize: '1.2rem', fontWeight: 'bold', color: myCurrentScore > 21 ? '#ff4757' : MINT }}>
                                    점수: {myCurrentScore}
                                </Typography>
                            </>
                        ) : (
                            <Typography sx={{ color: 'grey.600' }}>카드가 없습니다</Typography>
                        )}
                    </Box>

                </Paper>

                <AnimatePresence>
                    {roomData.status === 'RESULT' && (
                        <Box component={motion.div} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(10, 15, 12, 0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(8px)' }}>
                            <Paper component={motion.div} initial={{ scale: 0.8, y: 50 }} animate={{ scale: 1, y: 0 }} sx={{ bgcolor: PANEL_BG, p: 4, borderRadius: 4, textAlign: 'center', minWidth: 400, maxWidth: 500, border: `2px solid ${outcomeColor}`, boxShadow: `0 0 40px ${outcomeColor}40` }}>

                                <Box sx={{ width: '100%', height: 160, mb: 2, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                    <img src={getDealerStateImage(roomData.status, outcomeColor, isDBJGlobal)} alt="Dealer Character" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                </Box>

                                <Box sx={{ mb: 3 }}>
                                    <Typography variant="h3" sx={{ color: outcomeColor, fontWeight: 'bold', display: 'inline-block', mr: 1 }}>{outcomeMainTxt}</Typography>
                                    <Typography variant="h5" sx={{ color: outcomeColor, display: 'inline-block', opacity: 0.8 }}>{outcomeSubTxt}</Typography>
                                </Box>

                                <Typography variant="h5" sx={{ color: profitStr.startsWith('+') ? MINT : '#ff4757', mb: 3, fontWeight: 'bold' }}>수익금: {profitStr}</Typography>

                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
                                    <Box sx={{ bgcolor: DARK_BG, p: 2, borderRadius: 3, border: '1px solid #333' }}>
                                        <Typography sx={{ color: 'grey.400', mb: 1, fontWeight: 'bold' }}>Dealer {roomData.dealer.isBust ? '(Bust!)' : `(${roomData.dealer?.score || 0}점)`}</Typography>
                                        <Box sx={{ display: 'flex', justifyContent: 'center', height: 100 }}>
                                            {(roomData.dealer?.cards || []).map((card, idx) => <img key={idx} src={getCardImageUrl(card.suit, card.value)} alt="카드" style={{ width: 70, height: 98, borderRadius: 4, marginLeft: idx > 0 ? -30 : 0, position: 'relative', zIndex: idx }} />)}
                                        </Box>
                                    </Box>
                                    <Typography variant="h5" sx={{ color: 'grey.600', fontWeight: 'bold' }}>VS</Typography>
                                    <Box sx={{ bgcolor: DARK_BG, p: 2, borderRadius: 3, border: `1px solid ${outcomeColor}50` }}>
                                        <Typography sx={{ color: 'white', mb: 1, fontWeight: 'bold' }}>Me ({myCurrentScore}점)</Typography>
                                        <Box sx={{ display: 'flex', justifyContent: 'center', height: 100 }}>
                                            {myCards.map((card, idx) => <img key={idx} src={getCardImageUrl(card.suit, card.value)} alt="카드" style={{ width: 70, height: 98, borderRadius: 4, marginLeft: idx > 0 ? -30 : 0, position: 'relative', zIndex: idx }} />)}
                                        </Box>
                                    </Box>
                                </Box>

                                <Button fullWidth variant="outlined" disabled={hasVoted} sx={{ borderRadius: 10, color: 'white', borderColor: 'grey.600', '&:hover': { bgcolor: 'grey.800', borderColor: 'white' }, display: 'flex', justifyContent: 'center', gap: 2, py: 1.5 }} onClick={() => voteSkip(roomData.id, currentUser.email)}>
                                    <Typography sx={{ fontWeight: 'bold' }}>{hasVoted ? '스킵 대기 중...' : '결과창 닫기 (Skip)'}</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        {[...Array(activePlayersCount)].map((_, i) => (
                                            i < skipVotesCount ? <PersonIcon key={i} sx={{ color: MINT, fontSize: 20 }} /> : <PersonOutlineIcon key={i} sx={{ color: 'grey.500', fontSize: 20 }} />
                                        ))}
                                    </Box>
                                </Button>
                            </Paper>
                        </Box>
                    )}
                </AnimatePresence>

            </Box>
        </Box>
    );
}
