import { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  MessageSquare, 
  FolderPlus, 
  Trash2, 
  MoreVertical, 
  Send, 
  User, 
  Bot,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Edit2,
  Folder
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { v4 as uuidv4 } from 'uuid';
import { cn } from './lib/utils';
import { Subject, Thread, Message } from './types';
import { streamChatResponse } from './services/geminiService';

const STORAGE_KEY = 'subject_chat_v1';

export default function App() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentSubjectId, setCurrentSubjectId] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { subjects, threads } = JSON.parse(saved);
        setSubjects(subjects);
        setThreads(threads);
        if (subjects.length > 0) {
          setCurrentSubjectId(subjects[0].id);
        }
      } catch (e) {
        console.error("Failed to parse storage", e);
      }
    } else {
      // Initialize with default subject
      const defaultSubject: Subject = {
        id: uuidv4(),
        name: 'General',
        createdAt: Date.now()
      };
      setSubjects([defaultSubject]);
      setCurrentSubjectId(defaultSubject.id);
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (subjects.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ subjects, threads }));
    }
  }, [subjects, threads]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threads, isTyping]);

  const currentThread = threads.find(t => t.id === currentThreadId);
  const currentSubject = subjects.find(s => s.id === currentSubjectId);

  const handleCreateSubject = () => {
    const name = prompt('Enter subject name:');
    if (name) {
      const newSubject: Subject = {
        id: uuidv4(),
        name,
        createdAt: Date.now()
      };
      setSubjects([...subjects, newSubject]);
      setCurrentSubjectId(newSubject.id);
      setCurrentThreadId(null);
    }
  };

  const handleDeleteSubject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this subject and all its threads?')) {
      const newSubjects = subjects.filter(s => s.id !== id);
      const newThreads = threads.filter(t => t.subjectId !== id);
      setSubjects(newSubjects);
      setThreads(newThreads);
      if (currentSubjectId === id) {
        setCurrentSubjectId(newSubjects[0]?.id || null);
        setCurrentThreadId(null);
      }
    }
  };

  const handleRenameSubject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const subject = subjects.find(s => s.id === id);
    const newName = prompt('Rename subject:', subject?.name);
    if (newName && newName !== subject?.name) {
      setSubjects(subjects.map(s => s.id === id ? { ...s, name: newName } : s));
    }
  };

  const handleCreateThread = () => {
    if (!currentSubjectId) return;
    const newThread: Thread = {
      id: uuidv4(),
      subjectId: currentSubjectId,
      title: 'New Conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setThreads([newThread, ...threads]);
    setCurrentThreadId(newThread.id);
  };

  const handleDeleteThread = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newThreads = threads.filter(t => t.id !== id);
    setThreads(newThreads);
    if (currentThreadId === id) {
      setCurrentThreadId(null);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isTyping) return;

    let targetThreadId = currentThreadId;
    
    // Create new thread if none selected
    if (!targetThreadId && currentSubjectId) {
      const newThread: Thread = {
        id: uuidv4(),
        subjectId: currentSubjectId,
        title: inputText.slice(0, 30) + (inputText.length > 30 ? '...' : ''),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setThreads([newThread, ...threads]);
      setCurrentThreadId(newThread.id);
      targetThreadId = newThread.id;
    }

    if (!targetThreadId) return;

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: inputText,
      timestamp: Date.now()
    };

    const updatedThreads = threads.map(t => {
      if (t.id === targetThreadId) {
        // Update title if it was a "New Conversation"
        const newTitle = t.title === 'New Conversation' 
          ? inputText.slice(0, 30) + (inputText.length > 30 ? '...' : '')
          : t.title;
          
        return {
          ...t,
          title: newTitle,
          messages: [...t.messages, userMessage],
          updatedAt: Date.now()
        };
      }
      return t;
    });

    setThreads(updatedThreads);
    setInputText('');
    setIsTyping(true);

    try {
      const targetThread = updatedThreads.find(t => t.id === targetThreadId)!;
      const aiMessage: Message = {
        id: uuidv4(),
        role: 'model',
        content: '',
        timestamp: Date.now()
      };

      // Add empty message placeholder
      setThreads(prev => prev.map(t => 
        t.id === targetThreadId 
          ? { ...t, messages: [...t.messages, aiMessage] } 
          : t
      ));

      let fullContent = '';
      const stream = streamChatResponse(targetThread.messages, `You are a helpful assistant within the "${currentSubject?.name}" subject. Provide concise and accurate information relevant to this topic.`);

      for await (const chunk of stream) {
        fullContent += chunk;
        setThreads(prev => prev.map(t => 
          t.id === targetThreadId 
            ? {
                ...t,
                messages: t.messages.map(m => 
                  m.id === aiMessage.id ? { ...m, content: fullContent } : m
                )
              }
            : t
        ));
      }
    } catch (error) {
      console.error(error);
      setThreads(prev => prev.map(t => 
        t.id === targetThreadId 
          ? {
              ...t,
              messages: [
                ...t.messages,
                { id: uuidv4(), role: 'model', content: "Error: I'm having trouble connecting to the AI. Please try again.", timestamp: Date.now() }
              ]
            }
          : t
      ));
    } finally {
      setIsTyping(false);
    }
  };

  const filteredThreads = threads.filter(t => 
    t.subjectId === currentSubjectId && 
    (t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
     t.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  return (
    <div className="flex h-screen w-full overflow-hidden font-sans">
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {!sidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ 
          width: sidebarOpen ? 300 : 0,
          x: sidebarOpen ? 0 : -300
        }}
        className={cn(
          "relative z-50 flex flex-col bg-brand-bg-darker border-r border-white/10 transition-all duration-300 ease-in-out",
          !sidebarOpen && "lg:w-0"
        )}
      >
        <div className="p-4 flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-indigo-500" />
              SubjectChat
            </h1>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="p-2 hover:bg-white/5 rounded-lg lg:hidden"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* New Subject Button */}
          <button 
            onClick={handleCreateSubject}
            className="flex items-center gap-2 w-full px-4 py-3 border border-white/20 hover:bg-white/5 rounded-lg transition-colors text-left mb-6 group"
          >
            <FolderPlus className="w-5 h-5 text-indigo-400 transition-transform group-hover:scale-110" />
            <span className="font-medium text-sm">New Subject</span>
          </button>

          {/* Subjects Scroll Area */}
          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            <div>
              <div className="flex items-center justify-between mb-3 px-2">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Subjects & Projects</span>
              </div>
              <div className="space-y-1">
                {subjects.map(subject => (
                  <div 
                    key={subject.id}
                    onClick={() => {
                      setCurrentSubjectId(subject.id);
                      setCurrentThreadId(null);
                    }}
                    className={cn(
                      "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors",
                      currentSubjectId === subject.id 
                        ? "bg-white/10 text-white" 
                        : "text-gray-400 hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <Folder className={cn("w-4 h-4 flex-shrink-0", currentSubjectId === subject.id ? "text-indigo-400" : "text-gray-500 group-hover:text-gray-300")} />
                      <span className="text-sm truncate font-medium">{subject.name}</span>
                    </div>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => handleRenameSubject(subject.id, e)} className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => handleDeleteSubject(subject.id, e)} className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {currentSubject && (
              <div>
                <div className="flex items-center justify-between mb-3 px-2">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Recent Chats</span>
                  <button 
                    onClick={handleCreateThread}
                    className="p-1 hover:bg-white/10 rounded text-indigo-400"
                    title="New Thread"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Search */}
                <div className="px-2 mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                    <input 
                      type="text"
                      placeholder="Search history..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white/5 border border-white/5 rounded-md pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-white/10 transition-all text-gray-300"
                    />
                  </div>
                </div>

                <div className="space-y-0.5">
                  {filteredThreads.map(thread => (
                    <div 
                      key={thread.id}
                      onClick={() => setCurrentThreadId(thread.id)}
                      className={cn(
                        "group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors",
                        currentThreadId === thread.id 
                          ? "bg-white/10 text-white shadow-sm" 
                          : "text-gray-400 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <MessageSquare className={cn("w-4 h-4 flex-shrink-0", currentThreadId === thread.id ? "text-indigo-400" : "text-gray-600")} />
                        <span className="text-xs truncate">{thread.title}</span>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteThread(thread.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded text-gray-500 hover:text-red-400 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {filteredThreads.length === 0 && (
                    <div className="py-4 px-2 text-center">
                      <p className="text-[10px] text-gray-600 font-medium italic">No threads found.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* User Bar */}
          <div className="mt-auto pt-4 border-t border-white/10">
            <div className="flex items-center gap-3 hover:bg-white/5 p-2 rounded-lg cursor-pointer transition-colors group">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xs uppercase shadow-lg shadow-indigo-600/10">ME</div>
              <div className="flex-1 overflow-hidden">
                <div className="text-xs font-semibold text-white truncate">User</div>
                <div className="text-[10px] text-gray-500 font-medium">Free Plan</div>
              </div>
              <MoreVertical className="w-4 h-4 text-gray-600 group-hover:text-gray-400" />
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-brand-bg-main relative min-w-0">
        {/* Header */}
        <header className="h-[60px] border-b border-white/5 flex items-center justify-between px-6 bg-brand-bg-main/80 backdrop-blur-md z-30">
          <div className="flex items-center gap-4 min-w-0">
            {!sidebarOpen && (
              <button 
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-white/10 rounded-lg border border-white/5"
              >
                <Menu className="w-5 h-5 text-gray-400" />
              </button>
            )}
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-xs font-medium text-gray-500 truncate uppercase tracking-tight">{currentSubject?.name || 'No Subject' } /</span>
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-sm font-medium text-white truncate">{currentThread?.title || 'New Chat' }</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
             <button className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-xs rounded-md font-medium transition-colors text-white">Share</button>
             <button className="p-2 text-gray-400 hover:text-white transition-colors">
               <MoreVertical className="w-5 h-5" />
             </button>
          </div>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto pt-6">
          {currentThread && currentThread.messages.length > 0 ? (
            <div className="max-w-3xl mx-auto py-10 px-4 sm:px-6 space-y-12">
              {currentThread.messages.map((message) => (
                <div 
                  key={message.id} 
                  className={cn(
                    "flex gap-6 message-fade-in",
                    message.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-[10px] uppercase shadow-sm transition-transform active:scale-95",
                    message.role === 'user' ? "bg-indigo-600 text-white" : "bg-emerald-600 text-white"
                  )}>
                    {message.role === 'user' ? 'ME' : <Bot className="w-4 h-4" />}
                  </div>
                  
                  <div className="flex-1 pt-0.5 space-y-2 overflow-hidden">
                    <div className={cn(
                      "font-bold text-[10px] uppercase tracking-wider",
                      message.role === 'user' ? "text-gray-500 text-right" : "text-emerald-500"
                    )}>
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    <div className={cn(
                      "text-gray-100 leading-relaxed font-sans text-[15px]",
                      message.role === 'user' && "text-right"
                    )}>
                      <div className="prose prose-invert prose-sm sm:prose-base max-w-none prose-pre:bg-brand-bg-darker prose-pre:border prose-pre:border-white/5 prose-pre:rounded-xl">
                        <Markdown>{message.content}</Markdown>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-6 message-fade-in">
                  <div className="w-8 h-8 rounded-sm bg-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5 animate-pulse">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 pt-0.5 space-y-2">
                    <div className="font-bold text-[10px] text-emerald-500 uppercase tracking-wider">Assistant</div>
                    <div className="flex items-center gap-1.5 py-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 bg-emerald-500/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 bg-emerald-500/50 rounded-full animate-bounce" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md"
              >
                <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Bot className="w-8 h-8 text-indigo-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">SubjectChat AI</h2>
                <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                  {currentSubject 
                    ? `Organize your thoughts about "${currentSubject.name}". I'm here to help you study, plan, or research.` 
                    : 'Get started by creating a subject on the left toolbar.'}
                </p>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={handleCreateThread}
                    className="flex items-center gap-3 w-full p-4 bg-brand-bg-input border border-white/5 hover:border-white/10 rounded-xl transition-all group"
                  >
                    <Plus className="w-5 h-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">New Conversation</p>
                      <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wide">Start fresh in this subject</p>
                    </div>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 bg-gradient-to-t from-brand-bg-main via-brand-bg-main to-transparent">
          <div className="max-w-3xl mx-auto relative group">
            <form 
              onSubmit={handleSendMessage}
              className="relative flex items-end gap-2 bg-brand-bg-input border border-white/10 focus-within:border-white/20 rounded-xl p-2 transition-all shadow-2xl"
            >
              <textarea 
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={currentSubject ? `Ask about ${currentSubject.name}...` : "Create a subject first..."}
                rows={1}
                disabled={!currentSubject}
                className="flex-1 max-h-48 min-h-[44px] bg-transparent text-gray-100 px-3 py-3 resize-none focus:outline-none text-[15px] leading-relaxed"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />
              <button 
                type="submit"
                disabled={!inputText.trim() || isTyping || !currentSubject}
                className={cn(
                  "p-2.5 rounded-md transition-all flex-shrink-0 group relative overflow-hidden",
                  inputText.trim() && !isTyping && currentSubject
                    ? "bg-emerald-600 text-white hover:bg-emerald-500 shadow-md" 
                    : "bg-gray-800 text-gray-600 cursor-not-allowed"
                )}
              >
                <div className="relative z-10 transition-transform active:scale-90">
                  {isTyping ? (
                    <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </div>
              </button>
            </form>
            <p className="text-center text-[10px] text-gray-500 mt-4 tracking-wide font-medium uppercase opacity-60">
              AI-powered subject assistant • Context maintained within this thread
            </p>
          </div>
        </div>
      </main>

      <style>{`
        .message-fade-in {
          animation: message-in 0.3s ease-out forwards;
        }
        @keyframes message-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        textarea::-webkit-scrollbar {
          display: none;
        }
        textarea {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        /* Prose customization */
        .prose pre {
          background-color: #09090b !important;
          border: 1px solid #27272a !important;
        }
        .prose code {
          color: #e2e2e7 !important;
          background-color: #18181b !important;
          padding: 0.2rem 0.4rem !important;
          border-radius: 0.25rem !important;
          font-weight: 400 !important;
        }
        .prose pre code {
          background-color: transparent !important;
          padding: 0 !important;
        }
      `}</style>
    </div>
  );
}
