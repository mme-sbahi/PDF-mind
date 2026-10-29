import { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  Send, 
  Trash2, 
  Loader2, 
  Bot, 
  User, 
  Sparkles, 
  FileUp, 
  CheckCircle2, 
  AlertCircle, 
  Database
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  sources?: { page: number; text: string; filename: string }[];
}

// Renders the small markdown subset the model is asked to use: **bold** and "- " bullet lines.
function renderInline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
      : part
  );
}

function FormattedText({ text }: { text: string }) {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((line, i) => {
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        return bullet ? (
          <div key={i} className="flex gap-2">
            <span className="text-accentviolet">•</span>
            <span>{renderInline(bullet[1])}</span>
          </div>
        ) : (
          <p key={i}>{renderInline(line)}</p>
        );
      })}
    </div>
  );
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hello! I am your AI PDF Assistant. Upload one or more PDF files on the left, and I will be ready to answer your questions based on their contents.",
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, querying]);

  // Fetch list of documents from vector store
  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/documents');
      if (response.ok) {
        const data = await response.json();
        setUploadedFiles(data.documents || []);
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
    }
  };

  // Load uploaded files from vector store on init
  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'application/pdf') {
        setError('Only PDF documents are supported.');
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setError(null);
      setSuccess(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMsg = 'Upload failed';
        try {
          const errData = await response.json();
          errorMsg = errData.detail || errorMsg;
        } catch {
          try {
            const rawText = await response.text();
            errorMsg = rawText || errorMsg;
          } catch {}
        }
        throw new Error(errorMsg);
      }

      try {
        await response.json();
      } catch {}
      await fetchDocuments();
      setSuccess(`Successfully uploaded and indexed "${file.name}"`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      setMessages(prev => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'assistant',
          text: `I have successfully parsed and indexed "${file.name}". Ask me anything about its contents!`,
          timestamp: new Date()
        }
      ]);
    } catch (err: any) {
      setError(err.message || 'An error occurred during file upload.');
    } finally {
      setUploading(false);
    }
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || querying) return;

    const userQuestion = input.trim();
    setInput('');
    setError(null);

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', text: userQuestion, timestamp: new Date() }
    ]);
    setQuerying(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userQuestion }),
      });

      if (!response.ok) {
        let errorMsg = 'Failed to fetch answer';
        try {
          const errData = await response.json();
          errorMsg = errData.detail || errorMsg;
        } catch {
          try {
            const rawText = await response.text();
            errorMsg = rawText || errorMsg;
          } catch {}
        }
        throw new Error(errorMsg);
      }

      let data: any;
      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new Error("Invalid response format received from backend.");
      }
      setMessages(prev => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          text: data.answer,
          sources: data.sources,
          timestamp: new Date()
        }
      ]);
    } catch (err: any) {
      setError(err.message || 'An error occurred while seeking answer.');
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `Sorry, I encountered an error: ${err.message || 'Could not reach server'}`,
          timestamp: new Date()
        }
      ]);
    } finally {
      setQuerying(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!confirm('Are you sure you want to clear the vector database and all indexed PDFs?')) return;

    try {
      const response = await fetch('/api/clear', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to clear database');
      
      await fetchDocuments();
      setSuccess('Vector database cleared successfully.');
      setMessages([
        {
          id: 'welcome-reset',
          role: 'assistant',
          text: "Database reset complete. Please upload a new PDF to get started.",
          timestamp: new Date()
        }
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to reset database.');
    }
  };

  const handleDeleteDocument = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${filename}" from the database?`)) return;

    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        let errorMsg = 'Failed to delete document';
        try {
          const errData = await response.json();
          errorMsg = errData.detail || errorMsg;
        } catch {
          try {
            const rawText = await response.text();
            errorMsg = rawText || errorMsg;
          } catch {}
        }
        throw new Error(errorMsg);
      }

      await fetchDocuments();
      setSuccess(`Successfully deleted "${filename}"`);
      
      setMessages(prev => [
        ...prev,
        {
          id: `sys-del-${Date.now()}`,
          role: 'assistant',
          text: `Document "${filename}" was removed from ChromaDB.`,
          timestamp: new Date()
        }
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to delete document.');
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-darkbg text-gray-100 font-sans">
      {/* Sidebar Panel */}
      <aside className="w-[340px] bg-sidebarbg border-r border-white/5 flex flex-col h-full shrink-0">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sparkles className="text-accentviolet drop-shadow-[0_0_8px_rgba(124,58,237,0.6)]" size={24} />
            <h1 className="font-display text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              PDFMind
            </h1>
          </div>
          <span className="bg-accentviolet/15 border border-accentviolet/30 text-purple-400 text-[11px] font-semibold px-2 py-0.5 rounded-full tracking-wider">
            RAG LOCAL
          </span>
        </div>

        {/* Upload Container */}
        <div className="p-6 border-b border-white/5">
          <h3 className="font-display text-[13px] font-semibold uppercase tracking-wider text-gray-200 mb-1">
            Upload Source PDFs
          </h3>
          <p className="text-[12px] text-gray-500 leading-relaxed mb-4">
            PDFs are parsed, embedded, and stored in ChromaDB vector space.
          </p>
          
          <div className="border-2 border-dashed border-white/5 hover:border-accentviolet rounded-xl p-6 text-center cursor-pointer transition-all duration-200 bg-white/[0.01] hover:bg-accentviolet/[0.02] mb-3">
            <input 
              type="file" 
              id="file-input"
              ref={fileInputRef} 
              accept=".pdf" 
              onChange={handleFileChange} 
              className="hidden"
            />
            <label htmlFor="file-input" className="flex flex-col items-center cursor-pointer">
              <FileUp className="text-gray-500 hover:text-accentviolet mb-3 transition-transform duration-200 hover:-translate-y-0.5" size={36} />
              <span className="text-[13px] font-medium text-gray-200 max-w-[240px] truncate">
                {file ? file.name : "Choose PDF file"}
              </span>
              <span className="text-[11px] text-gray-500 mt-1">Max size 20MB</span>
            </label>
          </div>

          {file && (
            <button 
              className="inline-flex items-center justify-center gap-2 font-semibold text-[13px] py-2.5 px-4 rounded-lg bg-gradient-to-r from-accentviolet to-accentindigo text-white shadow-[0_0_20px_rgba(124,58,237,0.25)] hover:shadow-[0_0_25px_rgba(124,58,237,0.4)] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed w-full"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  <span>Processing Document...</span>
                </>
              ) : (
                <>
                  <Upload size={16} />
                  <span>Index Document</span>
                </>
              )}
            </button>
          )}

          {/* Feedback Messages */}
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg text-[12px] leading-relaxed border mt-3 bg-red-500/5 border-red-500/20 text-red-400">
              <AlertCircle className="shrink-0 mt-0.5" size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg text-[12px] leading-relaxed border mt-3 bg-emerald-500/5 border-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="shrink-0 mt-0.5" size={16} />
              <span>{success}</span>
            </div>
          )}
        </div>

        {/* Document List */}
        <div className="p-6 flex-grow flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-[13px] font-semibold uppercase tracking-wider text-gray-200">
              Indexed Corpus ({uploadedFiles.length})
            </h3>
            {uploadedFiles.length > 0 && (
              <button 
                className="text-[12px] text-gray-500 hover:text-red-400 flex items-center gap-1 transition-colors duration-200 px-2 py-1 rounded hover:bg-red-400/10"
                onClick={handleClearDatabase}
                title="Clear all indexed files"
              >
                <Trash2 size={14} />
                <span>Clear DB</span>
              </button>
            )}
          </div>
          
          {uploadedFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-grow text-gray-500 p-5 border border-dashed border-white/5 rounded-xl bg-white/[0.005]">
              <Database size={24} className="mb-2 opacity-40" />
              <p className="text-[12px]">No documents uploaded yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 flex-grow overflow-y-auto pr-1 scrollable">
              {uploadedFiles.map((name, idx) => (
                <div key={idx} className="flex items-center gap-2.5 p-2.5 border border-white/5 bg-white/[0.015] hover:bg-white/[0.03] hover:border-white/10 rounded-lg transition-all duration-200 group">
                  <FileText className="text-accentviolet shrink-0" size={16} />
                  <span className="text-[13px] text-gray-200 truncate flex-grow" title={name}>
                    {name}
                  </span>
                  <button 
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded transition-all duration-200 text-gray-500"
                    onClick={(e) => handleDeleteDocument(name, e)}
                    title={`Delete ${name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 px-6 border-t border-white/5 bg-black/15">
          <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]"></span>
            <span>Groq API Connected</span>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-grow flex flex-col bg-darkbg h-full relative">
        {/* Chat Header */}
        <header className="py-6 px-8 border-b border-white/5 bg-darkbg/70 backdrop-blur-md z-10">
          <div>
            <h2 className="font-display text-[18px] font-semibold text-gray-100">Interactive Q&A Session</h2>
            <p className="text-[13px] text-gray-500 mt-1">Asking questions across the uploaded document collection using local semantic retrieval.</p>
          </div>
        </header>

        {/* Messages View */}
        <div className="flex-grow p-8 overflow-y-auto flex flex-col gap-6 bg-[radial-gradient(circle_at_top_right,_rgba(124,58,237,0.03),_transparent_40%),_radial-gradient(circle_at_bottom_left,_rgba(79,70,229,0.02),_transparent_40%)] scrollable">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex gap-4 max-w-[85%] animate-fade-in ${msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}
            >
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-gradient-to-r from-accentviolet to-accentindigo text-white border-none' : 'bg-cardbg border-white/5 text-gray-400'}`}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className={`flex flex-col gap-2 p-3.5 px-4.5 rounded-2xl text-[14px] leading-relaxed ${msg.role === 'user' ? 'bg-bubbleuser border border-white/5 text-gray-100 rounded-tr-none' : 'bg-cardbg/50 border border-white/5 text-gray-100 rounded-tl-none'}`}>
                  <FormattedText text={msg.text} />

                  {/* Sources visualization */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-dashed border-white/10">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                        Retrieved Reference Context:
                      </span>
                      <div className="flex flex-col gap-2">
                        {msg.sources.map((src, sIdx) => (
                          <div key={sIdx} className="bg-white/[0.02] border border-white/5 rounded-lg p-2.5">
                            <p className="text-[12px] text-gray-300 leading-relaxed">"{src.text}"</p>
                            <span className="text-[10px] text-accentviolet font-medium mt-1.5 block">
                              Source: {src.filename} — page {src.page}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <span className={`text-[10px] text-gray-500 mt-1 ${msg.role === 'user' ? 'self-end' : 'self-start'}`}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {querying && (
            <div className="flex gap-4 max-w-[85%] self-start">
              <div className="w-8 h-8 rounded-lg bg-cardbg border border-white/5 flex items-center justify-center shrink-0 text-gray-400 animate-pulse">
                <Bot size={16} />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3 p-3.5 px-4.5 rounded-2xl bg-cardbg/30 border border-white/5 text-gray-100 rounded-tl-none">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-accentviolet rounded-full typing-dot"></span>
                    <span className="w-1.5 h-1.5 bg-accentviolet rounded-full typing-dot"></span>
                    <span className="w-1.5 h-1.5 bg-accentviolet rounded-full typing-dot"></span>
                  </div>
                  <span className="text-[12px] text-gray-400">Thinking... Searching local vectors & generating answer</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Form */}
        <footer className="p-6 px-8 pb-8 bg-darkbg">
          <form onSubmit={handleQuery} className="flex gap-3 bg-cardbg border border-white/5 focus-within:border-accentviolet rounded-xl p-1.5 pl-4 items-center shadow-2xl transition-all duration-200 focus-within:shadow-[0_0_15px_rgba(124,58,237,0.15)]">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                uploadedFiles.length === 0 
                  ? "Upload a PDF first to begin..." 
                  : "Ask a question about the uploaded PDFs..."
              }
              className="flex-grow bg-transparent border-none text-gray-100 text-[14px] outline-none py-2.5 placeholder-gray-500 disabled:cursor-not-allowed"
              disabled={uploadedFiles.length === 0 || querying}
            />
            <button 
              type="submit" 
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-r from-accentviolet to-accentindigo text-white shadow-[0_0_20px_rgba(124,58,237,0.25)] hover:shadow-[0_0_25px_rgba(124,58,237,0.4)] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200" 
              disabled={!input.trim() || querying || uploadedFiles.length === 0}
            >
              <Send size={16} />
            </button>
          </form>
        </footer>
      </main>
    </div>
  );
}
