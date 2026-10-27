import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  ShieldCheck,
  TrendingUp,
  Clock,
  Compass,
  AlertCircle
} from 'lucide-react';
import { api } from '../services/api';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (profile: any) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({
    experience_level: 'Beginner',
    financial_objective: 'Wealth Creation',
    investment_horizon: '3-5 Years',
    risk_tolerance: 'Moderate',
    approximate_budget: '₹10,000 - ₹50,000',
    preferred_categories: ['Large Cap Equities', 'Index ETFs', 'Precious Metals'],
    product_interests: ['Equities', 'ETFs', 'Gold'],
    max_loss_tolerance_pct: 8.0,
    liquidity_need: 'Medium',
  });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      Promise.all([
        api.onboarding.getQuestions(),
        api.onboarding.getProfile().catch(() => null)
      ])
        .then(([qRes, pRes]) => {
          if (qRes?.questions) {
            setQuestions(qRes.questions);
          }
          if (pRes) {
            setAnswers({
              experience_level: pRes.experience_level || 'Beginner',
              financial_objective: pRes.financial_objective || 'Wealth Creation',
              investment_horizon: pRes.investment_horizon || '3-5 Years',
              risk_tolerance: pRes.risk_tolerance || 'Moderate',
              approximate_budget: pRes.approximate_budget || '₹10,000 - ₹50,000',
              preferred_categories: pRes.preferred_categories || ['Large Cap Equities', 'Index ETFs'],
              product_interests: pRes.product_interests || ['Equities', 'ETFs', 'Gold'],
              max_loss_tolerance_pct: pRes.max_loss_tolerance_pct || 8.0,
              liquidity_need: pRes.liquidity_need || 'Medium',
            });
          }
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentQ = questions[currentIndex];
  const progressPct = questions.length ? Math.round(((currentIndex + 1) / questions.length) * 100) : 0;

  const handleSelectOption = (qId: string, val: any) => {
    if (qId === 'preferred_categories') {
      const currentList: string[] = answers[qId] || [];
      if (currentList.includes(val)) {
        if (currentList.length > 1) {
          setAnswers({ ...answers, [qId]: currentList.filter(x => x !== val) });
        }
      } else {
        setAnswers({ ...answers, [qId]: [...currentList, val] });
      }
    } else {
      setAnswers({ ...answers, [qId]: val });
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.onboarding.updateProfile(answers);
      onComplete(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save investor profile');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                Beginner Investor Profiling
              </h2>
              <p className="text-xs text-slate-500">
                Personalizes Grow stock picks, risk models, and alert suggestions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 h-1.5">
          <div
            className="bg-blue-600 h-1.5 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          {loading || !currentQ ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Loading personalized questionnaire...
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                <span>QUESTION {currentIndex + 1} OF {questions.length}</span>
                <span>{progressPct}% COMPLETE</span>
              </div>

              <h3 className="text-lg font-bold text-slate-900 tracking-tight mb-1">
                {currentQ.question}
              </h3>
              <p className="text-xs text-slate-500 mb-6">
                {currentQ.description}
              </p>

              {/* Options */}
              <div className="space-y-3">
                {currentQ.options?.map((opt: any) => {
                  const isMulti = currentQ.id === 'preferred_categories';
                  const isSelected = isMulti
                    ? (answers[currentQ.id] || []).includes(opt.value)
                    : answers[currentQ.id] === opt.value;

                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => handleSelectOption(currentQ.id, opt.value)}
                      className={`w-full text-left p-4 rounded-xl border transition flex items-start justify-between ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/60 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="pr-4">
                        <div className={`text-sm font-bold ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                          {opt.label}
                        </div>
                        {opt.hint && (
                          <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                            {opt.hint}
                          </div>
                        )}
                      </div>
                      <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center border ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <CheckCircle2 size={14} className="stroke-[2.5]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0 || submitting}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border transition ${
              currentIndex === 0
                ? 'opacity-40 cursor-not-allowed border-slate-200 text-slate-400'
                : 'border-slate-300 text-slate-700 hover:bg-white'
            }`}
          >
            <ChevronLeft size={15} />
            Previous
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
          >
            {currentIndex === questions.length - 1 ? (
              submitting ? 'Saving Profile...' : 'Complete & Generate AI Discovery'
            ) : (
              <>
                Next
                <ChevronRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
