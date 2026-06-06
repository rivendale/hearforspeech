import { useState, useEffect, useRef } from 'react';
import { Brain, Sparkles, X } from 'lucide-react';
import { useStore } from '../store/useStore';

interface AIAssistant {
  capabilities: () => Promise<{ available: 'yes' | 'no' | 'readily' }>;
  create: (options?: { systemPrompt?: string }) => Promise<{
    prompt: (text: string) => Promise<string>;
  }>;
}

interface WindowWithAI extends Window {
  ai?: {
    assistant: AIAssistant;
  };
}

interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
}

export function ClinicalAICopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'bot',
      text: "Hi! I am your local-first Clinical AI Assistant. How can I help you support adolescent self-advocacy, calibrate target phonemes, or troubleshoot PWA settings?"
    }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const { hasLocalAI } = useStore();
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const generateLocalResponse = async (query: string): Promise<string> => {
    const globalWindow = window as unknown as WindowWithAI;
    if (globalWindow.ai && globalWindow.ai.assistant && hasLocalAI) {
      try {
        const assistant = await globalWindow.ai.assistant.create({
          systemPrompt: `You are a helpful, senior clinical AI assistant for Speech-Language Pathologists (SLPs) and parents working with adolescents (14-15 years old) on speech intelligibility. Your tone is professional, technical, and supportive. Use the AVT Clinical Cheat Sheet guidelines (e.g. Hardware Glitch analogy, collaborative intake boundaries, PCC metrics, and phonetic biofeedback). Limit answers to 3 concise bullet points or 1 short paragraph.`
        });
        const response = await assistant.prompt(query);
        return response;
      } catch (err) {
        console.error("Gemini Nano chat prompt failed, triggering fallback...", err);
      }
    }

    // Fallback klinical logic rules-engine
    const q = query.toLowerCase();
    
    if (q.includes('glitch') || q.includes('analogy') || q.includes('hardware')) {
      return "The Hardware Glitch Analogy: Frame speech intelligibility limits as a cochlear implant or acoustic transmission limitation, not a personal failure. This reduces adolescent defensiveness and builds a collaborative therapist-client alliance.";
    }
    
    if (q.includes('intake') || q.includes('alignment') || q.includes('boundary')) {
      return "10-Minute Intake Alignment Checklist:\n1. Establish clear boundaries (this is not child speech therapy, but training).\n2. Frame articulation as a hardware glitch.\n3. Utilize autonomy-supportive language ('we can try', 'let's calibrate') instead of directives.";
    }

    if (q.includes('r') && (q.includes('coarticulation') || q.includes('pinch') || q.includes('formant'))) {
      return "Rhotic /r/ Coarticulation Tips: To target F2/F3 formant pinching, instruct the student to bunch or retroflex the tongue tip. Visually adjust their vocal tract shape until their active peak dots on the biofeedback visualizer pinch into the F2/F3 horizontal template bands.";
    }

    if (q.includes('pwa') || q.includes('install') || q.includes('flag')) {
      return "PWA Setup Troubleshooting:\n1. Navigate to chrome://flags/#optimization-guide-on-device-model and select Enabled BypassPrefRequirement.\n2. Navigate to chrome://flags/#prompt-api-for-gemini-nano and select Enabled.\n3. Relaunch Chrome. Tap Safari's 'Share' > 'Add to Home Screen' on iOS, or 'Install App' banner on Android Chrome.";
    }

    if (q.includes('iep') || q.includes('goal') || q.includes('smart')) {
      return "Draft SMART Target:\n'The student will independently deploy rate control and coarticulation repair strategies to produce target sounds in conversational peer environments with 85% accuracy across 3 sessions, verified by SIT transcriptions.'";
    }

    if (q.includes('stress') || q.includes('noise') || q.includes('cafeteria') || q.includes('classroom')) {
      return "Environmental Stress Testing: Use the background noise simulator in the Biofeedback tab. SLPs can dynamically scale ambient hum/noise levels to test speech durability under realistic classroom distractions.";
    }

    return "I am here to assist with clinical articulation metrics, phoneme visual visualizers, and PWA setup. Try asking:\n- 'How do I teach /r/ coarticulation?'\n- 'Explain the Hardware Glitch analogy'\n- 'How do I configure Chrome Gemini Nano flags?'";
  };

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;
    
    const userMsg: ChatMessage = { sender: 'user', text: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInputVal('');
    setIsTyping(true);

    try {
      const botResponse = await generateLocalResponse(textToSend);
      setMessages(prev => [...prev, { sender: 'bot', text: botResponse }]);
    } catch {
      setMessages(prev => [...prev, { sender: 'bot', text: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSend(suggestion);
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-4 z-40 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-650 hover:to-purple-700 text-white rounded-full p-3.5 shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 min-h-[48px] min-w-[48px]"
        title="Open Clinical AI Copilot"
      >
        <Sparkles size={20} className={isOpen ? "rotate-45 transition-transform" : ""} />
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-pink-500"></span>
        </span>
      </button>

      {/* Floating Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 left-4 right-4 z-50 bg-slate-900 border border-slate-750 max-w-sm w-full mx-auto rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[460px] animate-slideUp font-sans">
          {/* Header */}
          <div className="bg-slate-800 border-b border-slate-700 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain size={18} className="text-indigo-400" />
              <div>
                <h4 className="font-extrabold text-xs text-slate-100 uppercase tracking-wider">Clinical AI Copilot</h4>
                <span className="text-[9px] text-slate-400 font-bold block text-left">
                  {hasLocalAI ? "Active: Local Gemini Nano" : "Simulation Fallback Engine"}
                </span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-200 p-1 min-h-[30px] min-w-[30px] flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/60 max-h-[250px]">
            {messages.map((m, idx) => (
              <div 
                key={idx} 
                className={`flex flex-col max-w-[85%] ${
                  m.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                }`}
              >
                <div className={`p-3 rounded-2xl text-xs leading-relaxed font-normal text-left ${
                  m.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-750'
                } whitespace-pre-line`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="mr-auto flex items-center gap-1 bg-slate-800 border border-slate-750 px-3 py-2.5 rounded-2xl rounded-tl-none text-[10px] text-slate-400 font-bold tracking-wider animate-pulse">
                Thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestion Chips */}
          <div className="bg-slate-900 border-t border-slate-800/80 px-3 py-2 flex gap-1.5 overflow-x-auto select-none no-scrollbar">
            <button 
              onClick={() => handleSuggestionClick("How do I teach /r/ coarticulation?")}
              className="text-[9px] font-bold bg-slate-800 border border-slate-750 text-indigo-400 hover:bg-slate-750 px-2.5 py-1.5 rounded-xl whitespace-nowrap transition"
            >
              /r/ Coarticulation
            </button>
            <button 
              onClick={() => handleSuggestionClick("Explain the hardware glitch analogy")}
              className="text-[9px] font-bold bg-slate-800 border border-slate-750 text-indigo-400 hover:bg-slate-750 px-2.5 py-1.5 rounded-xl whitespace-nowrap transition"
            >
              Glitch Analogy
            </button>
            <button 
              onClick={() => handleSuggestionClick("How do I configure Chrome flags?")}
              className="text-[9px] font-bold bg-slate-800 border border-slate-750 text-indigo-400 hover:bg-slate-750 px-2.5 py-1.5 rounded-xl whitespace-nowrap transition"
            >
              PWA AI flags
            </button>
          </div>

          {/* Input Panel */}
          <div className="p-3 bg-slate-900 border-t border-slate-805 flex gap-2">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(inputVal); }}
              placeholder="Ask the local copilot..."
              className="flex-1 bg-slate-950 border border-slate-750 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500 min-h-[36px]"
            />
            <button
              onClick={() => handleSend(inputVal)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-2 rounded-xl text-xs uppercase tracking-wider transition min-h-[36px]"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
