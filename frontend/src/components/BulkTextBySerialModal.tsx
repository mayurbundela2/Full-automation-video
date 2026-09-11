import React, { useState, useMemo } from 'react';
import { 
  X, ListOrdered, CheckCircle2, AlertTriangle, Sparkles, 
  FileText, Copy, ArrowRight, Loader2 
} from 'lucide-react';
import { Paragraph } from '../types';
import { api } from '../api';

interface BulkTextBySerialModalProps {
  batchId: number;
  paragraphs: Paragraph[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedItem {
  serialNumber: number;
  text: string;
  matchedParagraph?: Paragraph;
}

export const BulkTextBySerialModal: React.FC<BulkTextBySerialModalProps> = ({
  batchId,
  paragraphs,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [rawText, setRawText] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Map paragraphs by paragraph_number for fast O(1) lookup
  const paraMap = useMemo(() => {
    const map = new Map<number, Paragraph>();
    for (const p of paragraphs) {
      map.set(p.paragraph_number, p);
    }
    return map;
  }, [paragraphs]);

  // Live parse as user types or pastes
  const parsedItems = useMemo<ParsedItem[]>(() => {
    if (!rawText.trim()) return [];

    const results: ParsedItem[] = [];
    const lines = rawText.split('\n');
    let currentNum: number | null = null;
    let currentText = '';

    const linePattern = /^\s*(?:(?:Shot|Paragraph|Part|Scene|Item|S\.?\s*No\.?|Sr\.?\s*No\.?|No\.?)\s*)?\[?(\d+)\]?\s*[:.)\t—–-]\s*(.*)$/i;

    for (const line of lines) {
      const lineClean = line.trim();
      if (!lineClean) continue;

      const match = lineClean.match(linePattern);
      if (match) {
        if (currentNum !== null && currentText) {
          results.push({
            serialNumber: currentNum,
            text: currentText.trim(),
            matchedParagraph: paraMap.get(currentNum)
          });
        }
        currentNum = parseInt(match[1], 10);
        currentText = match[2].trim().replace(/^["']|["']$/g, '');
      } else if (currentNum !== null && !lineClean.startsWith('---') && !lineClean.startsWith('###')) {
        currentText += ' ' + lineClean.replace(/^["']|["']$/g, '');
      }
    }

    if (currentNum !== null && currentText) {
      results.push({
        serialNumber: currentNum,
        text: currentText.trim(),
        matchedParagraph: paraMap.get(currentNum)
      });
    }

    return results;
  }, [rawText, paraMap]);

  const matchedCount = useMemo(() => {
    return parsedItems.filter(item => Boolean(item.matchedParagraph)).length;
  }, [parsedItems]);

  if (!isOpen) return null;

  const handleApply = async () => {
    if (!parsedItems.length) {
      setError('Please paste a numbered list of on-screen texts.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.bulkUpdateOnScreenText(batchId, {
        raw_text: rawText,
        items: parsedItems.map(p => ({ serial_number: p.serialNumber, text: p.text }))
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update on-screen texts');
    } finally {
      setSaving(false);
    }
  };

  const sampleExample = `1. AAJ TUMNE KYA KHAYA?
2. SAB KUCH PAKAYA HUA THA
3. THE HIDDEN REALITY
4. 10 SAAL PEHLE...`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#0e1626] border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#131d31]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ListOrdered className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Extract On-Screen Text by Serial Number</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 font-bold">
                  AUTO-MATCH
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Paste your numbered on-screen captions to instantly assign them to matching shots.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Format Helper Chips */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="font-semibold text-white flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Accepted Formats:</span>
              </span>
              <button
                type="button"
                onClick={() => setRawText(sampleExample)}
                className="text-amber-400 hover:text-amber-300 font-mono text-[11px] hover:underline"
              >
                Insert Sample
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-mono text-slate-400">
              <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">1. Text</span>
              <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">Shot 1: Text</span>
              <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">Part 1 - Text</span>
              <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">1) Text</span>
              <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">1 [tab] Text (Excel/Sheets)</span>
            </div>
          </div>

          {/* Textarea Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Paste Numbered Text List:
            </label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={6}
              placeholder={`1. AAJ TUMNE KYA KHAYA?\n2: SAB KUCH PAKAYA HUA THA\nShot 3 - DO KADAM AAGE...`}
              className="w-full bg-[#090d16] border border-slate-700 focus:border-amber-500 rounded-xl p-3.5 text-xs font-mono text-amber-100 focus:outline-none resize-none leading-relaxed transition-colors placeholder:text-slate-600"
            />
          </div>

          {/* Error Banner */}
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Live Extracted Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                <span>Extracted Preview</span>
                <span className="text-[11px] font-mono font-bold text-amber-400">
                  ({parsedItems.length} parsed &bull; {matchedCount} matched to current project shots)
                </span>
              </span>
            </div>

            {parsedItems.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
                Paste your numbered list above to preview extracted captions and shot mapping.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1 rounded-xl border border-slate-800 p-2 bg-[#090d16]/70">
                {parsedItems.map((item, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800/80 text-xs font-mono"
                  >
                    <div className="flex items-center space-x-2 min-w-0 flex-1 mr-3">
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex-shrink-0">
                        #{item.serialNumber}
                      </span>
                      <span className="text-white truncate" title={item.text}>
                        "{item.text}"
                      </span>
                    </div>

                    <div className="flex-shrink-0">
                      {item.matchedParagraph ? (
                        <span className="inline-flex items-center space-x-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Shot {item.matchedParagraph.paragraph_number}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20" title="No matching shot with this number exists in this batch">
                          <AlertTriangle className="w-3 h-3" />
                          <span>No Shot #{item.serialNumber}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-[#131d31] flex items-center justify-between">
          <button
            type="button"
            onClick={() => setRawText('')}
            disabled={!rawText || saving}
            className="text-xs text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            Clear Text
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={saving || matchedCount === 0}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center space-x-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Applying Captions...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Apply to {matchedCount} Shots</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
