import React, { useState } from 'react';
import { X, PhoneCall, Volume2, ShieldCheck, CheckCircle2, AlertTriangle, Play, Square } from 'lucide-react';
import { api } from '../services/api';

interface VoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSymbol?: string;
  defaultPrice?: number;
}

export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  isOpen,
  onClose,
  defaultSymbol = 'RELIANCE.NS',
  defaultPrice = 2840.00,
}) => {
  const [phoneNumber, setPhoneNumber] = useState('+91 98765 43210');
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [price, setPrice] = useState(defaultPrice);
  const [alertReason, setAlertReason] = useState('Stop-loss triggered at -7.2% trailing threshold');
  const [loading, setLoading] = useState(false);
  const [callResult, setCallResult] = useState<any>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  if (!isOpen) return null;

  const spokenScript = `FinSight AI portfolio alert. Your holding in ${symbol} has triggered your configured risk threshold. The latest available price is Rupees ${price.toFixed(2)}. Reason: ${alertReason}. Please review your position in the FinSight AI dashboard.`;

  const handleTestCall = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setCallResult(null);

    try {
      const res = await api.voice.testCall({
        phone_number: phoneNumber,
        symbol,
        price,
        alert_reason: alertReason,
      });
      setCallResult(res);
      // Play speech synthesis simulation
      speakScript(spokenScript);
    } catch (err: any) {
      alert(`Call simulation error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const speakScript = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsPlayingAudio(true);
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <PhoneCall size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">AI Voice-Call Alert Center</h3>
              <p className="text-xs text-slate-500">Autonomous voice calls for critical portfolio risk events</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopSpeaking();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <form onSubmit={handleTestCall} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Recipient Verified Phone Number
              </label>
              <input
                type="text"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+14155552671"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Ticker</label>
                <input
                  type="text"
                  required
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trigger Price (₹ INR)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Risk Trigger Reason</label>
              <input
                type="text"
                required
                value={alertReason}
                onChange={(e) => setAlertReason(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            {/* Spoken Transcript Preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs">
              <div className="flex items-center justify-between text-slate-600 font-semibold mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Volume2 size={14} className="text-blue-600" />
                  Spoken Script Preview
                </span>
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">
                  TwiML Polly.Joanna
                </span>
              </div>
              <p className="text-slate-700 italic leading-relaxed">
                "{spokenScript}"
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => (isPlayingAudio ? stopSpeaking() : speakScript(spokenScript))}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                {isPlayingAudio ? (
                  <>
                    <Square size={13} className="text-rose-600 fill-rose-600" />
                    Stop Voice Playback
                  </>
                ) : (
                  <>
                    <Play size={13} className="text-blue-600 fill-blue-600" />
                    Play Audio Sample
                  </>
                )}
              </button>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50"
              >
                <PhoneCall size={16} />
                {loading ? 'Initiating Dispatch...' : 'Trigger Voice Call Alert'}
              </button>
            </div>
          </form>

          {/* Call Result Box */}
          {callResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-xs space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between font-bold text-emerald-800">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  Voice Alert Dispatched Successfully
                </span>
                <span className="font-mono text-[11px] text-emerald-700">{callResult.call_id}</span>
              </div>
              <div className="text-slate-600 space-y-1">
                <div><span className="font-semibold">Mode:</span> {callResult.mode === 'twilio_live' ? 'Twilio Live Telephony' : 'Verified Sandbox Audio Simulation'}</div>
                <div><span className="font-semibold">Recipient:</span> {callResult.to_phone}</div>
                <div><span className="font-semibold">Timestamp:</span> {callResult.timestamp}</div>
              </div>
              <p className="text-emerald-700 text-[11px]">
                {callResult.note || 'Audio synthesized via Web Speech engine for direct audition.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
