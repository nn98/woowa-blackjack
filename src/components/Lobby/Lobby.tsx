// src/components/Lobby/Lobby.tsx
import { useState, useEffect } from 'react';
import { subscribeToRooms, validateLogin } from '../../services/firebaseRoom';
import { useGameStore } from '../../store/gameStore';
import type { Room } from '../../types/game';
import { Box, Typography, Button, TextField, Paper, Chip, Divider, Drawer } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { ref, onValue } from 'firebase/database';
import { db } from '../../services/firebase';

const MINT = '#0CEFD3';
const DARK_BG = '#121212';
const PANEL_BG = '#1e272e';

const getRomanName = (roomId: string) => {
    const num = parseInt(roomId.split('_')[1], 10);
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI'][num - 1] || num;
    return `테이블 ${roman}`;
};

export default function Lobby() {
    const currentUser = useGameStore((state) => state.currentUser);
    const setCurrentUser = useGameStore((state) => state.setCurrentUser);
    const setCurrentRoom = useGameStore((state) => state.setCurrentRoom);

    const [rooms, setRooms] = useState<Room[]>([]);
    const [email, setEmail] = useState('');
    const [nickname, setNickname] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const [isLeaderboardOpen, setLeaderboardOpen] = useState(false);
    const [usersList, setUsersList] = useState<any[]>([]);

    useEffect(() => {
        if (!currentUser) return;
        const unsubscribeRooms = subscribeToRooms(setRooms);

        const unsubscribeUsers = onValue(ref(db, 'users'), (snap) => {
            if (snap.exists()) {
                const arr = Object.values(snap.val()) as any[];
                arr.sort((a, b) => b.credit - a.credit);
                setUsersList(arr);
            }
        });

        return () => { unsubscribeRooms(); unsubscribeUsers(); };
    }, [currentUser]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        const user = await validateLogin(email, nickname);
        if (user) setCurrentUser(user);
        else setErrorMsg('정보가 일치하지 않습니다.');
    };

    if (!currentUser) {
        return (
            <Box sx={{ minHeight: '100vh', bgcolor: DARK_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 2 }}>
                <Box component="img" src="/banner.png" alt="Banner" sx={{ width: '100%', maxWidth: 700, mb: 5, borderRadius: 2 }} />
                <Paper sx={{ p: 4, width: '100%', maxWidth: 400, bgcolor: PANEL_BG, border: `2px solid ${MINT}` }}>
                    <Typography variant="h4" sx={{ color: MINT, mb: 3, textAlign: 'center', fontWeight: 'bold' }}>LOGIN</Typography>
                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <TextField
                            label="지원에 사용한 이메일"
                            variant="outlined"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            InputLabelProps={{ style: { color: 'grey' }, required: false }}
                            sx={{ input: { color: 'white' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'grey' }, '&:hover fieldset': { borderColor: MINT }, '&.Mui-focused fieldset': { borderColor: MINT } } }}
                        />
                        <TextField
                            label="닉네임"
                            variant="outlined"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            InputLabelProps={{ style: { color: 'grey' }, required: false }}
                            sx={{ input: { color: 'white' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'grey' }, '&:hover fieldset': { borderColor: MINT }, '&.Mui-focused fieldset': { borderColor: MINT } } }}
                        />
                        <Button type="submit" variant="contained" sx={{ bgcolor: MINT, color: DARK_BG, fontWeight: 'bold', py: 1.5, '&:hover': { bgcolor: '#0ad1b8' } }}>
                            입장하기
                        </Button>
                    </form>
                    <Box sx={{ height: 24, mt: 2, visibility: errorMsg ? 'visible' : 'hidden' }}>
                        <Typography color="error" sx={{ textAlign: 'center', fontWeight: 'bold' }}>{errorMsg}</Typography>
                    </Box>
                </Paper>
            </Box>
        );
    }

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: DARK_BG, color: 'white', py: 4, px: 2, position: 'relative' }}>

            <Box sx={{ position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 50 }}>
                <Button variant="contained" onClick={() => setLeaderboardOpen(true)}
                        sx={{ bgcolor: MINT, color: DARK_BG, borderRadius: '8px 0 0 8px', width: 48, height: 100, minWidth: 0, p: 0, boxShadow: `-4px 0 15px ${MINT}60`, '&:hover': { bgcolor: '#0ad1b8' } }}>
                    <EmojiEventsIcon fontSize="large" />
                </Button>
            </Box>

            <Drawer anchor="right" open={isLeaderboardOpen} onClose={() => setLeaderboardOpen(false)}>
                <Box sx={{ width: { xs: 300, sm: 380 }, height: '100%', bgcolor: PANEL_BG, color: 'white', p: 3, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 1 }}>
                        <EmojiEventsIcon sx={{ color: MINT, fontSize: 32 }} />
                        <Typography variant="h5" sx={{ color: MINT, fontWeight: 'bold' }}>명예의 전당</Typography>
                    </Box>
                    <Divider sx={{ borderColor: '#444', mb: 2 }} />

                    <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
                        {usersList.map((user, idx) => (
                            <Box key={idx} sx={{ display: 'flex', alignItems: 'center', bgcolor: DARK_BG, p: 2, borderRadius: 2, mb: 1.5, borderLeft: idx < 3 ? `4px solid ${MINT}` : '4px solid transparent' }}>
                                <Typography sx={{ width: 30, fontWeight: 'bold', color: idx === 0 ? '#f1c40f' : idx === 1 ? '#bdc3c7' : idx === 2 ? '#cd7f32' : 'grey.500', fontSize: idx < 3 ? '1.2rem' : '1rem' }}>
                                    {idx + 1}
                                </Typography>
                                <Box sx={{ flex: 1, ml: 1 }}>
                                    <Typography sx={{ fontWeight: 'bold', color: currentUser.email === user.email ? MINT : 'white' }}>{user.nickname}</Typography>
                                    <Typography sx={{ fontSize: '0.8rem', color: 'grey.500' }}>최고: {user.maxCredit || user.credit} CR</Typography>
                                </Box>
                                <Typography sx={{ fontWeight: 'bold', color: MINT }}>{user.credit} CR</Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Drawer>

            <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
                <Box component="img" src="/banner.png" alt="Banner" sx={{ width: '100%', height: 'auto', mb: 4, borderRadius: 2, display: 'block' }} />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, borderBottom: '1px solid #333', pb: 2 }}>
                    <Box>
                        <Typography variant="h4" sx={{ color: 'white', fontWeight: 'bold' }}>로비</Typography>
                        <Typography variant="h6" sx={{ color: MINT, fontWeight: 'bold', mt: 0.5, textShadow: `0 0 10px ${MINT}` }}>
                            {currentUser.nickname}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="h6" sx={{ color: 'white' }}>보유 CR: <span style={{ color: MINT }}>{currentUser.credit}</span></Typography>
                        <Button variant="outlined" color="error" onClick={() => { setCurrentUser(null); setCurrentRoom(null); }} sx={{ fontWeight: 'bold' }}>로그아웃</Button>
                    </Box>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                    {rooms.map((room) => {
                        const playerCount = room.players ? Object.keys(room.players).length : 0;
                        const isFull = playerCount >= 5;

                        return (
                            <Paper key={room.id} onClick={() => !isFull && setCurrentRoom(room)}
                                   sx={{
                                       p: 3, display: 'flex', flexDirection: 'column', cursor: isFull ? 'not-allowed' : 'pointer',
                                       // [수정] 테이블 배경색과 은은한 그라데이션 추가, 인게임과 테두리 색상 통일
                                       background: 'linear-gradient(145deg, #11221b 0%, #173024 100%)',
                                       border: '2px solid rgba(8, 163, 143, 0.4)',
                                       borderRadius: 4,
                                       opacity: isFull ? 0.6 : 1, transition: 'all 0.3s ease',
                                       '&:hover': isFull ? {} : { borderColor: '#08a38f', transform: 'translateY(-4px)', boxShadow: `0 6px 20px rgba(8, 163, 143, 0.3)` }
                                   }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                    <Typography variant="h5" sx={{ color: 'white', fontWeight: 'bold' }}>{getRomanName(room.id)}</Typography>
                                    {isFull ? <Chip label="FULL" color="error" size="small" /> : <Chip label="입장 가능" sx={{ bgcolor: MINT, color: DARK_BG, fontWeight: 'bold' }} size="small" />}
                                </Box>
                                <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.1)' }} />
                                <Typography sx={{ color: 'grey.400', mb: 1, textAlign: 'center' }}>상태: <span style={{ color: MINT, fontWeight: 'bold' }}>{room.status}</span></Typography>

                                <Box sx={{ mt: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5, pt: 1 }}>
                                    {[...Array(5)].map((_, i) => (
                                        i < playerCount ? <PersonIcon key={i} sx={{ color: MINT, fontSize: 28, filter: `drop-shadow(0 0 4px ${MINT})` }} /> : <PersonOutlineIcon key={i} sx={{ color: 'rgba(255,255,255,0.2)', fontSize: 28 }} />
                                    ))}
                                </Box>
                            </Paper>
                        );
                    })}
                </Box>
            </Box>
        </Box>
    );
}
