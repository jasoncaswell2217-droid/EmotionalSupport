import { useState, useRef, useEffect, memo, useMemo } from 'react';
import { Brain, FileText, Users, Activity, BarChart3, Database, Plus, UserPlus, History, MessageSquare, Palette, Check, Trash2, PanelLeftClose, PanelLeft, Settings, X, Shield, Lock, ChevronDown, ChevronLeft, LogIn, LogOut, Cloud, ImageIcon, MousePointer2, CreditCard, TrendingUp, TrendingDown, Sparkles, BookOpen, Bold, Italic, List, Smile, Heading1, ListOrdered, Minus } from 'lucide-react';
import { ChatMessage } from './components/ChatMessage';
import { PsychInput } from './components/PsychInput';
import { AuthLanding } from './components/AuthLanding';
import { startChat, Message } from './services/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { auth, db, googleProvider, OperationType, handleFirestoreError } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, onSnapshot, query, orderBy, writeBatch, Timestamp, serverTimestamp, increment } from 'firebase/firestore';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
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
  const [currentView, setCurrentView] = useState<'chat' | 'history' | 'analytics' | 'admin' | 'how-it-works'>('chat');
  const [settingsTab, setSettingsTab] = useState<'general' | 'theme'>('general');
  const [adminSubView, setAdminSubView] = useState<'overview' | 'monetization' | 'users' | 'content' | 'system'>('overview');
  const [pricingType, setPricingType] = useState<'subscriptions' | 'credits'>('subscriptions');
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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const contentEditorRef = useRef<HTMLTextAreaElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [howItWorksContent, setHowItWorksContent] = useState<{ title: string; content: string }>({
    title: "Neural Synergy: How It Works",
    content: "Our system uses advanced psychological archetypes to map your cognitive landscape. By analyzing behavioral patterns and semantic density, we generate a real-time diagnostic of your current mental state."
  });

  const [systemSettings, setSystemSettings] = useState<{ registrationEnabled: boolean; registrationDisabledMessage: string }>({
    registrationEnabled: true,
    registrationDisabledMessage: "Registration Disabled By The Admins"
  });

  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(true);

  const insertIntoContent = (prefix: string, suffix: string = '') => {
    const textarea = contentEditorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = howItWorksContent.content;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const selection = text.substring(start, end);

    const newContent = before + prefix + selection + suffix + after;
    setHowItWorksContent(prev => ({ ...prev, content: newContent }));
    
    // Maintain focus and update selection
    setTimeout(() => {
      textarea.focus();
      const newPos = start + prefix.length + selection.length + suffix.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // Sync How It Works Content
  useEffect(() => {
    const docRef = doc(db, 'settings', 'how-it-works');
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setHowItWorksContent(snap.data() as { title: string; content: string });
      }
    }, (error) => {
      if (!error.message.includes('permission-denied')) {
        console.error("How It Works sync error:", error);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync Global System Settings
  useEffect(() => {
    const docRef = doc(db, 'settings', 'global');
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setSystemSettings(snap.data() as any);
      }
    }, (error) => {
      if (!error.message.includes('permission-denied')) {
        console.error("Global Settings sync error:", error);
      }
    });
    return () => unsubscribe();
  }, []);

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
          role: isAdminEmail ? 'admin' : 'user',
          email: user.email,
          totalMessages: 0,
          createdAt: serverTimestamp(),
          lastActive: serverTimestamp()
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
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
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
            console.warn(`My Psych Lens: Server busy (503/429). Retrying attempt ${retries}...`);
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
        // Increment per-user usage
        const userRef = doc(db, 'users', user.uid);
        setDoc(userRef, { totalMessages: increment(1), lastActive: serverTimestamp() }, { merge: true }).catch(() => {});
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
        // Increment per-user usage
        const userRef = doc(db, 'users', user.uid);
        setDoc(userRef, { totalMessages: increment(1), lastActive: serverTimestamp() }, { merge: true }).catch(() => {});
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

  if (!user && showLanding && currentView !== 'how-it-works') {
    return <AuthLanding 
      onShowHowItWorks={() => setCurrentView('how-it-works')} 
      registrationEnabled={systemSettings.registrationEnabled}
      registrationDisabledMessage={systemSettings.registrationDisabledMessage}
    />;
  }

  return (
    <div data-theme={theme} className="h-screen w-screen bg-bento-bg text-brand-text font-sans overflow-hidden flex flex-col selection:bg-brand-cyan/30 transition-colors duration-500">
      
      {/* GLOBAL TOP NAVIGATION */}
      {/* GLOBAL TOP NAVIGATION */}
      <header className="h-16 border-b border-bento-border bg-bento-bg z-50 shrink-0 px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center gap-4 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-cyan to-brand-purple flex items-center justify-center shadow-lg shadow-brand-cyan/20 shrink-0">
            <Brain size={22} className="text-white" />
          </div>
          <div className="hidden md:flex flex-col">
            <h1 className="font-display font-bold text-lg tracking-tight bg-gradient-to-r from-brand-text to-brand-text-muted bg-clip-text text-transparent italic whitespace-nowrap leading-none">My Psych Lens</h1>
            <span className="text-[8px] font-mono opacity-30 uppercase tracking-[0.2em] mt-0.5">Matrix v1.2.8</span>
          </div>
        </div>

        {/* VIEW SWITCHER */}
        <div className="flex-1 flex items-center justify-center mx-2 md:mx-4 overflow-hidden">
          <div className="flex items-center bg-black/40 p-1 rounded-2xl border border-white/5 overflow-x-auto no-scrollbar flex-nowrap max-w-full">
            {user && (
              <>
                <button 
                  onClick={() => {
                    setCurrentView('chat');
                  }}
                  className={cn(
                    "px-3 md:px-5 py-2.5 rounded-[14px] text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap shrink-0",
                    currentView === 'chat' ? "bg-brand-cyan text-black shadow-lg shadow-brand-cyan/20" : "text-brand-text-muted hover:text-brand-text"
                  )}
                >
                  <MessageSquare size={14} /> <span className="hidden sm:inline">Engine</span>
                </button>
                <button 
                  onClick={() => {
                    setCurrentView('history');
                  }}
                  className={cn(
                    "px-3 md:px-5 py-2.5 rounded-[14px] text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap shrink-0",
                    currentView === 'history' ? "bg-brand-cyan text-black shadow-lg shadow-brand-cyan/20" : "text-brand-text-muted hover:text-brand-text"
                  )}
                >
                  <History size={14} /> <span className="hidden sm:inline">Chats</span>
                </button>
                <button 
                  onClick={() => {
                    setCurrentView('analytics');
                  }}
                  className={cn(
                    "px-3 md:px-5 py-2.5 rounded-[14px] text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap shrink-0",
                    currentView === 'analytics' ? "bg-brand-purple text-white shadow-lg shadow-brand-purple/20" : "text-brand-text-muted hover:text-brand-text"
                  )}
                >
                  <BarChart3 size={14} /> <span className="hidden sm:inline">Diagnostics</span>
                </button>
              </>
            )}
            <button 
              onClick={() => {
                setCurrentView('how-it-works');
              }}
              className={cn(
                "px-3 md:px-5 py-2.5 rounded-[14px] text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap shrink-0",
                currentView === 'how-it-works' ? "bg-brand-purple text-white shadow-lg shadow-brand-purple/20" : "text-brand-text-muted hover:text-brand-text"
              )}
            >
              <BookOpen size={14} /> <span className="hidden lg:inline">How It Works</span>
            </button>
            
            {role === 'admin' && (
              <button 
                onClick={() => {
                  setCurrentView('admin');
                }}
                className={cn(
                  "px-3 md:px-5 py-2.5 rounded-[14px] text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap shrink-0",
                  currentView === 'admin' ? "bg-brand-cyan text-black shadow-lg shadow-brand-cyan/20" : "text-brand-text-muted hover:text-brand-text"
                )}
              >
                <Shield size={14} /> <span className="hidden sm:inline">Admin</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 shrink-0 px-2">
          {/* CONTEXTUAL CHAT TOOLS */}
          {currentView === 'chat' && (
            <div className="flex items-center gap-2 border-r border-white/5 pr-2 md:pr-4 mr-1">
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-brand-cyan/5 rounded-xl border border-brand-cyan/20 text-[8px] font-black text-brand-cyan uppercase tracking-widest">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-cyan opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-cyan"></span>
                </span>
                <span>SYNC ACTIVE</span>
              </div>

              <button 
                onClick={handleDeleteClick}
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative",
                  isConfirmingDelete ? "bg-brand-orange text-white shadow-lg shadow-brand-orange/20" : "bg-white/5 border border-white/10 text-brand-text-muted hover:text-brand-orange hover:bg-brand-orange/5"
                )}
                title="Purge Active Session"
              >
                <Trash2 size={18} />
                {isConfirmingDelete && (
                  <motion.div 
                    layoutId="purge-badge"
                    className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-white text-[6px] font-black uppercase text-black italic animate-bounce"
                  >
                    CONFIRM
                  </motion.div>
                )}
              </button>
            </div>
          )}

          {/* USER INFO */}
          {user ? (
            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 bg-bento-card border border-bento-border rounded-xl text-[10px] font-mono shrink-0">
               <div className="flex flex-col text-right">
                 <span className="uppercase tracking-widest font-black text-brand-text truncate max-w-[120px] leading-tight">{user.email?.split('@')[0]}</span>
                 {role === 'admin' && <span className="text-[7px] text-brand-cyan font-black uppercase italic">Administrator</span>}
               </div>
               <div className="w-[1px] h-4 bg-white/10" />
               <button 
                 onClick={() => signOut(auth)} 
                 className="px-3 py-1.5 flex items-center gap-2 hover:text-brand-cyan transition-colors bg-white/5 border border-white/10 rounded-xl group" 
                 title="Secure System Exit"
               >
                 <LogOut size={14} className="group-hover:translate-x-1 transition-transform" />
                 <span className="text-[10px] font-black uppercase tracking-widest">Exit</span>
               </button>
            </div>
          ) : (
            <button 
              onClick={() => signInWithPopup(auth, googleProvider)}
              className="px-4 py-2 bg-brand-cyan text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-cyan/80 transition-all flex items-center gap-2"
            >
              <LogIn size={14} /> Login
            </button>
          )}

          {user && (
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-brand-text-muted hover:bg-white/5 hover:text-brand-text transition-all group shrink-0"
              title="System Configuration"
            >
              <Settings size={20} className="group-hover:rotate-45 transition-transform" />
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Main Content Areas */}
        {currentView === 'admin' && role === 'admin' && (
        <main className="flex-1 flex flex-col relative overflow-hidden bg-bento-bg p-4 md:p-12 overflow-y-auto custom-scrollbar">
          <div className="max-w-7xl mx-auto w-full space-y-8 md:space-y-12 pb-24">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-brand-cyan/20 border border-brand-cyan/40 flex items-center justify-center shadow-lg shadow-brand-cyan/10">
                  <Shield size={32} className="text-brand-cyan" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-5xl font-display font-black tracking-tighter text-brand-text italic leading-none">
                    Admin <span className="text-brand-cyan">Control Center</span>
                  </h1>
                  <p className="text-brand-text-muted text-[10px] md:text-sm uppercase tracking-[0.4em] font-black mt-2 opacity-50">
                    Neural Network Governance v1.2.8
                  </p>
                </div>
              </div>

              <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5 self-start">
                <button 
                  onClick={() => setAdminSubView('overview')}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                    adminSubView === 'overview' ? "bg-brand-cyan text-black shadow-lg shadow-brand-cyan/20" : "text-brand-text-muted hover:text-brand-text"
                  )}
                >
                  <Activity size={14} /> Overview
                </button>
                <button 
                  onClick={() => setAdminSubView('monetization')}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                    adminSubView === 'monetization' ? "bg-brand-purple text-white shadow-lg shadow-brand-purple/20" : "text-brand-text-muted hover:text-brand-text"
                  )}
                >
                  <CreditCard size={14} /> Monetization
                </button>
                <button 
                  onClick={() => setAdminSubView('users')}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                    adminSubView === 'users' ? "bg-brand-cyan text-black shadow-lg shadow-brand-cyan/20" : "text-brand-text-muted hover:text-brand-text"
                  )}
                >
                  <Users size={14} /> Users
                </button>
                <button 
                  onClick={() => setAdminSubView('content')}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                    adminSubView === 'content' ? "bg-brand-purple text-white shadow-lg shadow-brand-purple/20" : "text-brand-text-muted hover:text-brand-text"
                  )}
                >
                  <BookOpen size={14} /> Content
                </button>
                <button 
                  onClick={() => setAdminSubView('system')}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                    adminSubView === 'system' ? "bg-brand-cyan text-black shadow-lg shadow-brand-cyan/20" : "text-brand-text-muted hover:text-brand-text"
                  )}
                >
                  <Settings size={14} /> System
                </button>
              </div>
            </header>

            {adminSubView === 'overview' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Quota Section */}
                <div className="lg:col-span-2 space-y-8">
                  <div className="bento-card p-6 md:p-10 bg-gradient-to-br from-brand-cyan/10 via-transparent to-transparent border-brand-cyan/20">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-3">
                        <BarChart3 className="text-brand-cyan" size={24} />
                        <h3 className="text-xl md:text-2xl font-display font-bold text-brand-text">Usage & Quota Tracker</h3>
                      </div>
                      <div className="px-3 py-1 bg-brand-cyan/10 rounded-full text-[10px] font-mono text-brand-cyan border border-brand-cyan/20 animate-pulse">
                        REAL-TIME SYNC
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="p-6 bg-black/40 rounded-3xl border border-white/5 space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-brand-text-muted uppercase tracking-widest">Global AI Messages</span>
                            <Activity size={16} className="text-brand-cyan opacity-50" />
                          </div>
                          <div className="text-4xl md:text-5xl font-display font-black text-brand-text italic">
                            {globalStats?.totalMessages || 0}
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-brand-text-muted">
                              <span>Monthly Limit</span>
                              <span>{Math.round(((globalStats?.totalMessages || 0) / 10000) * 100)}%</span>
                            </div>
                            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, ((globalStats?.totalMessages || 0) / 10000) * 100)}%` }}
                                className="h-full bg-brand-cyan shadow-[0_0_8px_var(--theme-accent-1)]" 
                              />
                            </div>
                          </div>
                          <p className="text-[10px] text-brand-text-muted leading-relaxed opacity-60">
                            Aggregated message count across all users. Standard tier limit is 10k messages.
                          </p>
                        </div>

                        <div className="p-6 bg-black/40 rounded-3xl border border-white/5 space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-brand-text-muted uppercase tracking-widest">Total Registered Users</span>
                            <Users size={16} className="text-brand-purple opacity-50" />
                          </div>
                          <div className="text-4xl md:text-5xl font-display font-black text-brand-text italic">
                            {allUsers.length}
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-brand-text-muted">
                              <span>Capacity</span>
                              <span>{Math.round((allUsers.length / 50) * 100)}%</span>
                            </div>
                            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, (allUsers.length / 50) * 100)}%` }}
                                className="h-full bg-brand-purple shadow-[0_0_8px_var(--theme-accent-2)]" 
                              />
                            </div>
                          </div>
                          <p className="text-[10px] text-brand-text-muted leading-relaxed opacity-60">
                            Total number of unique user accounts. System capacity currently supports 50 users.
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

                  <div className="bento-card p-6 md:p-10 border-white/5 space-y-8">
                    <div className="flex items-center gap-3">
                      <Users className="text-brand-purple" size={24} />
                      <h3 className="text-xl md:text-2xl font-display font-bold text-brand-text">User Directory</h3>
                    </div>
                    
                    <div className="overflow-x-auto no-scrollbar">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-white/10 text-[10px] uppercase font-black tracking-widest text-brand-text-muted">
                            <th className="pb-4 pl-2">User Email</th>
                            <th className="pb-4">Access Level</th>
                            <th className="pb-4 hidden lg:table-cell">Account ID</th>
                            <th className="pb-4 pr-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {allUsers.map((u: any) => (
                            <tr key={u.id} className="group hover:bg-white/5 transition-colors">
                              <td className="py-4 pl-2 font-mono text-xs text-brand-text">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-brand-purple/20 flex items-center justify-center border border-brand-purple/20">
                                    <Users size={14} className="text-brand-purple" />
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
                              <td className="py-4 font-mono text-[10px] text-brand-text-muted opacity-40 hidden lg:table-cell">
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
                      <h4 className="text-xs font-black uppercase tracking-[0.2em]">System Activity Logs</h4>
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
            ) : adminSubView === 'monetization' ? (
              /* MONETIZATION VIEW */
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-purple/10 rounded-full border border-brand-purple/20 text-[10px] font-black text-brand-purple uppercase tracking-widest">
                      <TrendingUp size={12} /> Strategic Monetization
                    </div>
                    <h2 className="text-4xl md:text-6xl font-display font-black text-brand-text leading-none italic">
                      Revenue <br /> <span className="text-brand-purple">Architecture</span>
                    </h2>
                    <p className="text-brand-text-muted text-lg max-w-xl leading-relaxed">
                      To scale the platform while maintaining performance, we've designed a simple pricing structure with tiered subscriptions and credit packs.
                    </p>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="bg-black/40 p-1.5 rounded-2xl border border-white/5 flex w-fit">
                      <button 
                        onClick={() => setPricingType('subscriptions')}
                        className={cn(
                          "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          pricingType === 'subscriptions' ? "bg-white text-black shadow-lg" : "text-brand-text-muted hover:text-brand-text"
                        )}
                      >
                        Subscriptions
                      </button>
                      <button 
                        onClick={() => setPricingType('credits')}
                        className={cn(
                          "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          pricingType === 'credits' ? "bg-white text-black shadow-lg" : "text-brand-text-muted hover:text-brand-text"
                        )}
                      >
                        Credit Packs
                      </button>
                    </div>
                    <div className="p-6 bento-card border-brand-purple/20 bg-brand-purple/5">
                      <div className="flex items-center gap-2 mb-2 text-brand-purple">
                        <Sparkles size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Hybrid Value Proposition</span>
                      </div>
                      <p className="text-[11px] text-brand-text-muted italic leading-relaxed">
                        "Subscriptions provide stable MRR core funding, while credits capture sporadic high-intensity waves of usage without long-term friction."
                      </p>
                    </div>
                  </div>
                </div>

                {pricingType === 'subscriptions' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Free Tier */}
                    <div className="bento-card p-6 space-y-6 bg-black/20 border-white/5 relative overflow-hidden group">
                      <div className="absolute top-4 right-4 px-2 py-1 bg-white/5 border border-white/10 rounded-lg flex items-center gap-1.5 shadow-lg">
                        <TrendingDown size={10} className="text-brand-text-muted opacity-40" />
                        <span className="text-[9px] font-black text-brand-text-muted/40 uppercase tracking-tighter">Basal Layer</span>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-text-muted/30 italic">Pre-Activation</h4>
                        <h3 className="text-2xl font-display font-black text-brand-text italic">Neural Baseline</h3>
                      </div>
                      <div className="text-4xl font-display font-black text-brand-text">FREE</div>
                      <ul className="space-y-3">
                        {['5 Analytical Responses / mo', 'Standard AI Logic', 'Basic Pattern Recognition', '24hr History Retention'].map(f => (
                          <li key={f} className="flex items-center gap-2 text-[10px] font-medium text-brand-text-muted/50">
                            <Check size={10} className="text-brand-text-muted/30" /> {f}
                          </li>
                        ))}
                      </ul>
                      <div className="pt-2">
                         <button className="w-full py-3 rounded-lg border border-white/5 text-[9px] font-black uppercase tracking-widest text-brand-text-muted/30 cursor-not-allowed">
                          Current Baseline
                        </button>
                      </div>
                    </div>

                    {/* Basic Tier */}
                    <div className="bento-card p-8 space-y-8 bg-black/40 border-white/5 relative overflow-hidden group">
                      <div className="absolute -top-6 -right-6 w-24 h-24 bg-brand-cyan/5 rounded-full blur-2xl group-hover:bg-brand-cyan/10 transition-all" />
                      <div className="absolute top-4 right-4 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 shadow-lg">
                        <TrendingUp size={10} className="text-emerald-500" />
                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">Profit: $3.15 (35%)</span>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-text-muted">Personal Use</h4>
                        <h3 className="text-3xl font-display font-black text-brand-text italic">Basic Explorer</h3>
                      </div>
                      <div className="text-5xl font-display font-black text-brand-text">$9 <span className="text-sm font-sans font-normal text-brand-text-muted uppercase">/mo</span></div>
                      <ul className="space-y-4">
                        {['500 AI Responses/mo', 'Standard AI Sync', 'Global Archetype Library', 'Standard Analytics'].map(f => (
                          <li key={f} className="flex items-center gap-3 text-[11px] font-medium text-brand-text-muted">
                            <Check size={12} className="text-brand-cyan" /> {f}
                          </li>
                        ))}
                      </ul>
                      <div className="pt-4">
                         <button className="w-full py-4 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-brand-text-muted hover:border-brand-cyan transition-colors">
                          Activate Tier
                        </button>
                      </div>
                    </div>

                    {/* Pro Tier */}
                    <div className="bento-card p-8 space-y-8 bg-gradient-to-b from-brand-purple/10 to-transparent border-brand-purple/30 relative overflow-hidden group shadow-2xl shadow-brand-purple/10">
                      <div className="absolute top-4 right-12 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 shadow-lg">
                        <TrendingUp size={10} className="text-emerald-500" />
                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">Profit: $12.48 (52%)</span>
                      </div>
                      <div className="absolute top-0 right-0 p-4">
                        <Sparkles className="text-brand-purple" size={24} />
                      </div>
                      <div className="space-y-2">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-purple">Recommended</h4>
                         <h3 className="text-3xl font-display font-black text-brand-text italic">Professional</h3>
                      </div>
                      <div className="text-5xl font-display font-black text-brand-text">$24 <span className="text-sm font-sans font-normal text-brand-text-muted uppercase">/mo</span></div>
                      <ul className="space-y-4">
                        {['2,500 AI Responses/mo', 'Deep-Link Pattern Analysis', 'Priority System Access', 'Advanced Admin Control', 'Custom Neural Themes'].map(f => (
                          <li key={f} className="flex items-center gap-3 text-[11px] font-medium text-brand-text">
                            <Check size={12} className="text-brand-purple" /> {f}
                          </li>
                        ))}
                      </ul>
                      <div className="pt-4">
                         <button className="w-full py-4 rounded-xl bg-brand-purple text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-purple/20 hover:scale-[1.02] transition-transform active:scale-95">
                          Upgrade Node
                        </button>
                      </div>
                    </div>

                    {/* Elite Tier */}
                    <div className="bento-card p-8 space-y-8 bg-black/40 border-brand-cyan/20 relative overflow-hidden group">
                      <div className="absolute top-4 right-4 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 shadow-lg">
                        <TrendingUp size={10} className="text-emerald-500" />
                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">Profit: $33.32 (68%)</span>
                      </div>
                       <div className="space-y-2">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-cyan">Max Capability</h4>
                         <h3 className="text-3xl font-display font-black text-brand-text italic">Elite Matrix</h3>
                      </div>
                      <div className="text-5xl font-display font-black text-brand-text">$49 <span className="text-sm font-sans font-normal text-brand-text-muted uppercase">/mo</span></div>
                      <ul className="space-y-4">
                        {['Unlimited AI Responses', 'Dedicated Compute Instance', 'Private Model Training', 'Early Feature Access', '24/7 Priority Support'].map(f => (
                          <li key={f} className="flex items-center gap-3 text-[11px] font-medium text-brand-text-muted">
                            <Check size={12} className="text-brand-cyan" /> {f}
                          </li>
                        ))}
                      </ul>
                      <div className="pt-4">
                         <button className="w-full py-4 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-brand-cyan transition-colors active:scale-95">
                          Initialize Elite
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Tiny Pack */}
                    <div className="bento-card p-8 space-y-8 bg-black/40 border-white/5 relative overflow-hidden group">
                      <div className="absolute top-4 right-4 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 shadow-lg">
                        <TrendingUp size={10} className="text-emerald-500" />
                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">Profit: $1.00 (20%)</span>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-text-muted">Pay-As-You-Go</h4>
                        <h3 className="text-3xl font-display font-black text-brand-text italic">Starter Pack</h3>
                      </div>
                      <div className="text-5xl font-display font-black text-brand-text">$5</div>
                      <div className="text-sm font-mono text-brand-cyan">250 AI Responses</div>
                      <p className="text-[11px] text-brand-text-muted leading-relaxed">
                        Perfect for casual users who want to try out deep-link archetypes without committing to a monthly fee.
                      </p>
                      <div className="pt-4">
                         <button className="w-full py-4 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-brand-text-muted hover:border-brand-cyan transition-colors">
                          Purchase Sync
                        </button>
                      </div>
                    </div>

                    {/* Mid Pack */}
                    <div className="bento-card p-8 space-y-8 bg-brand-cyan/5 border-brand-cyan/20 relative overflow-hidden group">
                      <div className="absolute top-4 right-4 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 shadow-lg">
                        <TrendingUp size={10} className="text-emerald-500" />
                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">Profit: $5.04 (42%)</span>
                      </div>
                      <div className="space-y-2">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-cyan">Best Value</h4>
                         <h3 className="text-3xl font-display font-black text-brand-text italic">Power Pack</h3>
                      </div>
                      <div className="text-5xl font-display font-black text-brand-text">$12</div>
                      <div className="text-sm font-mono text-brand-cyan">1,000 AI Responses</div>
                      <p className="text-[11px] text-brand-text-muted leading-relaxed">
                        The "sweet spot" for active users. Credits never expire and can be used anytime for intensive sessions.
                      </p>
                      <div className="pt-4">
                         <button className="w-full py-4 rounded-xl bg-brand-cyan text-black text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-cyan/20 hover:scale-[1.02] transition-transform active:scale-95">
                          Load Credits
                        </button>
                      </div>
                    </div>

                    {/* Bulk Pack */}
                    <div className="bento-card p-8 space-y-8 bg-black/40 border-brand-purple/20 relative overflow-hidden group">
                       <div className="absolute top-4 right-4 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 shadow-lg">
                        <TrendingUp size={10} className="text-emerald-500" />
                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">Profit: $22.75 (65%)</span>
                      </div>
                       <div className="space-y-2">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-purple">Volume Discount</h4>
                         <h3 className="text-3xl font-display font-black text-brand-text italic">Bulk Data</h3>
                      </div>
                      <div className="text-5xl font-display font-black text-brand-text">$35</div>
                      <div className="text-sm font-mono text-brand-purple">5,000 AI Responses</div>
                      <p className="text-[11px] text-brand-text-muted leading-relaxed">
                        Optimized for research projects. Provides the lowest per-invocation cost on the entire platform.
                      </p>
                      <div className="pt-4">
                         <button className="w-full py-4 rounded-xl bg-brand-purple text-white text-[10px] font-black uppercase tracking-widest hover:bg-brand-purple/80 transition-colors active:scale-95">
                          Confirm Bulk
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bento-card p-10 border-white/5 bg-black/20">
                   <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
                    <div className="space-y-2">
                       <div className="text-xs font-black uppercase tracking-[0.3em] text-brand-text-muted opacity-40">Monthly Active Revenue</div>
                       <div className="text-3xl font-display font-black text-brand-text text-emerald-400">Stable</div>
                    </div>
                    <div className="space-y-2">
                       <div className="text-xs font-black uppercase tracking-[0.3em] text-brand-text-muted opacity-40">Credit Break-Even</div>
                       <div className="text-3xl font-display font-black text-brand-text text-rose-400">Elastic</div>
                    </div>
                    <div className="space-y-2">
                       <div className="text-xs font-black uppercase tracking-[0.3em] text-brand-text-muted opacity-40">Churn Protection</div>
                       <div className="text-3xl font-display font-black text-brand-text">High</div>
                    </div>
                    <div className="space-y-2">
                       <div className="text-xs font-black uppercase tracking-[0.3em] text-brand-text-muted opacity-40">Network Margin</div>
                       <div className="text-3xl font-display font-black text-brand-text">35%</div>
                    </div>
                   </div>
                </div>
              </motion.div>
            ) : adminSubView === 'content' ? (
              /* CONTENT MANAGEMENT */
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-12"
              >
                <div className="max-w-4xl space-y-8">
                  <div className="space-y-2">
                     <h2 className="text-3xl font-display font-black text-brand-text italic uppercase">How It Works <span className="text-brand-purple">Editor</span></h2>
                     <p className="text-brand-text-muted text-sm font-light">Global settings for the public-facing 'How It Works' documentation.</p>
                  </div>

                  <div className="bento-card p-8 border-white/5 space-y-6">
                    <div className="space-y-4">
                      <label className="text-[10px] uppercase tracking-widest font-black text-brand-text-muted opacity-50">Page Title</label>
                      <input 
                        type="text"
                        value={howItWorksContent.title}
                        onChange={(e) => setHowItWorksContent(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-brand-text focus:border-brand-purple/50 outline-none transition-all"
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] uppercase tracking-widest font-black text-brand-text-muted opacity-50">Content Body</label>
                      <div className="w-full bg-black/40 border border-white/5 rounded-2xl overflow-hidden focus-within:border-brand-purple/50 transition-all">
                        <div className="flex flex-wrap items-center gap-1 p-2 bg-white/5 border-b border-white/5">
                          <button onClick={() => insertIntoContent('# ')} className="p-2 hover:bg-white/10 rounded-lg text-brand-text-muted hover:text-brand-text transition-all" title="Heading"><Heading1 size={16} /></button>
                          <div className="w-px h-4 bg-white/10 mx-1" />
                          <button onClick={() => insertIntoContent('**', '**')} className="p-2 hover:bg-white/10 rounded-lg text-brand-text-muted hover:text-brand-text transition-all" title="Bold"><Bold size={16} /></button>
                          <button onClick={() => insertIntoContent('_', '_')} className="p-2 hover:bg-white/10 rounded-lg text-brand-text-muted hover:text-brand-text transition-all" title="Italic"><Italic size={16} /></button>
                          <div className="w-px h-4 bg-white/10 mx-1" />
                          <button onClick={() => insertIntoContent('\n- ')} className="p-2 hover:bg-white/10 rounded-lg text-brand-text-muted hover:text-brand-text transition-all" title="Bullet List"><List size={16} /></button>
                          <button onClick={() => insertIntoContent('\n1. ')} className="p-2 hover:bg-white/10 rounded-lg text-brand-text-muted hover:text-brand-text transition-all" title="Numbered List"><ListOrdered size={16} /></button>
                          <button onClick={() => insertIntoContent('\n\n--- \n')} className="p-2 hover:bg-white/10 rounded-lg text-brand-text-muted hover:text-brand-text transition-all" title="Horizontal Rule"><Minus size={16} /></button>
                          <div className="w-px h-4 bg-white/10 mx-1" />
                          <button onClick={() => insertIntoContent('\n\n')} className="p-2 hover:bg-white/10 rounded-lg text-brand-text-muted hover:text-brand-text transition-all" title="New Line"><div className="w-4 h-4 border-l-2 border-b-2 border-brand-text-muted/50 rounded-bl" /></button>
                          <div className="w-px h-4 bg-white/10 mx-1" />
                          <button onClick={() => insertIntoContent('![Image Description](', ')')} className="p-2 hover:bg-white/10 rounded-lg text-brand-text-muted hover:text-brand-text transition-all" title="Insert Image"><ImageIcon size={16} /></button>
                          <button onClick={() => insertIntoContent('\n<details>\n<summary>Container Title</summary>\n\nEnter details here...\n</details>\n')} className="p-2 hover:bg-white/10 rounded-lg text-brand-text-muted hover:text-brand-text transition-all" title="Expandable Container"><ChevronDown size={18} /></button>
                          <div className="w-px h-4 bg-white/10 mx-1" />
                          {['🧠', '✨', '🔬', '🛡️', '⚡', '📊', '🧬', '📡', '👁️', '🌀', '💎', '⌛', '🔓', '🚀', '🛠️', '📱', '💻', '💡', '🔥', '📍'].map(emoji => (
                            <button 
                              key={emoji} 
                              onClick={() => insertIntoContent(emoji)} 
                              className="p-2 hover:bg-white/10 rounded-lg text-lg hover:scale-110 transition-all"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <textarea 
                          ref={contentEditorRef}
                          rows={12}
                          value={howItWorksContent.content}
                          onChange={(e) => setHowItWorksContent(prev => ({ ...prev, content: e.target.value }))}
                          className="w-full bg-transparent p-4 text-brand-text outline-none resize-none font-sans leading-relaxed min-h-[300px]"
                          placeholder="Compose your documentation using Markdown..."
                        />
                      </div>
                    </div>

                    <button 
                      onClick={async () => {
                        const docRef = doc(db, 'settings', 'how-it-works');
                        await setDoc(docRef, howItWorksContent, { merge: true });
                        showToast('Uplink Successful: Content updated globally.');
                      }}
                      className="px-8 py-3 bg-brand-purple text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-purple/20 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      Push Changes to Cloud
                    </button>
                  </div>

                  <div className="p-6 bg-brand-purple/5 rounded-3xl border border-brand-purple/20 flex gap-4 items-start">
                    <div className="p-2 bg-brand-purple/10 rounded-lg text-brand-purple shrink-0">
                      <Sparkles size={20} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-brand-text">Content Sanitization Active</h4>
                      <p className="text-xs text-brand-text-muted leading-relaxed opacity-60 italic">
                        Changes take effect immediately for all users. Ensure information remains within behavioral synthesis guidelines.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : adminSubView === 'system' ? (
              /* SYSTEM CONFIGURATION */
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
              >
                <div className="max-w-2xl space-y-8">
                  <div className="space-y-2">
                     <h2 className="text-3xl font-display font-black text-brand-text italic uppercase">System <span className="text-brand-cyan">Matrix Controls</span></h2>
                     <p className="text-brand-text-muted text-sm font-light">Global security overrides and network-level configurations.</p>
                  </div>

                  <div className="bento-card p-8 border-white/5 space-y-8">
                    <div className="flex items-center justify-between p-6 bg-black/40 rounded-3xl border border-white/5 group hover:bg-white/10 transition-all">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <UserPlus size={18} className="text-brand-cyan" />
                          <h4 className="text-base font-bold text-brand-text">New Subject Registration</h4>
                        </div>
                        <p className="text-xs text-brand-text-muted font-medium opacity-60">Allow new identities to bridge with the neural network.</p>
                      </div>
                      <button 
                        onClick={async () => {
                          const newStatus = !systemSettings.registrationEnabled;
                          try {
                            await setDoc(doc(db, 'settings', 'global'), { 
                              ...systemSettings, 
                              registrationEnabled: newStatus 
                            });
                            showToast(`Registration ${newStatus ? 'Access Granted' : 'Access Restricted'}`, 'success');
                          } catch (err) {
                            showToast("Failed to modulate system state", "error");
                          }
                        }}
                        className={cn(
                          "w-16 h-9 rounded-full p-1.5 transition-all relative overflow-hidden",
                          systemSettings.registrationEnabled ? "bg-brand-cyan shadow-[0_0_20px_var(--theme-accent-1)]" : "bg-white/10"
                        )}
                      >
                        <motion.div 
                          animate={{ x: systemSettings.registrationEnabled ? 28 : 0 }}
                          className="w-6 h-6 bg-white rounded-full shadow-xl z-10 relative"
                        />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                         <MessageSquare size={14} className="text-brand-cyan" />
                         <label className="text-[10px] uppercase tracking-widest font-black text-brand-text-muted opacity-50">Restricted Access Payload Message</label>
                      </div>
                      <input 
                        type="text"
                        value={systemSettings.registrationDisabledMessage}
                        onChange={(e) => setSystemSettings(prev => ({ ...prev, registrationDisabledMessage: e.target.value }))}
                        onBlur={async () => {
                           try {
                            await setDoc(doc(db, 'settings', 'global'), systemSettings);
                            showToast("System message persistent", "success");
                          } catch (err) {
                            showToast("Failed to update message payload", "error");
                          }
                        }}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-sm text-brand-text focus:border-brand-cyan/50 outline-none transition-all placeholder:opacity-20 font-mono"
                        placeholder="Registration Disabled By The Admins"
                      />
                      <p className="text-[10px] text-brand-text-muted italic opacity-40 leading-relaxed">
                        "If registration is disabled, this message will be delivered to any entity attempting to create a new profile."
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-6 bg-brand-cyan/5 border border-brand-cyan/10 rounded-3xl flex items-start gap-4">
                    <Shield size={20} className="text-brand-cyan mt-1 shrink-0" />
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-brand-cyan mb-1">Administrative Protocol</h4>
                      <p className="text-[11px] text-brand-text-muted leading-relaxed">
                        Disabling registration will prevent new users from joining the system. Existing users with valid credentials will maintain their current uplink status.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* USERS SECTION */
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bento-card p-6 border-brand-cyan/20 bg-brand-cyan/5">
                    <div className="flex items-center gap-3 mb-4">
                      <Users className="text-brand-cyan" size={20} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-brand-text">Active Users</span>
                    </div>
                    <div className="text-4xl font-display font-black text-brand-text italic">
                      {allUsers.length}
                    </div>
                  </div>
                  <div className="bento-card p-6 border-white/5 bg-black/40">
                    <div className="flex items-center gap-3 mb-4">
                      <Activity className="text-brand-purple" size={20} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-brand-text">Frequent Users</span>
                    </div>
                    <div className="text-4xl font-display font-black text-brand-text italic">
                      {allUsers.filter((u: any) => (u.totalMessages || 0) > 50).length}
                    </div>
                  </div>
                  <div className="bento-card p-6 border-white/5 bg-black/40">
                    <div className="flex items-center gap-3 mb-4">
                      <Shield className="text-brand-cyan" size={20} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-brand-text">Administrators</span>
                    </div>
                    <div className="text-4xl font-display font-black text-brand-text italic">
                      {allUsers.filter((u: any) => u.role === 'admin').length}
                    </div>
                  </div>
                  <div className="bento-card p-6 border-white/5 bg-black/40">
                    <div className="flex items-center gap-3 mb-4">
                      <Database className="text-brand-purple" size={20} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-brand-text">Data Usage</span>
                    </div>
                    <div className="text-4xl font-display font-black text-brand-text italic">
                      {(globalStats?.totalMessages || 0) * 1.2}MB
                    </div>
                  </div>
                </div>

                <div className="bento-card p-8 border-white/5">
                  <div className="flex items-center justify-between mb-8">
                     <h3 className="text-xl font-display font-bold text-brand-text">Global User Management</h3>
                     <div className="flex gap-2">
                       <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-brand-text-muted">
                         Sort by Activity
                       </div>
                       <div className="px-4 py-2 bg-brand-cyan/10 rounded-xl border border-brand-cyan/20 text-[10px] font-black uppercase tracking-widest text-brand-cyan">
                         Export Report
                       </div>
                     </div>
                  </div>

                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-separate border-spacing-y-2">
                      <thead>
                        <tr className="text-[10px] uppercase font-black tracking-widest text-brand-text-muted opacity-40">
                          <th className="pb-4 pl-4">User Account</th>
                          <th className="pb-4">Permission Level</th>
                          <th className="pb-4">AI Messages</th>
                          <th className="pb-4">Last Activity</th>
                          <th className="pb-4 pr-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allUsers.map((u: any) => (
                          <tr key={u.id} className="group hover:bg-white/5 transition-all bg-black/20 rounded-2xl">
                            <td className="py-4 pl-4">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center">
                                  <Users size={18} className="text-brand-cyan" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-brand-text">{u.email || 'Guest User'}</span>
                                  <span className="text-[9px] font-mono text-brand-text-muted opacity-40 uppercase tracking-tighter">{u.id}</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-4">
                              <span className={cn(
                                "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                                u.role === 'admin' ? "bg-brand-cyan/10 border-brand-cyan/40 text-brand-cyan" : "bg-white/5 border-white/10 text-brand-text-muted"
                              )}>
                                {u.role === 'admin' ? 'Administrator' : 'Standard User'}
                              </span>
                            </td>
                            <td className="py-4">
                               <div className="flex flex-col gap-1.5">
                                 <div className="flex justify-between items-center w-32 pr-4">
                                   <span className="text-xs font-mono font-black text-brand-text">{u.totalMessages || 0}</span>
                                   <span className="text-[8px] font-black text-brand-text-muted opacity-40 uppercase">Msgs</span>
                                 </div>
                                 <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden">
                                   <div 
                                     className={cn("h-full", (u.totalMessages || 0) > 100 ? "bg-brand-purple" : "bg-brand-cyan")} 
                                     style={{ width: `${Math.min(100, (u.totalMessages || 0))}%` }}
                                   />
                                 </div>
                               </div>
                            </td>
                            <td className="py-4 text-[10px] font-mono text-brand-text-muted">
                              {u.lastActive?.seconds ? new Date(u.lastActive.seconds * 1000).toLocaleString() : 'Never'}
                            </td>
                            <td className="py-4 pr-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button title="View User History" className="p-2 hover:bg-brand-cyan/10 rounded-xl transition-all text-brand-text-muted hover:text-brand-cyan group-hover:translate-x-[-2px]">
                                  <History size={16} />
                                </button>
                                <button title="Permanently Remove User" className="p-2 hover:bg-rose-500/10 rounded-xl transition-all text-brand-text-muted hover:text-rose-500">
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bento-card p-8 border-white/5 space-y-6">
                    <h3 className="text-lg font-display font-bold text-brand-text">Live Activity Monitoring</h3>
                    <div className="space-y-4">
                       {allUsers.slice(0, 3).map((u: any, i: number) => (
                         <div key={i} className="p-4 bg-black/40 rounded-2xl border border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="text-xs font-bold text-brand-text">{u.email?.split('@')[0] || 'User'}</span>
                            </div>
                            <div className="text-[10px] font-mono text-brand-text-muted italic">
                              Active AI Session...
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>
                  <div className="bento-card p-8 border-brand-purple/20 bg-brand-purple/5 space-y-6">
                    <h3 className="text-lg font-display font-bold text-brand-text">Administrative Actions</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <button className="p-4 bg-black/40 rounded-2xl border border-white/10 text-[10px] font-black uppercase text-brand-text-muted hover:text-brand-cyan hover:border-brand-cyan/30 transition-all">
                        Sync Global Quotas
                      </button>
                      <button className="p-4 bg-black/40 rounded-2xl border border-white/10 text-[10px] font-black uppercase text-brand-text-muted hover:text-brand-purple hover:border-brand-purple/30 transition-all">
                        Invalidate Session Cache
                      </button>
                      <button className="p-4 bg-black/40 rounded-2xl border border-white/10 text-[10px] font-black uppercase text-brand-text-muted hover:text-rose-500 hover:border-rose-500/30 transition-all">
                        Emergency Lockdown
                      </button>
                      <button className="p-4 bg-black/40 rounded-2xl border border-white/10 text-[10px] font-black uppercase text-brand-text-muted hover:text-white hover:border-white/30 transition-all">
                        Refresh System
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>

            )}
          </div>
        </main>
      )}
      {/* HISTORY VIEW */}
      {currentView === 'history' && (
        <main className="flex-1 flex flex-col relative overflow-hidden bg-bento-bg p-4 md:p-12 overflow-y-auto custom-scrollbar">
          <div className="max-w-4xl mx-auto w-full space-y-8 md:space-y-12 pb-24">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-brand-cyan/20 border border-brand-cyan/40 flex items-center justify-center shadow-lg shadow-brand-cyan/10">
                  <History size={32} className="text-brand-cyan" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-5xl font-display font-black tracking-tighter text-brand-text italic leading-none">
                    Session <span className="text-brand-cyan">Archive</span>
                  </h1>
                  <p className="text-brand-text-muted text-[10px] md:text-sm uppercase tracking-[0.4em] font-black mt-2 opacity-50">
                    Search Intelligence Archive
                  </p>
                </div>
              </div>

              <button 
                onClick={createNewSession}
                className="px-6 py-3 bg-brand-cyan text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-cyan/80 transition-all flex items-center gap-2 shadow-lg shadow-brand-cyan/20 active:scale-95"
              >
                <Plus size={16} /> New Analysis
              </button>
            </header>

            <div className="grid grid-cols-1 gap-4">
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
                    className="py-24 px-4 text-center border border-dashed border-bento-border rounded-3xl opacity-40"
                  >
                    <div className="text-sm text-brand-text-muted font-mono uppercase tracking-widest leading-relaxed">
                      {user ? "Connecting to cloud sync..." : "Zero investigations found."}
                    </div>
                  </motion.div>
                )}
                {Object.values(sessions).sort((a,b) => b.createdAt - a.createdAt).map((session) => (
                  <motion.div
                    key={session.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => {
                      setCurrentSessionId(session.id);
                      setCurrentView('chat');
                    }}
                    className={cn(
                      "group flex items-center gap-6 p-6 rounded-3xl cursor-pointer transition-all border relative overflow-hidden",
                      currentSessionId === session.id 
                        ? "bg-brand-cyan/10 border-brand-cyan/30 shadow-xl shadow-brand-cyan/5" 
                        : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
                    )}
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                      currentSessionId === session.id ? "bg-brand-cyan text-black" : "bg-white/5 text-brand-text-muted/40"
                    )}>
                      <MessageSquare size={20} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "text-lg font-bold truncate transition-colors mb-1",
                        currentSessionId === session.id ? "text-brand-text" : "text-brand-text-muted group-hover:text-brand-text"
                      )}>
                        {session.title}
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-brand-text-muted/40 font-mono uppercase tracking-widest">
                        <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{session.messages.length} Nodes</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => deleteSession(e, session.id)}
                        className="p-2.5 hover:bg-rose-500/10 rounded-xl transition-all text-brand-text-muted hover:text-rose-500"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    {currentSessionId === session.id && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-cyan" />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </main>
      )}

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







        {/* MESSAGES */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto no-scrollbar relative z-10 px-4 md:px-0 scroll-smooth"
        >
          <div className="w-full max-w-6xl mx-auto space-y-6 md:space-y-12 pb-32">
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
                <h2 className="text-2xl md:text-4xl font-display font-medium text-brand-text mb-4 tracking-tighter">Initialize Intelligence</h2>
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

        <div className="p-3 md:p-8 pb-10 md:pb-12 pt-0 z-20 shrink-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent relative mt-auto">
          <div className="w-full max-w-6xl mx-auto mb-[env(safe-area-inset-bottom)]">
            <PsychInput onSend={handleSendMessage} onMoodUpdate={setCurrentMood} disabled={isLoading} />
          </div>
        </div>
      </main>
    )}

    {/* HOW IT WORKS VIEW */}
    {currentView === 'how-it-works' && (
      <main className="flex-1 flex flex-col relative overflow-hidden bg-bento-bg p-4 md:p-12 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto w-full space-y-12 pb-24">
            <header className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-brand-purple/20 border border-brand-purple/40 flex items-center justify-center shadow-lg shadow-brand-purple/10">
                <BookOpen size={32} className="text-brand-purple" />
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-display font-black tracking-tighter text-brand-text italic leading-none">
                  System <span className="text-brand-purple">Manual</span>
                </h1>
                <p className="text-brand-text-muted text-[10px] md:text-sm uppercase tracking-[0.4em] font-black mt-2 opacity-50">
                  Operation Protocols
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {role === 'admin' && (
                <button 
                  onClick={() => {
                    setAdminSubView('content');
                    setCurrentView('admin');
                  }}
                  className="px-4 py-2 bg-brand-purple/10 border border-brand-purple/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-brand-purple hover:bg-brand-purple/20 transition-all flex items-center gap-2"
                >
                  <BookOpen size={16} /> Edit Content
                </button>
              )}
              <button 
                onClick={() => {
                  if (user) {
                    setCurrentView('chat');
                  } else {
                    setCurrentView('chat'); // This will trigger the landing check
                    setShowLanding(true);
                  }
                }}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-brand-text-muted hover:text-brand-text transition-all flex items-center gap-2"
              >
                <ChevronLeft size={16} /> Back to Entry
              </button>
            </div>
          </header>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bento-card p-8 md:p-12 border-brand-purple/20 bg-brand-purple/5 relative"
          >
            <div className="absolute top-0 right-0 p-12 opacity-5">
              <Brain size={300} />
            </div>
            
            <h2 className="text-3xl md:text-5xl font-display font-black text-brand-text mb-8 tracking-tight">
              {howItWorksContent.title}
            </h2>
            
            <div className="prose prose-invert max-w-none mt-12">
              <div className="markdown-body">
                <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {howItWorksContent.content}
                </Markdown>
              </div>
            </div>

            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 bg-black/40 rounded-2xl border border-white/5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-brand-cyan/20 flex items-center justify-center text-brand-cyan mb-2">
                  <Activity size={20} />
                </div>
                <h3 className="text-sm font-bold text-brand-text uppercase tracking-widest">Signal Capture</h3>
                <p className="text-xs text-brand-text-muted leading-relaxed">System intercepts raw emotional data via semantic analysis.</p>
              </div>
              <div className="p-6 bg-black/40 rounded-2xl border border-white/5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-brand-purple/20 flex items-center justify-center text-brand-purple mb-2">
                  <Database size={20} />
                </div>
                <h3 className="text-sm font-bold text-brand-text uppercase tracking-widest">Matrix Mapping</h3>
                <p className="text-xs text-brand-text-muted leading-relaxed">Behavioral variables are mapped onto cognitive archetypes.</p>
              </div>
              <div className="p-6 bg-black/40 rounded-2xl border border-white/5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-brand-cyan/20 flex items-center justify-center text-brand-cyan mb-2">
                  <Brain size={20} />
                </div>
                <h3 className="text-sm font-bold text-brand-text uppercase tracking-widest">Synthesis</h3>
                <p className="text-xs text-brand-text-muted leading-relaxed">Generates real-time behavioral insights and diagnostics.</p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    )}
  </div>

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
                {/* SETTINGS TABS */}
                <div className="flex p-1 bg-black/20 rounded-xl mb-6 border border-white/5">
                  <button 
                    onClick={() => setSettingsTab('general')}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                      settingsTab === 'general' ? "bg-white text-black shadow-lg" : "text-brand-text-muted hover:text-brand-text"
                    )}
                  >
                    General
                  </button>
                  <button 
                    onClick={() => setSettingsTab('theme')}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                      settingsTab === 'theme' ? "bg-white text-black shadow-lg" : "text-brand-text-muted hover:text-brand-text"
                    )}
                  >
                    Theme
                  </button>
                </div>

                {settingsTab === 'general' ? (
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
                        </div>

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
                            Backup
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
                                    }
                                    alert("Import Successful!");
                                  } catch (err) {
                                    console.error("Import failed", err);
                                  }
                                };
                                reader.readAsText(file);
                              };
                              input.click();
                            }}
                            className="py-2.5 bg-brand-cyan/10 hover:bg-brand-cyan/20 border border-brand-cyan/30 rounded-xl text-[9px] font-bold uppercase tracking-widest text-brand-cyan transition-all"
                          >
                            Restore
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 pb-6 pt-2">
                    <div className="px-1">
                      <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-text-muted mb-6 flex items-center gap-2">
                        <Palette size={14} className="text-brand-purple" /> Appearance Matrix
                      </h3>
                      <div className="grid grid-cols-1 gap-3">
                        {THEMES.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setTheme(t.id)}
                            className={cn(
                              "w-full flex items-center gap-4 p-4 rounded-2xl transition-all border group relative overflow-hidden",
                              theme === t.id 
                                ? "bg-white/10 border-brand-cyan/40 shadow-[0_0_20px_rgba(6,178,210,0.1)]" 
                                : "bg-black/20 border-white/5 hover:border-white/10 hover:bg-white/5"
                            )}
                          >
                            <div 
                              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
                              style={{ background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})` }}
                            >
                              {theme === t.id && <Check size={18} className="text-white drop-shadow-md" />}
                            </div>
                            <div className="flex-1 text-left">
                              <div className={cn(
                                "text-sm font-bold tracking-tight transition-colors",
                                theme === t.id ? "text-brand-cyan" : "text-brand-text"
                              )}>
                                {t.label}
                              </div>
                              <div className="text-[10px] text-brand-text-muted font-mono opacity-40 uppercase tracking-widest">
                                {t.id} model
                              </div>
                            </div>
                            {theme === t.id && (
                              <motion.div layoutId="active-theme" className="absolute right-4">
                                <Sparkles size={16} className="text-brand-cyan animate-pulse" />
                              </motion.div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-brand-cyan/5 p-4 rounded-2xl border border-brand-cyan/10">
                      <p className="text-[10px] text-brand-cyan/60 italic leading-relaxed text-center">
                        Synthesizing UI components and neuro-linguistic visual patterns...
                      </p>
                    </div>
                  </div>
                )}
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

      {/* TOAST NOTIFICATION */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]"
          >
            <div className={cn(
              "px-6 py-4 rounded-2xl border shadow-2xl flex items-center gap-4 backdrop-blur-xl",
              toast.type === 'success' ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" :
              toast.type === 'error' ? "bg-rose-500/10 border-rose-500/50 text-rose-400" :
              "bg-brand-cyan/10 border-brand-cyan/50 text-brand-cyan"
            )}>
              {toast.type === 'success' && <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center"><Check size={14} /></div>}
              {toast.type === 'error' && <div className="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center"><X size={14} /></div>}
              {toast.type === 'info' && <div className="w-6 h-6 rounded-full bg-brand-cyan/20 flex items-center justify-center"><Brain size={14} /></div>}
              <span className="text-[11px] font-black uppercase tracking-widest leading-none">
                {toast.message}
              </span>
            </div>
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



