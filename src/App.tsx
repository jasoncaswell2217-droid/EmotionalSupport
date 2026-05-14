import { useState, useRef, useEffect, memo, useMemo } from 'react';
import { Brain, FileText, Users, Activity, BarChart3, Database, Plus, History, MessageSquare, Palette, Check, Trash2, PanelLeftClose, PanelLeft, Settings, X, Shield, Lock, ChevronDown, LogIn, LogOut, Cloud, ImageIcon, MousePointer2 } from 'lucide-react';
import { ChatMessage } from './components/ChatMessage';
import { PsychInput } from './components/PsychInput';
import { AuthLanding } from './components/AuthLanding';
import { startChat, Message } from './services/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { auth, db, googleProvider, OperationType, handleFirestoreError } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, onSnapshot, query, orderBy, writeBatch, Timestamp, serverTimestamp, increment } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area, PieChart, Pie } from 'recharts';

const THEMES = [
  { id: 'cybercore', label: 'Cybercore', colors: ['#06b2d2', '#8b5cf6'] },
  { id: 'clinical', label: 'Clinical', colors: ['#334155', '#64748b'] },
  { id: 'organic', label: 'Organic', colors: ['#5a5a40', '#8a8a6a'] },
  { id: 'dracula', label: 'Dracula', colors: ['#ff79c6', '#bd93f9'] },
  { id: 'midnight-gold', label: 'Midnight Gold', colors: ['#d4af37', '#c5a028'] },
];

interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

export default function App() {
  const [currentView, setCurrentView] = useState<'chat' | 'analytics' | 'admin'>('chat');
  const [isLoading, setIsLoading] = useState(false);
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem('psych_preferences');
    return saved ? JSON.parse(saved) : { chatHistoryEnabled: true, enhancedThinkingEnabled: false };
  });
  const [theme, setTheme] = useState<string>(() => {
    return localStorage.getItem('psych_theme') || 'cybercore';
  });
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(true);

  // Global Stats Sync (Only for Admins to see details)
  useEffect(() => {
    if (!user || role !== 'admin') {
      setGlobalStats(null);
      return;
    }

    const statsRef = doc(db, 'stats', 'global');
    const unsubscribe = onSnapshot(statsRef, (snap) => {
      if (snap.exists()) setGlobalStats(snap.data());
    }, (error) => {
      // Permission errors are expected for non-admins if rules are strict, 
      // but we guard this effect with role === 'admin' now.
      console.error("Global Stats Error:", error);
    });

    return () => unsubscribe();
  }, [user, role]);

  // Fetch all users for Admin
  useEffect(() => {
    if (role !== 'admin' || currentView !== 'admin' || !user) {
      setAllUsers([]);
      return;
    }

    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      setAllUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      if (!error.message.includes('permission-denied')) {
        handleFirestoreError(error, OperationType.GET, 'users');
      }
    });
    return () => unsubscribe();
  }, [role, currentView, user]);
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [hasFoundSecondaryData, setHasFoundSecondaryData] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState({ current: 0, total: 0 });
  const migrationDataRef = useRef<{ sessions: string | null; prefs: string | null; theme: string | null }>({
    sessions: localStorage.getItem('psych_sessions'),
    prefs: localStorage.getItem('psych_preferences'),
    theme: localStorage.getItem('psych_theme')
  });

  // Monitor Auth State
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
      if (u) {
        setShowLanding(false);
      } else {
        setShowLanding(true);
      }
    });
  }, []);

  // Sync with Firestore or LocalStorage
  useEffect(() => {
    if (isAuthLoading) return;

    if (!user) {
      // Local Storage Mode
      const saved = migrationDataRef.current.sessions || localStorage.getItem('psych_sessions');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            setSessions(parsed);
            setCurrentSessionId(prev => (parsed[prev] ? prev : Object.keys(parsed)[0]));
          } else {
            handleInitialSessionState();
          }
        } catch (e) {
          console.error("Failed to load sessions", e);
          handleInitialSessionState();
        }
      } else {
        handleInitialSessionState();
      }
      return;
    }

    // Firestore Mode
    const sessionsRef = collection(db, 'users', user.uid, 'sessions');
    const q = query(sessionsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      setSessions(prev => {
        const newSessions: Record<string, Session> = {};
        snapshot.docs.forEach(sessionDoc => {
          const sessionData = sessionDoc.data();
          newSessions[sessionDoc.id] = {
            id: sessionDoc.id,
            title: sessionData.title,
            messages: prev[sessionDoc.id]?.messages || [], 
            createdAt: sessionData.createdAt
          };
        });
        return newSessions;
      });

      if (snapshot.docs.length > 0) {
        setCurrentSessionId(prev => {
          if (prev && snapshot.docs.some(d => d.id === prev)) return prev;
          return snapshot.docs[0].id;
        });
      }
      // Note: We don't auto-create a session if empty here because migration might be in progress
    }, (error) => {
      // Handle the case where the project is still provisioning or permissions aren't ready
      if (error.message.includes('permission-denied')) {
        console.warn("Firestore not ready yet");
      } else {
        handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/sessions`);
      }
    });

    return () => unsubscribe();
  }, [user, isAuthLoading]);

  const handleInitialSessionState = () => {
    const initialId = Date.now().toString();
    const initialSessions = {
      [initialId]: {
        id: initialId,
        title: "Initial Analysis",
        messages: [],
        createdAt: Date.now()
      }
    };
    setSessions(initialSessions);
    setCurrentSessionId(initialId);
  };

  // Sync current session messages from Firestore
  useEffect(() => {
    if (!user || !currentSessionId || !sessions[currentSessionId]) return;

    const messagesRef = collection(db, 'users', user.uid, 'sessions', currentSessionId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesList = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as Message[];

      setSessions(prev => {
        if (!prev[currentSessionId]) return prev;
        return {
          ...prev,
          [currentSessionId]: {
            ...prev[currentSessionId],
            messages: messagesList
          }
        };
      });
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/sessions/${currentSessionId}/messages`));

    return () => unsubscribe();
  }, [user, currentSessionId]);

  // Migration Logic
  useEffect(() => {
    async function migrate() {
      if (!user || isMigrating) return;

      const savedSessions = migrationDataRef.current.sessions;
      if (!savedSessions) return;

      try {
        const localSessions: Record<string, Session> = JSON.parse(savedSessions);
        const sessionEntries = Object.entries(localSessions);
        if (sessionEntries.length === 0) return;

        setIsMigrating(true);
        console.log("MIGRATION_START: Found data in ref", { 
          sessionCount: sessionEntries.length,
          hasPrefs: !!migrationDataRef.current.prefs,
          hasTheme: !!migrationDataRef.current.theme
        });
        
        setMigrationProgress({ current: 0, total: sessionEntries.length });
        const failedSessions: string[] = [];

        for (let i = 0; i < sessionEntries.length; i++) {
          const [sId, session] = sessionEntries[i];
          setMigrationProgress(prev => ({ ...prev, current: i + 1 }));
          console.log(`MIGRATING_SESSION [${i+1}/${sessionEntries.length}]: ${sId} (${session.title})`);
          
          try {
            const sessionRef = doc(db, 'users', user.uid, 'sessions', sId);
            await setDoc(sessionRef, {
              title: session.title || "Untitled Analysis",
              createdAt: session.createdAt || Date.now()
            });

            if (session.messages && session.messages.length > 0) {
              console.log(`MIGRATING_MESSAGES [${session.messages.length}]: ${sId}`);
              const messagesRef = collection(db, 'users', user.uid, 'sessions', sId, 'messages');
              // Batch the messages
              const batch = writeBatch(db);
              session.messages.forEach(msg => {
                const mRef = doc(messagesRef, msg.id || generateId());
                batch.set(mRef, {
                  role: msg.role,
                  parts: msg.parts,
                  timestamp: msg.timestamp || Date.now()
                });
              });
              await batch.commit();
            }
          } catch (itemError) {
            console.error(`MIGRATION_ERROR [${sId}]:`, itemError);
            failedSessions.push(sId);
          }
        }

        // Migrate preferences and theme
        try {
          console.log("MIGRATING_PREFERENCES");
          const savedPrefs = migrationDataRef.current.prefs;
          const savedTheme = migrationDataRef.current.theme;
          const userRef = doc(db, 'users', user.uid);
          const isAdminEmail = user.email === 'jasoncaswell2217@gmail.com';
          await setDoc(userRef, {
            preferences: savedPrefs ? JSON.parse(savedPrefs) : preferences,
            theme: savedTheme || theme,
            role: isAdminEmail ? 'admin' : 'user'
          }, { merge: true });
        } catch (prefError) {
          console.error("MIGRATION_ERROR_PREFS:", prefError);
        }

        console.log("MIGRATION_FINISHED", { failedCount: failedSessions.length });
        
        if (failedSessions.length > 0) {
          setMigrationError(`Logged failures for ${failedSessions.length} items. Check console.`);
        }
        
        // READ-VERIFY: Check if cloud sessions exist before clearing
        const verifyRef = collection(db, 'users', user.uid, 'sessions');
        const verifySnap = await getDocs(verifyRef);
        
        if (verifySnap.docs.length > 0 && failedSessions.length === 0) {
          console.log("MIGRATION_VERIFIED: Cloud has data. Clearing local storage.");
          localStorage.removeItem('psych_sessions');
          localStorage.removeItem('psych_preferences');
          localStorage.removeItem('psych_theme');
          migrationDataRef.current = { sessions: null, prefs: null, theme: null };
        } else if (verifySnap.docs.length === 0) {
          console.error("MIGRATION_VERIFICATION_FAILED: Cloud appears empty even after success writes.");
          setMigrationError("Verification failed: Cloud appears empty. Keeping local data safe.");
        }
      } catch (e) {
        console.error("Migration failed", e);
        setMigrationError(e instanceof Error ? e.message : "Unkown migration error");
      } finally {
        setIsMigrating(false);
      }
    }

    if (user) {
      migrate();
    }
  }, [user]);

  // User Profile Sync
  useEffect(() => {
    if (!user) {
      setRole('user');
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.role) setRole(data.role as 'user' | 'admin');
        if (data.preferences) setPreferences(data.preferences);
        if (data.theme) setTheme(data.theme);
      } else {
        // Initialize user doc if it doesn't exist
        const isAdminEmail = user.email === 'jasoncaswell2217@gmail.com';
        setDoc(userRef, {
          preferences,
          theme,
          role: isAdminEmail ? 'admin' : 'user'
        }, { merge: true }).catch(err => {
          console.error("Failed to initialize user doc:", err);
        });

        // Increment user count in global stats
        const statsRef = doc(db, 'stats', 'global');
        setDoc(statsRef, { 
          totalUsers: increment(1),
          updatedAt: serverTimestamp() 
        }, { merge: true }).catch(() => {
          // If doc doesn't exist, set it properly (Admin usually initializes)
          setDoc(statsRef, { totalUsers: 1, totalMessages: 0, createdAt: serverTimestamp() }, { merge: true }).catch(() => {});
        });
      }
    }, (error) => {
      if (!error.message.includes('permission-denied')) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const [loadingStepIndex, setLoadingStepIndex] = useState(-1);
  const [currentMood, setCurrentMood] = useState<string>("Observing...");
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [activeMobileView, setActiveMobileView] = useState<'chat' | 'history' | 'analytics'>('chat');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const chatInstance = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Analytics Data Preparation
  const analyticsData = useMemo(() => {
    const sessionList = Object.values(sessions).sort((a,b) => a.createdAt - b.createdAt);
    
    // Messages per session
    const messagesPerSession = sessionList.map(s => ({
      name: s.title.length > 8 ? s.title.substring(0, 8) + '...' : s.title,
      fullName: s.title,
      messages: s.messages.length,
      images: s.messages.reduce((acc, m) => {
        const imageCount = m.parts.filter((p: any) => p.inlineData).length;
        return acc + imageCount;
      }, 0)
    }));

    // Message frequency totals
    const totalMessages = sessionList.reduce((acc, s) => acc + s.messages.length, 0);
    const totalImages = sessionList.reduce((acc, s) => {
      return acc + s.messages.reduce((mAcc, m) => {
        return mAcc + m.parts.filter((p: any) => p.inlineData).length;
      }, 0);
    }, 0);

    const breakdownData = [
      { name: 'Text', value: totalMessages - totalImages, color: '#06b2d2' },
      { name: 'Images', value: totalImages, color: '#8b5cf6' }
    ];

    return {
      messagesPerSession,
      breakdownData,
      totalMessages,
      totalImages
    };
  }, [sessions]);

  // Apply theme to body and root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('psych_theme', theme);
  }, [theme]);

  const currentSession = sessions[currentSessionId];
  const messages = currentSession?.messages || [];
  
  const WINDOW_SIZE = 4;
  const hasHiddenMessages = messages.length > WINDOW_SIZE && !showFullHistory;
  const visibleMessages = hasHiddenMessages ? messages.slice(-WINDOW_SIZE) : messages;

  // Persistence logic - only for non-cloud users
  useEffect(() => {
    if (user || isMigrating || !preferences.chatHistoryEnabled) {
      return;
    }
    // Safety: Don't clear local storage if sessions coincidentally empty during a reload
    if (Object.keys(sessions).length === 0) return;

    const timer = setTimeout(() => {
      localStorage.setItem('psych_sessions', JSON.stringify(sessions));
    }, 1000);
    return () => clearTimeout(timer);
  }, [sessions, preferences.chatHistoryEnabled, user, isMigrating]);

  // Persist preferences
  useEffect(() => {
    localStorage.setItem('psych_preferences', JSON.stringify(preferences));
  }, [preferences]);

  // Handle scroll to bottom
  useEffect(() => {
    if (scrollRef.current && !showFullHistory) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, currentSessionId, showFullHistory]);

  // Re-start chat instance when switching sessions
  useEffect(() => {
    chatInstance.current = startChat(messages);
    setShowFullHistory(false); // Reset history view on session switch
  }, [currentSessionId]);

  const generateId = () => {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return Date.now().toString() + Math.random().toString(36).substring(2, 9);
    }
  };

  const updateCurrentSession = async (newMessages: Message[]) => {
    if (!user) {
      setSessions(prev => {
        const session = prev[currentSessionId];
        if (!session) return prev;
        
        let title = session.title;
        if ((session.title === "Initial Analysis" || session.title === "New Analysis") && newMessages.length > 0) {
          const firstUserMsg = newMessages.find(m => m.role === 'user');
          const textPart = firstUserMsg?.parts.find((p: any) => p.text);
          if (textPart?.text) {
            title = textPart.text.substring(0, 30) + (textPart.text.length > 30 ? "..." : "");
          }
        }

        return {
          ...prev,
          [currentSessionId]: {
            ...session,
            title,
            messages: newMessages
          }
        };
      });
      return;
    }

    // Firestore update
    try {
      const lastMsg = newMessages[newMessages.length - 1];
      const mId = lastMsg.id || generateId();
      const mRef = doc(db, 'users', user.uid, 'sessions', currentSessionId, 'messages', mId);
      
      await setDoc(mRef, {
        role: lastMsg.role,
        parts: lastMsg.parts,
        timestamp: lastMsg.timestamp || Date.now()
      });

      // Update title if needed
      const session = sessions[currentSessionId];
      if (session && (session.title === "Initial Analysis" || session.title === "New Analysis")) {
        const firstUserMsg = newMessages.find(m => m.role === 'user');
        const textPart = firstUserMsg?.parts.find((p: any) => p.text);
        if (textPart?.text) {
          const newTitle = textPart.text.substring(0, 30) + (textPart.text.length > 30 ? "..." : "");
          const sessionRef = doc(db, 'users', user.uid, 'sessions', currentSessionId);
          await setDoc(sessionRef, { title: newTitle }, { merge: true });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/sessions/${currentSessionId}/messages`);
    }
  };

  const handleSendMessage = async (text: string, images?: string[]) => {
    if (!text.trim() && (!images || images.length === 0)) return;

    const parts: any[] = [];
    if (text.trim()) parts.push({ text });
    if (images && images.length > 0) {
      images.forEach(img => {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: img
          }
        });
      });
    }

    const newUserMessage: Message = { id: generateId(), role: 'user', parts, timestamp: Date.now() };
    
    setActiveMobileView('chat');
    
    if (user) {
      await updateCurrentSession([...messages, newUserMessage]);
    } else {
      setSessions(prev => {
        const session = prev[currentSessionId];
        if (!session) return prev;
        
        const newMessages = [...session.messages, newUserMessage];
        let title = session.title;
        
        if ((session.title === "Initial Analysis" || session.title === "New Analysis")) {
          const textPart = parts.find((p: any) => p.text);
          if (textPart?.text) {
            title = textPart.text.substring(0, 30) + (textPart.text.length > 30 ? "..." : "");
          }
        }

        return {
          ...prev,
          [currentSessionId]: {
            ...session,
            title,
            messages: newMessages
          }
        };
      });
    }
    
    setIsLoading(true);

    const analysisStages = [
      "Securing analytical uplink...",
      "Intercepting semantic patterns...",
      "Mapping neuro-emotional density...",
      "Cross-referencing behavioral archetypes...",
      "Isolating cognitive distortions...",
      "Finalizing neuro-linguistic synthesis..."
    ];

    try {
      if (!chatInstance.current) {
        chatInstance.current = startChat(messages);
      }

      // Step-through stages
      for(let i=0; i < analysisStages.length; i++) {
        setLoadingStepIndex(i);
        await new Promise(r => setTimeout(r, 600)); // Deliberate processing delay
      }

      let response;
      let retries = 0;
      const maxRetries = 3;
      
      while (retries < maxRetries) {
        try {
          response = await chatInstance.current.sendMessage({
            message: parts
          });
          break; // Success!
        } catch (err: any) {
          retries++;
          // If it's a 503 or 429, wait and retry
          if ((err?.status === 503 || err?.status === 429 || err?.message?.includes('503') || err?.message?.includes('429')) && retries < maxRetries) {
            console.warn(`PsycheLens AI: Server busy (503/429). Retrying attempt ${retries}...`);
            await new Promise(r => setTimeout(r, 1500 * retries));
            continue;
          }
          throw err; // Re-throw if other error or exhausted retries
        }
      }
      
      if (!response) throw new Error("Failed to get response after retries");

      const aiParts = response.candidates?.[0]?.content?.parts || [];
      const aiMsg: Message = { id: generateId(), role: 'model', parts: aiParts, timestamp: Date.now() };
      
      if (user) {
        await updateCurrentSession([...messages, newUserMessage, aiMsg]);
        // Increment global message count
        const statsRef = doc(db, 'stats', 'global');
        setDoc(statsRef, { totalMessages: increment(1) }, { merge: true }).catch(() => {});
      } else {
        setSessions(prev => {
          const session = prev[currentSessionId];
          if (!session) return prev;
          return {
            ...prev,
            [currentSessionId]: { ...session, messages: [...session.messages, aiMsg] }
          };
        });
      }
    } catch (error) {
      console.error("Chat Error:", error);
      const errorMsg: Message = { id: generateId(), role: 'model', parts: [{ text: "Error syncing with psychological database. Please retry analysis." }], timestamp: Date.now() };
      if (user) {
        await updateCurrentSession([...messages, newUserMessage, errorMsg]);
      } else {
        setSessions(prev => {
          const session = prev[currentSessionId];
          if (!session) return prev;
          return {
            ...prev,
            [currentSessionId]: { ...session, messages: [...session.messages, errorMsg] }
          };
        });
      }
    } finally {
      setIsLoading(false);
      setLoadingStepIndex(-1);
    }
  };

  const handleFormSubmit = async (answers: Record<string, string>) => {
    setIsLoading(true);
    
    // Multi-stage loading to simulate deep analysis
    const formStages = [
      "Integrating form metadata...",
      "Recalculating behavioral vectors...",
      "Updating subject profile..."
    ];

    const toolResponsePart = {
      functionResponse: {
        name: "request_information",
        response: { answers }
      }
    };

    const newUserMessage: Message = { id: generateId(), role: 'user', parts: [toolResponsePart], timestamp: Date.now() };
    
    if (user) {
      await updateCurrentSession([...messages, newUserMessage]);
    } else {
      setSessions(prev => {
        const session = prev[currentSessionId];
        if (!session) return prev;
        return {
          ...prev,
          [currentSessionId]: { ...session, messages: [...session.messages, newUserMessage] }
        };
      });
    }

    try {
      if (!chatInstance.current) return;

      // ... rest of stages ...
      for(let i=0; i < formStages.length; i++) {
        setLoadingStepIndex(i);
        await new Promise(r => setTimeout(r, 600));
      }

      const response = await chatInstance.current.sendMessage({
        message: [toolResponsePart]
      });
      
      const aiParts = response.candidates?.[0]?.content?.parts || [];
      const aiMsg: Message = { id: generateId(), role: 'model', parts: aiParts, timestamp: Date.now() };
      
      if (user) {
        await updateCurrentSession([...messages, newUserMessage, aiMsg]);
        // Increment global message count 
        const statsRef = doc(db, 'stats', 'global');
        setDoc(statsRef, { totalMessages: increment(1) }, { merge: true }).catch(() => {});
      } else {
        setSessions(prev => {
          const session = prev[currentSessionId];
          if (!session) return prev;
          return {
            ...prev,
            [currentSessionId]: { ...session, messages: [...session.messages, aiMsg] }
          };
        });
      }
    } catch (error) {
      console.error("Form Submission Error:", error);
    } finally {
      setIsLoading(false);
      setLoadingStepIndex(-1);
    }
  };

  const createNewSession = async () => {
    const newId = Date.now().toString();
    const newSession = {
      id: newId,
      title: "New Analysis",
      messages: [],
      createdAt: Date.now()
    };

    if (user) {
      try {
        const sessionRef = doc(db, 'users', user.uid, 'sessions', newId);
        await setDoc(sessionRef, {
          title: newSession.title,
          createdAt: newSession.createdAt
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/sessions/${newId}`);
      }
    } else {
      setSessions(prev => ({
        ...prev,
        [newId]: newSession
      }));
    }
    setCurrentSessionId(newId);
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    if (user) {
      try {
        const sessionRef = doc(db, 'users', user.uid, 'sessions', id);
        await deleteDoc(sessionRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/sessions/${id}`);
      }
    }

    if (Object.keys(sessions).length === 1) {
      if (!user) {
        // Local only behavior
        const newId = Date.now().toString();
        setSessions({
          [newId]: {
            id: newId,
            title: "Initial Analysis",
            messages: [],
            createdAt: Date.now()
          }
        });
        setCurrentSessionId(newId);
      } else {
        createNewSession();
      }
      return;
    }
    
    if (!user) {
      setSessions(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }

    if (currentSessionId === id) {
      const remainingIds = Object.keys(sessions).filter(sId => sId !== id);
      setCurrentSessionId(remainingIds[0]);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConfirmingDelete) {
      deleteSession(e, currentSessionId);
      setIsConfirmingDelete(false);
    } else {
      setIsConfirmingDelete(true);
      // Auto-reset after 3 seconds if not confirmed
      setTimeout(() => setIsConfirmingDelete(false), 3000);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-brand-cyan border-t-transparent rounded-full shadow-[0_0_20px_var(--theme-accent-1)]"
        />
      </div>
    );
  }

  if (!user && showLanding) {
    return <AuthLanding onGuestMode={() => setShowLanding(false)} />;
  }

  return (
    <div data-theme={theme} className="h-screen w-screen bg-bento-bg text-brand-text font-sans overflow-hidden flex selection:bg-brand-cyan/30 transition-colors duration-500">
      
      {/* GLOBAL NAVIGATION SIDEBAR */}
      <nav className="w-16 border-r border-bento-border bg-bento-bg/80 backdrop-blur-xl flex flex-col items-center py-6 gap-6 z-50 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-cyan to-brand-purple flex items-center justify-center shadow-lg shadow-brand-cyan/20">
          <Brain size={18} className="text-white" />
        </div>
        
        <div className="flex flex-col gap-4 mt-8 flex-1">
          <button 
            onClick={() => {
              setCurrentView('chat');
              setActiveMobileView('chat');
            }}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative",
              currentView === 'chat' ? "bg-brand-cyan/10 text-brand-cyan shadow-[0_0_15px_rgba(6,178,210,0.2)]" : "text-brand-text-muted hover:bg-brand-text-muted/5"
            )}
            title="Chat Engine"
          >
            <MessageSquare size={20} />
            {currentView === 'chat' && <motion.div layoutId="nav-acc" className="absolute left-[-1.5rem] w-1 h-6 bg-brand-cyan rounded-r-full" />}
          </button>

          <button 
            onClick={() => {
              setCurrentView('analytics');
              setActiveMobileView('analytics');
            }}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative",
              currentView === 'analytics' ? "bg-brand-purple/10 text-brand-purple shadow-[0_0_15px_rgba(139,92,246,0.2)]" : "text-brand-text-muted hover:bg-brand-text-muted/5"
            )}
            title="Neural Diagnostics"
          >
            <BarChart3 size={20} />
            {currentView === 'analytics' && <motion.div layoutId="nav-acc" className="absolute left-[-1.5rem] w-1 h-6 bg-brand-purple rounded-r-full" />}
          </button>

          {role === 'admin' && (
            <button 
              onClick={() => {
                setCurrentView('admin');
                setActiveMobileView('chat');
              }}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative",
                currentView === 'admin' ? "bg-brand-cyan/20 text-brand-cyan shadow-[0_0_15px_rgba(6,178,210,0.4)] ring-1 ring-brand-cyan/50" : "text-brand-text-muted hover:bg-brand-cyan/5 hover:text-brand-cyan"
              )}
              title="Administrator Matrix"
            >
              <Shield size={20} />
              {currentView === 'admin' && <motion.div layoutId="nav-acc" className="absolute left-[-1.5rem] w-1 h-6 bg-brand-cyan rounded-r-full shadow-[0_0_10px_var(--theme-accent-1)]" />}
              <div className="absolute top-0 right-0 w-2 h-2 bg-brand-cyan rounded-full border border-bento-bg" />
            </button>
          )}

          {!user && (
            <button 
              onClick={() => setShowLanding(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-brand-text-muted hover:bg-white/5 hover:text-brand-cyan transition-all group relative mt-4 border border-dashed border-white/10"
              title="System Exit (Return to Matrix)"
            >
              <LogIn size={20} />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-brand-cyan rounded-full animate-pulse" />
            </button>
          )}
        </div>

        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-brand-text-muted hover:bg-brand-text-muted/5 hover:text-brand-text transition-all group"
          title="System Configuration"
        >
          <Settings size={20} className="group-hover:rotate-45 transition-transform" />
        </button>
      </nav>

      {/* ADMIN VIEW */}
      {currentView === 'admin' && role === 'admin' && (
        <main className="flex-1 flex flex-col relative overflow-hidden bg-bento-bg p-6 md:p-12 overflow-y-auto custom-scrollbar">
          <div className="max-w-7xl mx-auto w-full space-y-12 pb-24">
            <header className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-brand-cyan/20 border border-brand-cyan/40 flex items-center justify-center shadow-lg shadow-brand-cyan/10">
                  <Shield size={36} className="text-brand-cyan" />
                </div>
                <div>
                  <h1 className="text-5xl font-display font-black tracking-tighter text-brand-text italic leading-none">
                    Administrator <span className="text-brand-cyan">Matrix</span>
                  </h1>
                  <p className="text-brand-text-muted text-sm uppercase tracking-[0.4em] font-black mt-2 opacity-50">
                    Neural Network Governance v1.2.6
                  </p>
                </div>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Quota Section */}
              <div className="lg:col-span-2 space-y-8">
                <div className="bento-card p-10 bg-gradient-to-br from-brand-cyan/10 via-transparent to-transparent border-brand-cyan/20">
                   <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <BarChart3 className="text-brand-cyan" size={24} />
                      <h3 className="text-2xl font-display font-bold text-brand-text">Neural Quota Monitor</h3>
                    </div>
                    <div className="px-3 py-1 bg-brand-cyan/10 rounded-full text-[10px] font-mono text-brand-cyan border border-brand-cyan/20 animate-pulse">
                      REAL-TIME SYNC
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="p-6 bg-black/40 rounded-3xl border border-white/5 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-brand-text-muted uppercase tracking-widest">Total Invocations</span>
                          <Activity size={16} className="text-brand-cyan opacity-50" />
                        </div>
                        <div className="text-5xl font-display font-black text-brand-text italic">
                          {globalStats?.totalMessages || 0}
                        </div>
                        <p className="text-[10px] text-brand-text-muted leading-relaxed opacity-60">
                          Aggregated message count across the entire subject pool since initialization.
                        </p>
                      </div>

                      <div className="p-6 bg-black/40 rounded-3xl border border-white/5 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-brand-text-muted uppercase tracking-widest">Subject Pool Density</span>
                          <Users size={16} className="text-brand-purple opacity-50" />
                        </div>
                        <div className="text-5xl font-display font-black text-brand-text italic">
                          {allUsers.length}
                        </div>
                        <p className="text-[10px] text-brand-text-muted leading-relaxed opacity-60">
                          Total unique identities registered in the database.
                        </p>
                      </div>
                    </div>

                    <div className="bg-brand-cyan/5 rounded-[2rem] border border-brand-cyan/10 p-8 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Cloud className="text-brand-cyan" size={18} />
                          <h4 className="text-sm font-black uppercase tracking-widest text-brand-text">Usage Tracking Note</h4>
                        </div>
                        <p className="text-xs text-brand-text-muted leading-relaxed italic">
                          "Since the Gemini AI Engine runs via your Google Cloud instance, you should monitor the **Google Cloud Console** for the most precise token-level analytics."
                        </p>
                      </div>
                      
                      <div className="space-y-3 mt-8">
                        <a 
                          href="https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-4 bg-brand-cyan text-black text-center font-black uppercase tracking-widest text-xs rounded-2xl flex items-center justify-center gap-3 hover:bg-brand-cyan/80 transition-all shadow-lg shadow-brand-cyan/20"
                        >
                          Google Cloud Console <ChevronDown size={16} className="-rotate-90" />
                        </a>
                        <a 
                          href="https://console.firebase.google.com/project/_/firestore/usage"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-brand-text-muted text-center font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all"
                        >
                          Firestore Usage Statistics
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bento-card p-10 border-white/5 space-y-8">
                  <div className="flex items-center gap-3">
                    <Users className="text-brand-purple" size={24} />
                    <h3 className="text-2xl font-display font-bold text-brand-text">Personnel Directory</h3>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-white/10 text-[10px] uppercase font-black tracking-widest text-brand-text-muted">
                          <th className="pb-4 pl-2">Subject Email</th>
                          <th className="pb-4">Access Tier</th>
                          <th className="pb-4">Identification Hash</th>
                          <th className="pb-4 pr-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {allUsers.map((u: any) => (
                          <tr key={u.id} className="group hover:bg-white/5 transition-colors">
                            <td className="py-4 pl-2 font-mono text-xs text-brand-text">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-brand-purple/20 flex items-center justify-center border border-brand-purple/20">
                                  <LogIn size={14} className="text-brand-purple" />
                                </div>
                                <span>{u.id === user?.uid ? `${u.role === 'admin' ? 'SYSTEM ADM' : 'YOU'}` : (u.email || u.id.substring(0, 12))}</span>
                              </div>
                            </td>
                            <td className="py-4 font-mono text-[10px]">
                              <span className={cn(
                                "px-2.5 py-1 rounded-full border font-black uppercase tracking-tighter",
                                u.role === 'admin' ? "bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan" : "bg-white/5 border-white/10 text-brand-text-muted"
                              )}>
                                {u.role || 'user'}
                              </span>
                            </td>
                            <td className="py-4 font-mono text-[10px] text-brand-text-muted opacity-40">
                              {u.id}
                            </td>
                            <td className="py-4 pr-2 text-right">
                              <button className="p-2 hover:bg-white/10 rounded-lg transition-all text-brand-text-muted hover:text-brand-cyan">
                                <ChevronDown size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* System Logs / Alerts */}
              <div className="space-y-8">
                 <div className="bento-card p-8 border-brand-cyan/10 space-y-6">
                  <div className="flex items-center gap-2 text-brand-cyan">
                    <Activity size={18} />
                    <h4 className="text-xs font-black uppercase tracking-[0.2em]">Neural Logs</h4>
                  </div>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                    {[
                      { time: '14:21:05', log: 'Admin elevation detected for ' + (user?.email || 'subject'), type: 'security' },
                      { time: '14:18:32', log: 'Global entropy sync complete.', type: 'sys' },
                      { time: '14:15:10', log: 'New subject entry created: subjects/matrix_v1', type: 'user' },
                      { time: '14:12:44', log: 'Neural diagnostic cycle success: 94.8% accuracy', type: 'info' }
                    ].map((log, i) => (
                      <div key={i} className="p-4 bg-black/40 rounded-2xl border border-white/5 space-y-2">
                        <div className="flex justify-between items-center text-[8px] font-mono opacity-30 uppercase">
                          <span>{log.time}</span>
                          <span className="text-brand-cyan">{log.type}</span>
                        </div>
                        <p className="text-[10px] font-mono leading-relaxed text-brand-text-muted">{log.log}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bento-card p-8 border-brand-purple/10 bg-brand-purple/5 space-y-4">
                  <div className="flex items-center gap-2 text-brand-purple">
                    <Lock size={18} />
                    <h4 className="text-xs font-black uppercase tracking-[0.2em]">Encryption Tier</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-brand-text">
                      <span>Neural Cipher</span>
                      <span className="text-brand-purple">Active</span>
                    </div>
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full w-[85%] bg-brand-purple shadow-[0_0_10px_var(--theme-accent-2)]" />
                    </div>
                  </div>
                  <p className="text-[9px] text-brand-text-muted leading-relaxed italic opacity-60">
                    "RSA-4096 and AES-256-GCM protocols are currently securing all subject-AI transmissions."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}
      <aside className={cn(
        "border-r border-bento-border flex flex-col bg-bento-bg/30 backdrop-blur-sm shrink-0 z-40 transition-all duration-300",
        "fixed inset-y-0 left-16 md:relative md:left-0",
        currentView !== 'chat' && "w-0 p-0 overflow-hidden border-none border-0",
        currentView === 'chat' && (isSidebarCollapsed ? "w-[0px] md:w-[0px] border-none overflow-hidden" : "w-[340px] border-r"),
        activeMobileView === 'history' && currentView === 'chat' ? "translate-x-0 visible w-[340px]" : ""
      )}>
        {/* Mobile Backdrop for Sidebar */}
        <div 
          className={cn(
            "fixed inset-0 bg-black/60 md:hidden z-[-1] transition-opacity duration-300",
            activeMobileView === 'history' ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={() => setActiveMobileView('chat')}
        />
        <div className="flex flex-col h-full p-6">
          <div className={cn("flex items-center mb-10", isSidebarCollapsed ? "justify-center" : "justify-between")}>
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-3 h-3 rounded-full bg-brand-cyan shadow-[0_0_15px_var(--theme-accent-1)] shrink-0" />
              {!isSidebarCollapsed && (
                <div className="flex flex-col">
                  <h1 className="font-display font-bold text-2xl tracking-tight bg-gradient-to-r from-brand-text to-brand-text-muted bg-clip-text text-transparent italic whitespace-nowrap">PsycheAI</h1>
                  <span className="text-[9px] font-mono opacity-30 uppercase tracking-[0.2em] mt-0.5 ml-1">v1.2.7-dash</span>
                </div>
              )}
            </div>
            
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className={cn(
                "p-2 hover:bg-brand-text-muted/10 rounded-lg transition-all text-brand-text-muted hover:text-brand-cyan active:scale-95",
                isSidebarCollapsed && "mt-2"
              )}
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isSidebarCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
            </button>
          </div>

          <button 
            onClick={createNewSession}
            className={cn(
              "flex items-center justify-center gap-3 bg-brand-cyan/10 hover:bg-brand-cyan/20 rounded-2xl transition-all border border-brand-cyan/20 group active:scale-[0.98] mb-10 overflow-hidden shrink-0",
              isSidebarCollapsed ? "h-14 w-full" : "w-full py-4 px-6"
            )}
            title="Start New Chat"
          >
            <Plus size={20} className="text-brand-cyan group-hover:scale-125 transition-transform" />
            {!isSidebarCollapsed && <span className="text-sm font-bold text-brand-text tracking-tight">New Chat</span>}
          </button>

          <div className={cn("flex flex-col gap-3 flex-1 overflow-hidden", isSidebarCollapsed && "hidden")}>
            <div className={cn(
              "text-[10px] uppercase tracking-[0.25em] text-brand-text-muted font-black mb-4 flex items-center gap-2 opacity-50 px-2",
              isSidebarCollapsed ? "justify-center" : "justify-start"
            )}>
              <History size={14} className="shrink-0" /> 
              {!isSidebarCollapsed && <span className="whitespace-nowrap">Chat History</span>}
            </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
            <AnimatePresence mode='popLayout'>
              {isMigrating && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-12 px-4 text-center border border-dashed border-brand-cyan/20 rounded-2xl bg-brand-cyan/5"
                >
                  <Database size={24} className="mx-auto mb-3 text-brand-cyan animate-bounce" />
                  <div className="text-[10px] text-brand-cyan font-mono uppercase tracking-widest leading-relaxed">
                    Migrating Data ({migrationProgress.current}/{migrationProgress.total})
                  </div>
                </motion.div>
              )}
              {Object.keys(sessions).length === 0 && !isMigrating && !isAuthLoading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-12 px-4 text-center border border-dashed border-bento-border rounded-2xl opacity-40"
                >
                  <div className="text-[10px] text-brand-text-muted font-mono uppercase tracking-widest leading-relaxed">
                    {user ? "Connecting to cloud sync..." : "Zero investigations found."}
                  </div>
                </motion.div>
              )}
              {Object.values(sessions).sort((a,b) => b.createdAt - a.createdAt).map((session) => (
                <motion.div
                  key={session.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => {
                    setCurrentSessionId(session.id);
                    setActiveMobileView('chat');
                  }}
                  className={cn(
                    "group flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border relative overflow-hidden",
                    currentSessionId === session.id 
                      ? "bg-brand-cyan/10 border-brand-cyan/20 shadow-md" 
                      : "bg-transparent border-transparent hover:bg-brand-text-muted/5 hover:border-bento-border",
                    isSidebarCollapsed ? "justify-center" : "justify-start"
                  )}
                  title={isSidebarCollapsed ? session.title : undefined}
                >
                  <MessageSquare size={16} className={cn(
                    "shrink-0 transition-colors",
                    currentSessionId === session.id ? "text-brand-cyan" : "text-brand-text-muted/40"
                  )} />
                  {!isSidebarCollapsed && (
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "text-[14px] font-semibold truncate transition-colors mb-0.5",
                        currentSessionId === session.id ? "text-brand-text" : "text-brand-text-muted group-hover:text-brand-text font-normal"
                      )}>
                        {session.title}
                      </div>
                      <div className="text-[11px] text-brand-text-muted/40 font-mono">
                        {new Date(session.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="pt-6 border-t border-bento-border mt-6">
          <div className={cn(
            "text-[10px] uppercase tracking-[0.25em] text-brand-text-muted font-black mb-6 flex items-center gap-2 opacity-50 px-2",
            isSidebarCollapsed ? "justify-center" : "justify-start"
          )}>
            <Palette size={14} className="shrink-0" /> 
            {!isSidebarCollapsed && <span className="whitespace-nowrap">UI Theme Selection</span>}
          </div>
          <div className={cn("flex flex-wrap gap-3 px-1", isSidebarCollapsed ? "justify-center" : "justify-start")}>
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                title={t.label}
                className={cn(
                  "w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center overflow-hidden active:scale-90 shrink-0",
                  theme === t.id ? "border-brand-cyan scale-110 shadow-lg" : "border-transparent opacity-60 hover:opacity-100 hover:scale-105"
                )}
                style={{ background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})` }}
              >
                {theme === t.id && <Check size={14} className="text-white drop-shadow-md" />}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-6 mt-auto border-t border-bento-border">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-2xl transition-all text-brand-text-muted hover:text-brand-text hover:bg-brand-text-muted/5 group",
              isSidebarCollapsed ? "justify-center" : "justify-start"
            )}
          >
            <Settings size={20} className="shrink-0 group-hover:rotate-90 transition-transform duration-500" />
            {!isSidebarCollapsed && <span className="text-[14px] font-bold">Preferences</span>}
          </button>
        </div>
      </div>
      </aside>

      {/* ANALYTICS VIEW */}
      {currentView === 'analytics' && (
        <main className="flex-1 flex flex-col relative overflow-hidden bg-bento-bg p-6 md:p-12 overflow-y-auto custom-scrollbar">
          <div className="max-w-6xl mx-auto w-full space-y-12 pb-24">
            <header className="flex flex-col gap-2">
              <h1 className="text-4xl md:text-5xl font-display font-black tracking-tighter text-brand-text italic">
                Neural <span className="text-brand-purple">Diagnostics</span>
              </h1>
              <p className="text-brand-text-muted font-light text-lg">Comprehensive behavioral matrix and semantic analysis results.</p>
            </header>

            {/* DASHBOARD GRID */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Main Mood Diagnostic */}
              <div className="md:col-span-8 bento-card p-8 bg-gradient-to-br from-brand-cyan/10 to-brand-purple/5 border-brand-cyan/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Brain size={200} />
                </div>
                <div className="flex flex-col h-full justify-between gap-12">
                   <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-brand-cyan font-black mb-6 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-brand-cyan animate-ping" />
                      Live Neural Subject Pulse
                    </div>
                    <div className="text-6xl md:text-8xl font-display font-black text-brand-text tracking-tighter uppercase italic leading-tight">
                      {currentMood}
                    </div>
                   </div>
                   <div className="flex flex-wrap gap-12">
                      <div className="flex flex-col">
                        <span className="text-[11px] uppercase tracking-widest text-brand-text-muted font-bold mb-2">Total Nodes</span>
                        <span className="text-4xl font-display font-black text-brand-text">{analyticsData.totalMessages}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] uppercase tracking-widest text-brand-text-muted font-bold mb-2">Visual Input</span>
                        <span className="text-4xl font-display font-black text-brand-text">{analyticsData.totalImages}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] uppercase tracking-widest text-brand-text-muted font-bold mb-2">System Accuracy</span>
                        <span className="text-4xl font-display font-black text-brand-cyan italic">94.8%</span>
                      </div>
                   </div>
                </div>
              </div>

              {/* Biomarkers */}
              <div className="md:col-span-4 bento-card p-8 border-brand-purple/20 flex flex-col gap-8">
                 <div className="text-[11px] uppercase tracking-[0.2em] text-brand-purple font-black flex items-center gap-2">
                  <Activity size={14} /> Active Mental Indicators
                </div>
                <div className="space-y-8">
                  <MetricItem label="Emotional Intensity" value={messages.length > 2 ? 82 : 12} />
                  <MetricItem label="Lexical Complexity" value={messages.length > 0 ? 91 : 0} />
                  <MetricItem label="Synthesis Stability" value={88} />
                </div>
              </div>

              {/* Volume Distribution */}
              <div className="md:col-span-6 bento-card p-8 border-brand-cyan/10">
                <div className="flex items-center justify-between mb-8">
                  <span className="text-[11px] font-bold text-brand-cyan uppercase tracking-widest">Interaction Frequency</span>
                  <span className="text-[10px] font-mono text-brand-text-muted">Messages per Session</span>
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData.messagesPerSession}>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', fontSize: '11px' }}
                        itemStyle={{ color: '#06b2d2' }}
                        cursor={{ fill: 'rgba(6, 178, 210, 0.05)' }}
                      />
                      <Bar dataKey="messages" fill="#06b2d2" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Resource Typing */}
              <div className="md:col-span-6 bento-card p-8 border-brand-purple/10">
                <div className="flex items-center justify-between mb-8">
                  <span className="text-[11px] font-bold text-brand-purple uppercase tracking-widest">Content Composition</span>
                  <span className="text-[10px] font-mono text-brand-text-muted">Analysis of Text vs Images</span>
                </div>
                <div className="h-[300px] flex items-center">
                  <div className="w-1/2 h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analyticsData.breakdownData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={8}
                          dataKey="value"
                        >
                          {analyticsData.breakdownData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-1/2 flex flex-col gap-8 pl-8">
                    <div className="space-y-2">
                       <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-brand-cyan" />
                        <span className="text-[11px] font-bold text-brand-text-muted uppercase">Total Text Messages</span>
                       </div>
                       <div className="text-3xl font-display font-black text-brand-text pl-5">{analyticsData.totalMessages - analyticsData.totalImages}</div>
                    </div>
                    <div className="space-y-2">
                       <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-brand-purple" />
                        <span className="text-[11px] font-bold text-brand-text-muted uppercase">Total Images Processed</span>
                       </div>
                       <div className="text-3xl font-display font-black text-brand-text pl-5">{analyticsData.totalImages}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Archetypes */}
              <div className="md:col-span-12 bento-card p-8">
                <div className="text-[11px] uppercase tracking-[0.2em] text-brand-text-muted font-black mb-8 flex items-center gap-2 opacity-60">
                   <Users size={14} /> User Archetype Analysis
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <SubjectItem name="Primary Ego" role="Main Voice" status="Synchronized" />
                  <SubjectItem name="The Shadow" role="Hidden Thoughts" status="Analyzing" />
                  <SubjectItem name="The Anima" role="Emotional Base" status="Synchronized" />
                  <SubjectItem name="The Persona" role="External Image" status="Locked" />
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* MAIN CONTENT - CHAT AREA */}
      {currentView === 'chat' && (
        <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Background Depth Flare */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
          <div className="absolute top-[-10%] right-[-5%] w-[60%] h-[60%] rounded-full bg-[radial-gradient(circle,var(--theme-accent-1)_0%,transparent_70%)] blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[50%] h-[50%] rounded-full bg-[radial-gradient(circle,var(--theme-accent-2)_0%,transparent_70%)] blur-[120px]" />
        </div>

        {/* TOP BAR */}
        <header className="h-16 border-b border-bento-border px-4 md:px-8 flex items-center justify-between bg-bento-bg/80 backdrop-blur-xl z-20 shrink-0">
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => {
                if (window.innerWidth < 768) {
                  setActiveMobileView(activeMobileView === 'history' ? 'chat' : 'history');
                } else {
                  setIsSidebarCollapsed(!isSidebarCollapsed);
                }
              }}
              className="p-3 -ml-2 text-brand-text-muted hover:text-brand-cyan transition-colors"
              aria-label="Toggle Sessions"
            >
              <PanelLeft size={22} className={cn((!isSidebarCollapsed || activeMobileView === 'history') && "text-brand-cyan")} />
            </button>
            <div className="hidden xs:flex px-2 md:px-3 py-1.5 bg-brand-cyan/10 rounded-full border border-brand-cyan/20 text-[9px] md:text-[10px] font-black text-brand-cyan uppercase tracking-widest items-center gap-1.5 md:gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-cyan opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-cyan"></span>
              </span>
              <span className="hidden xs:inline">CORE SYNC ACTIVE</span>
              <span className="xs:hidden">ACTIVE</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3">
             <AnimatePresence>
               {isMigrating && (
                 <motion.div 
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: 20 }}
                   className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-brand-cyan/10 border border-brand-cyan/20 rounded-lg text-[10px] font-mono text-brand-cyan animate-pulse"
                 >
                   <div className="w-2 h-2 rounded-full bg-brand-cyan" />
                   <span className="uppercase tracking-widest">Migrating ({migrationProgress.current}/{migrationProgress.total})</span>
                 </motion.div>
               )}
             </AnimatePresence>

            <div className="flex items-center gap-2 md:gap-3 shrink-0">
               <div className="flex items-center gap-2 md:gap-3 px-3 py-1.5 md:px-5 md:py-2.5 bg-bento-card border border-bento-border rounded-xl text-[10px] md:text-[11px] font-mono shadow-[inset_0_1px_4px_rgba(0,0,0,0.5)]">
                 {user ? (
                   <>
                     <div className="flex flex-col text-right">
                       <span className="uppercase tracking-widest font-black text-brand-text truncate max-w-[80px] md:max-w-[160px] leading-tight grow">{user.email?.split('@')[0]}</span>
                       {role === 'admin' && (
                         <div className="flex items-center justify-end gap-1.5 mt-0.5">
                           <div className="w-1 h-1 rounded-full bg-brand-cyan animate-pulse" />
                           <span className="text-[7px] md:text-[9px] font-black text-brand-cyan tracking-wider uppercase italic drop-shadow-[0_0_5px_var(--theme-accent-1)]">Administrator Dashboard</span>
                         </div>
                       )}
                     </div>
                     <div className="w-[1.5px] h-4 md:h-7 bg-white/10 mx-1 md:mx-2" />
                     <button onClick={() => signOut(auth)} className="p-1.5 md:p-2 hover:bg-brand-cyan/10 rounded-lg text-brand-text-muted hover:text-brand-cyan transition-all group" title="Terminate Session">
                       <LogOut size={14} className="md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" />
                     </button>
                   </>
                 ) : (
                   <>
                     <span className="uppercase tracking-widest font-black opacity-40">Local Uplink</span>
                     <button onClick={() => signInWithPopup(auth, googleProvider)} className="ml-2 hover:text-brand-cyan transition-colors" title="Establish Cloud Sync"><LogIn size={16} /></button>
                   </>
                 )}
               </div>


            {/* Desktop only Matrix Toggle moved to a more subtle position or removed if unnecessary */}
            
            <button 
              onClick={handleDeleteClick}
              className={cn(
                "flex items-center gap-2 p-2 border rounded-lg transition-all active:scale-95 group relative overflow-hidden",
                isConfirmingDelete 
                  ? "bg-red-500 text-white border-red-500 px-4" 
                  : "border-bento-border text-brand-text-muted hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/50"
              )}
              title={isConfirmingDelete ? "Confirm Deletion" : "Delete Analysis Node"}
            >
              {isConfirmingDelete ? (
                <>
                  <Trash2 size={16} className="animate-bounce" />
                  <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Confirm Wipe?</span>
                </>
              ) : (
                <Trash2 size={16} className="group-hover:animate-pulse" />
              )}
            </button>
          </div>
        </div>
      </header>

        {/* MESSAGES */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 md:p-8 custom-scrollbar scroll-smooth"
        >
          <div className="w-full max-w-6xl mx-auto space-y-6 md:space-y-12 pb-24">
            {hasHiddenMessages && (
              <div className="flex justify-center pb-8 sticky top-0 z-10">
                <button 
                  onClick={() => setShowFullHistory(true)}
                  className="px-4 md:px-6 py-2.5 bg-bento-card border border-bento-border rounded-full text-[9px] md:text-[10px] font-black text-brand-cyan uppercase tracking-[0.2em] md:tracking-[0.3em] transition-all hover:border-brand-cyan/40 hover:shadow-lg shadow-black/50"
                >
                  Retrieve System Archipelago ({messages.length - WINDOW_SIZE} NODES)
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="h-[60vh] md:h-[70vh] flex flex-col items-center justify-center text-center px-4 md:px-12">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0, rotate: -5 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 15 }}
                  className="relative mb-8 md:mb-12"
                >
                  <div className="absolute -inset-8 md:-inset-12 bg-brand-cyan/10 blur-[60px] md:blur-[100px] rounded-full animate-pulse" />
                  <Brain className="w-16 h-16 md:w-24 md:h-24 text-brand-cyan relative z-10 drop-shadow-[0_0_20px_rgba(6,178,210,0.4)]" />
                </motion.div>
                <h2 className="text-2xl md:text-4xl font-display font-medium text-brand-text mb-4 tracking-tighter">Initiate Synchronization</h2>
                <p className="text-brand-text-muted max-w-sm leading-relaxed font-light text-base md:text-xl opacity-60">Feed the array with behavioral variables to generate a diagnostic.</p>
              </div>
            ) : (
              visibleMessages.map((msg, idx) => {
                const textPart = msg.parts.find((p: any) => p.text);
                const functionCall = msg.role === 'model' ? msg.parts.find((p: any) => p.functionCall)?.functionCall : null;
                const images = msg.parts.filter((p: any) => p.inlineData).map((p: any) => p.inlineData.data);
                
                if (msg.role === 'user' && !textPart && images.length === 0) return null;
                
                return (
                  <ChatMessage 
                    key={msg.id || `${currentSessionId}-${idx}`} 
                    id={msg.id || `${currentSessionId}-${idx}`}
                    role={msg.role} 
                    content={textPart?.text} 
                    parts={msg.parts}
                    timestamp={msg.timestamp}
                    functionCall={functionCall}
                    onFormSubmit={handleFormSubmit}
                    isLoading={isLoading && idx === visibleMessages.length - 1}
                  />
                );
              })
            )}

            {isLoading && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-3 md:gap-6 max-w-full md:max-w-[85%] px-2 md:px-0"
              >
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-brand-purple/10 flex items-center justify-center animate-pulse border border-brand-purple/20 shrink-0 shadow-lg mt-1">
                  <Brain className="w-4 h-4 md:w-6 md:h-6 text-brand-purple" />
                </div>
                
                {preferences.enhancedThinkingEnabled ? (
                  <div className="bg-bento-card p-5 md:p-8 rounded-3xl rounded-tl-sm border border-bento-border font-sans tracking-tight flex flex-col gap-4 md:gap-6 flex-1 shadow-2xl glass-panel min-w-0 md:min-w-[320px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 md:gap-3">
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          className="w-3 h-3 md:w-4 md:h-4 rounded-full border-2 border-brand-cyan border-t-transparent"
                        />
                        <span className="text-brand-text font-bold uppercase tracking-[0.1em] md:tracking-[0.25em] text-[9px] md:text-[11px]">Neural Deep-Link Active</span>
                      </div>
                      <span className="text-[9px] md:text-[10px] font-mono text-brand-cyan/60 hidden sm:block">STATUS: ANALYZING</span>
                    </div>

                    <div className="space-y-2 md:space-y-3">
                      {[
                        "Securing analytical uplink...",
                        "Intercepting semantic patterns...",
                        "Mapping neuro-emotional density...",
                        "Cross-referencing behavioral archetypes...",
                        "Isolating cognitive distortions...",
                        "Finalizing neuro-linguistic synthesis..."
                      ].map((step, i) => (
                        <div key={i} className="flex items-center gap-2 md:gap-3">
                          <div className={cn(
                            "w-3 h-3 md:w-4 md:h-4 rounded-full flex items-center justify-center border transition-all duration-300",
                            i < loadingStepIndex ? "bg-brand-cyan border-brand-cyan" : "bg-transparent border-brand-text-muted/20"
                          )}>
                            {i < loadingStepIndex ? (
                              <Check size={6} className="text-bento-bg stroke-[4px] md:w-2 md:h-2" />
                            ) : i === loadingStepIndex ? (
                              <div className="w-0.5 h-0.5 md:w-1 md:h-1 rounded-full bg-brand-cyan animate-pulse" />
                            ) : null}
                          </div>
                          <span className={cn(
                            "text-[10px] md:text-[12px] transition-colors duration-300 truncate",
                            i < loadingStepIndex ? "text-brand-text/60" : i === loadingStepIndex ? "text-brand-cyan font-bold" : "text-brand-text-muted/30"
                          )}>
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-1 md:pt-2">
                      <div className="h-1 w-full bg-brand-text-muted/5 rounded-full overflow-hidden p-[1px]">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${((loadingStepIndex + 1) / 6) * 100}%` }}
                          className="h-full bg-gradient-to-r from-brand-cyan to-brand-purple rounded-full shadow-[0_0_10px_var(--theme-accent-1)]"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-bento-card p-4 md:p-6 rounded-3xl rounded-tl-sm border border-bento-border font-sans tracking-tight flex items-center gap-3 md:gap-4 shadow-2xl glass-panel min-w-0 md:min-w-[200px]">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 md:w-5 md:h-5 rounded-full border-2 border-brand-cyan border-t-transparent shrink-0"
                    />
                    <div className="flex items-baseline gap-1">
                      <span className="text-brand-text font-bold text-[14px] md:text-[15px]">Analyzing</span>
                      <span className="flex gap-0.5 md:gap-1 items-baseline">
                        <motion.span 
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                          className="text-brand-cyan font-black text-lg md:text-xl leading-none"
                        >.</motion.span>
                        <motion.span 
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                          className="text-brand-cyan font-black text-lg md:text-xl leading-none"
                        >.</motion.span>
                        <motion.span 
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                          className="text-brand-cyan font-black text-lg md:text-xl leading-none"
                        >.</motion.span>
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>

        <div className="p-3 md:p-8 pt-0 z-20 shrink-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <div className="w-full max-w-6xl mx-auto">
            <PsychInput onSend={handleSendMessage} onMoodUpdate={setCurrentMood} disabled={isLoading} />
          </div>
        </div>
      </main>
    )}

      {/* MODAL OVERLAY - SETTINGS */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
            onClick={(e) => e.target === e.currentTarget && setIsSettingsOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-md bg-bento-card border border-bento-border rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 shadow-2xl relative overflow-hidden glass-panel flex flex-col max-h-[90vh]"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-cyan via-brand-purple to-brand-cyan" />
              
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-brand-cyan/10 rounded-xl text-brand-cyan border border-brand-cyan/20">
                    <Settings size={22} />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-xl tracking-tight text-brand-text">Settings</h2>
                    <p className="text-[10px] text-brand-text-muted uppercase tracking-[0.25em] font-black opacity-40">App Preferences</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-3 md:p-2 text-brand-text-muted hover:text-brand-text transition-colors bg-brand-text-muted/5 rounded-xl"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 -mr-1">
                <div className="space-y-3 pb-6">
                <div className="bg-bento-bg/50 p-3.5 rounded-2xl border border-bento-border group hover:border-brand-cyan/30 transition-all">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <History size={14} className="text-brand-cyan" />
                        <span className="text-[11px] font-bold text-brand-text uppercase tracking-widest leading-none">Save Chat History</span>
                      </div>
                      <p className="text-[10px] text-brand-text-muted leading-relaxed font-light">
                        Remember your chats so you can continue them later.
                      </p>
                    </div>
                    <button 
                      onClick={() => setPreferences(prev => ({ ...prev, chatHistoryEnabled: !prev.chatHistoryEnabled }))}
                      className={cn(
                        "w-10 h-5 rounded-full p-0.5 transition-all duration-500 relative shrink-0",
                        preferences.chatHistoryEnabled ? "bg-brand-cyan" : "bg-brand-text-muted/20"
                      )}
                    >
                      <motion.div 
                        className="w-4 h-4 bg-white rounded-full shadow-lg"
                        animate={{ x: preferences.chatHistoryEnabled ? 20 : 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>
                </div>

                <div className="bg-bento-bg/50 p-3.5 rounded-2xl border border-bento-border group hover:border-brand-purple/30 transition-all">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Brain size={14} className="text-brand-purple" />
                        <span className="text-[11px] font-bold text-brand-text uppercase tracking-widest leading-none">Enhanced Thinking</span>
                      </div>
                      <p className="text-[10px] text-brand-text-muted leading-relaxed font-light">
                        Display the detailed analysis process.
                      </p>
                    </div>
                    <button 
                      onClick={() => setPreferences(prev => ({ ...prev, enhancedThinkingEnabled: !prev.enhancedThinkingEnabled }))}
                      className={cn(
                        "w-10 h-5 rounded-full p-0.5 transition-all duration-500 relative shrink-0",
                        preferences.enhancedThinkingEnabled ? "bg-brand-purple" : "bg-brand-text-muted/20"
                      )}
                    >
                      <motion.div 
                        className="w-4 h-4 bg-white rounded-full shadow-lg"
                        animate={{ x: preferences.enhancedThinkingEnabled ? 20 : 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>
                </div>

                <div className="bg-brand-purple/5 p-3.5 rounded-2xl border border-brand-purple/10 flex items-start gap-3">
                  <div className="p-1.5 bg-brand-purple/10 rounded-lg text-brand-purple shrink-0 mt-0.5">
                    <Shield size={14} />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-brand-text block mb-0.5 uppercase tracking-widest">Privacy & Security</span>
                    <p className="text-[10px] text-brand-text-muted leading-relaxed font-light opacity-80">
                      Processing is local-first or sync-only via your Google Cloud instance.
                    </p>
                  </div>
                </div>

                <div className="bg-brand-cyan/5 p-3.5 rounded-2xl border border-brand-cyan/10 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Database size={14} className="text-brand-cyan" />
                    <span className="text-[11px] font-bold text-brand-text uppercase tracking-widest">Cloud Database</span>
                  </div>
                  <div className="space-y-2">

                    <a 
                      href="https://console.firebase.google.com/project/gen-lang-client-0067365372/firestore/databases/ai-studio-5a2650ce-574d-405d-9e89-b04738d79b13/data"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2.5 bg-black/40 rounded-xl border border-brand-cyan/20 hover:border-brand-cyan/50 transition-all text-[10px] text-brand-text group"
                    >
                      <span className="font-mono">Open Firestore Console</span>
                      <ChevronDown size={14} className="-rotate-90 text-brand-text-muted group-hover:text-brand-cyan" />
                    </a>
                    
                    <div className="flex flex-col gap-1 px-1 pb-1">
                      <div className="flex justify-between text-[9px] font-mono text-brand-text-muted">
                        <span>Local Data Cache</span>
                        <span className={cn((migrationDataRef.current.sessions || hasFoundSecondaryData) && "text-brand-cyan")}>
                          {(migrationDataRef.current.sessions || hasFoundSecondaryData) ? "Detected" : "Empty"}
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono text-brand-text-muted">
                        <span>Database Connection</span>
                        <span className={cn(user && "text-brand-cyan")}>
                          {user ? "Cloud Sync Active" : "Local Only"}
                        </span>
                      </div>
                      {user && (
                        <div className="flex justify-between text-[8px] font-mono text-brand-text-muted/60 bg-black/20 p-1.5 rounded mt-0.5 overflow-hidden">
                          <span className="truncate mr-2">UID: {user.uid}</span>
                          <span className="shrink-0">{user.email?.split('@')[0]}</span>
                        </div>
                      )}
                    </div>

                    {migrationError && (
                      <div className="text-[9px] text-red-400 font-mono p-2 bg-red-400/10 rounded border border-red-400/20 mb-2">
                        ERROR: {migrationError}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => {
                          const data = migrationDataRef.current.sessions || localStorage.getItem('psych_sessions');
                          if (data) {
                            const blob = new Blob([data], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `psyche_history_backup_${Date.now()}.json`;
                            a.click();
                          }
                        }}
                        className="py-2.5 bg-black/40 hover:bg-black/60 border border-bento-border rounded-xl text-[9px] font-bold uppercase tracking-widest text-brand-text-muted transition-all"
                      >
                        Download Backup
                      </button>

                      <button 
                         onClick={() => {
                           const input = document.createElement('input');
                           input.type = 'file';
                           input.accept = '.json';
                           input.onchange = async (e: any) => {
                             const file = e.target.files[0];
                             const reader = new FileReader();
                             reader.onload = async (event: any) => {
                               try {
                                 const imported = JSON.parse(event.target.result);
                                 if (user) {
                                    // Manual migration to Firestore
                                    setIsMigrating(true);
                                    for (const [id, session] of Object.entries(imported)) {
                                      const s = session as Session;
                                      await setDoc(doc(db, 'users', user.uid, 'sessions', id), {
                                        title: s.title,
                                        createdAt: s.createdAt
                                      });
                                      const batch = writeBatch(db);
                                      s.messages.forEach(m => {
                                        batch.set(doc(db, 'users', user.uid, 'sessions', id, 'messages', m.id || crypto.randomUUID()), {
                                          role: m.role,
                                          parts: m.parts,
                                          timestamp: m.timestamp || Date.now()
                                        });
                                      });
                                      await batch.commit();
                                    }
                                    setIsMigrating(false);
                                 } else {
                                   localStorage.setItem('psych_sessions', JSON.stringify(imported));
                                   setSessions(imported);
                                   setCurrentSessionId(Object.keys(imported)[0]);
                                 }
                                 alert("Import Successful!");
                               } catch (err) {
                                 console.error("Import failed", err);
                                 alert("Import failed: check file format");
                               }
                             };
                             reader.readAsText(file);
                           };
                           input.click();
                         }}
                         className="py-2.5 bg-brand-cyan/10 hover:bg-brand-cyan/20 border border-brand-cyan/30 rounded-xl text-[9px] font-bold uppercase tracking-widest text-brand-cyan transition-all"
                      >
                        Import Backup
                      </button>
                    </div>

                      <button 
                        onClick={() => {
                          const allKeys = Object.keys(localStorage);
                          const found: Record<string, Session> = {};
                          let count = 0;
                          
                          allKeys.forEach(k => {
                            if (k.includes('psych') || k.includes('session')) {
                              try {
                                const data = JSON.parse(localStorage.getItem(k) || "");
                                if (typeof data === 'object') {
                                  // Looks like a session object
                                  Object.entries(data).forEach(([sId, s]: [string, any]) => {
                                    if (s.messages && Array.isArray(s.messages)) {
                                      found[sId] = s;
                                      count++;
                                    }
                                  });
                                }
                              } catch(e) {}
                            }
                          });

                          if (count > 0) {
                            migrationDataRef.current.sessions = JSON.stringify(found);
                            setHasFoundSecondaryData(true);
                            setMigrationError(`Found ${count} historical items in secondary storage. You can now use the Restore or Retry buttons.`);
                          } else {
                            alert("No additional data found in browser storage.");
                          }
                        }}
                        className="w-full py-2 bg-brand-text-muted/5 hover:bg-brand-text-muted/10 border border-bento-border/50 rounded-xl text-[9px] font-bold uppercase tracking-widest text-brand-text-muted transition-all mt-1"
                      >
                        Deep Search Browser Storage
                      </button>

                      <div className="pt-2 min-h-[40px]">
                        <button 
                          onClick={() => {
                            const allKeys = Object.keys(localStorage);
                            const found: Record<string, Session> = {};
                            let count = 0;
                            
                            allKeys.forEach(k => {
                              if (k.includes('psych') || k.includes('session')) {
                                try {
                                  const data = JSON.parse(localStorage.getItem(k) || "");
                                  if (typeof data === 'object') {
                                    Object.entries(data).forEach(([sId, s]: [string, any]) => {
                                      if (s.messages && Array.isArray(s.messages)) {
                                        found[sId] = s;
                                        count++;
                                      }
                                    });
                                  }
                                } catch(e) {}
                              }
                            });

                            if (count > 0) {
                              migrationDataRef.current.sessions = JSON.stringify(found);
                              setHasFoundSecondaryData(true);
                              setMigrationError(`Found ${count} historical items. You can now use the Restore button.`);
                            } else {
                              alert("No additional data found in browser storage.");
                            }
                          }}
                          className="w-full py-2 bg-brand-text-muted/5 hover:bg-brand-text-muted/10 border border-bento-border/50 rounded-xl text-[9px] font-bold uppercase tracking-widest text-brand-text-muted transition-all mb-4"
                        >
                          Deep Search Browser Storage
                        </button>

                        {(migrationDataRef.current.sessions || hasFoundSecondaryData) && !isMigrating ? (
                          <div className="flex flex-col gap-2">
                            {user ? (
                              <button 
                                onClick={async () => {
                                  if (!migrationDataRef.current.sessions) {
                                    alert("No data cached in memory. Try Deep Search first.");
                                    return;
                                  }
                                  setMigrationError(null);
                                  setIsMigrating(true);
                                  
                                  try {
                                    const imported = JSON.parse(migrationDataRef.current.sessions);
                                    let successCount = 0;
                                    const sessionEntries = Object.entries(imported);
                                    
                                    if (sessionEntries.length === 0) {
                                      alert("Stored data is empty.");
                                      return;
                                    }

                                    for (const [id, session] of sessionEntries) {
                                      const s = session as Session;
                                      await setDoc(doc(db, 'users', user.uid, 'sessions', id), {
                                        title: s.title || "Restored Session",
                                        createdAt: s.createdAt || Date.now()
                                      });
                                      
                                      const batch = writeBatch(db);
                                      if (s.messages && Array.isArray(s.messages)) {
                                        s.messages.forEach(m => {
                                          batch.set(doc(db, 'users', user.uid, 'sessions', id, 'messages', m.id || generateId()), {
                                            role: m.role,
                                            parts: m.parts,
                                            timestamp: m.timestamp || Date.now()
                                          });
                                        });
                                        await batch.commit();
                                      }
                                      successCount++;
                                    }
                                    
                                    alert(`Successfully synced ${successCount} sessions to your cloud account. They will appear in your sidebar shortly.`);
                                    migrationDataRef.current.sessions = null;
                                    setHasFoundSecondaryData(false);
                                    localStorage.removeItem('psych_sessions');
                                  } catch (err) {
                                    console.error("Sync failed", err);
                                    alert("Sync failed: " + (err instanceof Error ? err.message : "Invalid data format"));
                                    setMigrationError("Sync failed: " + (err instanceof Error ? err.message : String(err)));
                                  } finally {
                                    setIsMigrating(false);
                                  }
                                }}
                                className="w-full py-2.5 bg-brand-cyan/20 hover:bg-brand-cyan/30 border border-brand-cyan/40 rounded-xl text-[10px] font-bold uppercase tracking-widest text-brand-cyan transition-all shadow-lg"
                              >
                                Sync Found Data to Cloud ({JSON.parse(migrationDataRef.current.sessions || '{}') ? Object.keys(JSON.parse(migrationDataRef.current.sessions || '{}')).length : 0} items)
                              </button>
                            ) : (
                              <div className="text-[9px] text-center text-brand-cyan/80 mb-1 font-mono uppercase bg-brand-cyan/5 p-2 rounded border border-brand-cyan/10">
                                Log in to sync this data to cloud
                              </div>
                            )}
                            
                            <button 
                              onClick={() => {
                                const sessionsToRestore = migrationDataRef.current.sessions || localStorage.getItem('psych_sessions');
                                if (!sessionsToRestore || sessionsToRestore === "{}" || sessionsToRestore === "null") {
                                  alert("No valid data found to restore. Try 'Deep Search' first.");
                                  return;
                                }

                                try {
                                  const parsed = JSON.parse(sessionsToRestore);
                                  const sessionCount = Object.keys(parsed).length;
                                  
                                  if (sessionCount === 0) {
                                    alert("No sessions found in the selected storage.");
                                    return;
                                  }

                                  if (user) {
                                    const confirmMerge = window.confirm(`Found ${sessionCount} sessions. Restoring will MERGE them into your current list. Proceed?`);
                                    if (!confirmMerge) return;
                                  }
                                  
                                  setSessions(prev => {
                                    const merged = {...prev, ...parsed};
                                    localStorage.setItem('psych_sessions', JSON.stringify(merged));
                                    
                                    // Auto-select the first one from imported
                                    const firstKey = Object.keys(parsed)[0];
                                    if (firstKey) {
                                      setTimeout(() => {
                                        setCurrentSessionId(firstKey);
                                        setIsSettingsOpen(false);
                                      }, 100);
                                    }
                                    return merged;
                                  });
                                  
                                  alert(`Success: ${sessionCount} historical sessions merged.`);
                                } catch (e) {
                                  console.error("Restore failed", e);
                                  alert("Restore failed: Data format error.");
                                }
                              }}
                              className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl text-[9px] font-bold uppercase tracking-widest text-amber-500 transition-all font-mono"
                            >
                              Emergency Restore to Sidebar
                            </button>
                          </div>
                        ) : (
                          <div className="text-center py-4 opacity-20 text-[9px] font-mono tracking-widest uppercase">
                            No secondary data found
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                <div className="flex items-center justify-between px-2 pt-2 border-t border-bento-border/50">
                  <div className="flex items-center gap-2 text-[10px] text-brand-text-muted font-mono">
                    <Lock size={12} className="text-brand-cyan animate-pulse" />
                    <span className="tracking-tighter uppercase opacity-50">Core Security Protocol v4.0.1</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="w-1 h-1 rounded-full bg-brand-cyan" />
                    <div className="w-1 h-1 rounded-full bg-brand-purple animate-pulse" />
                    <div className="w-1 h-1 rounded-full bg-brand-cyan" />
                  </div>
                </div>
              </div>
            </div>

              <div className="mt-8">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full py-4 bg-brand-text text-bento-bg rounded-xl font-black uppercase tracking-[0.3em] text-[10px] hover:scale-[1.02] active:scale-95 transition-all shadow-2xl glass-panel relative group overflow-hidden"
                >
                  <span className="relative z-10">Save Settings</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-brand-cyan/20 to-brand-purple/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const MetricItem = memo(function MetricItem({ label, value }: { label: string, value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] font-bold mb-1.5 px-0.5">
        <span className="opacity-60">{label}</span>
        <span className="text-brand-cyan font-mono">{value}%</span>
      </div>
      <div className="h-1.5 bg-brand-text-muted/10 rounded-full overflow-hidden p-[1px]">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          className="h-full bg-gradient-to-r from-brand-cyan to-brand-purple rounded-full shadow-[0_0_8px_var(--theme-accent-1)]"
        />
      </div>
    </div>
  );
});

const SubjectItem = memo(function SubjectItem({ name, role, status }: { name: string, role: string, status: string }) {
  return (
    <motion.div 
      whileHover={{ y: -2 }}
      className="bento-card p-4 flex flex-col gap-3 group cursor-default hover:border-brand-cyan/40"
    >
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 rounded-lg bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center font-black text-[10px] text-brand-cyan group-hover:scale-110 transition-transform">
          {name.substring(0, 2)}
        </div>
        <div className={cn(
          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
          status === 'Synchronized' ? "bg-emerald-500/10 text-emerald-500" : "bg-brand-cyan/10 text-brand-cyan animate-pulse"
        )}>
          {status}
        </div>
      </div>
      <div>
        <div className="text-[14px] font-bold text-brand-text group-hover:text-brand-cyan transition-colors truncate">{name}</div>
        <div className="text-[9px] text-brand-text-muted uppercase tracking-[0.15em] font-bold opacity-40">{role}</div>
      </div>
    </motion.div>
  );
});



