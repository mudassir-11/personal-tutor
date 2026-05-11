export type MessageRole = 'user' | 'model';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

export interface Thread {
  id: string;
  subjectId: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Subject {
  id: string;
  name: string;
  createdAt: number;
}

export interface ChatState {
  subjects: Subject[];
  threads: Thread[];
  currentSubjectId: string | null;
  currentThreadId: string | null;
}
